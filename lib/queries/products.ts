import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { effectivePriceSql } from "@/lib/queries/effective-variants";

export type ProductListFilters = {
  category?: string; brand?: string; search?: string; minPrice?: number; maxPrice?: number;
  minRating?: number; inStock?: boolean; specification?: string; specificationValue?: string;
  sort?: "newest" | "name_asc" | "name_desc" | "price_asc" | "price_desc" | "rating_desc";
  page?: number; limit?: number;
};

export async function getProductList(filters: ProductListFilters = {}) {
  const { category, brand, search, minPrice, maxPrice, minRating, inStock, specification, specificationValue, sort = "newest", page = 1, limit = 20 } = filters;
  const empty = { items: [], total: 0, page, limit, totalPages: 0 };
  const conditions: Prisma.Sql[] = [Prisma.sql`p."isActive" = true AND p."deletedAt" IS NULL`];
  if (category) {
    const categories = await prisma.category.findMany({ select: { id: true, slug: true, parentId: true } });
    const selected = categories.find(c => c.slug === category);
    if (!selected) return empty;
    const ids = new Set([selected.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of categories) if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); changed = true; }
    }
    conditions.push(Prisma.sql`p."categoryId" IN (${Prisma.join([...ids])})`);
  }
  if (brand) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "Brand" b WHERE b.id = p."brandId" AND b.slug = ${brand})`);
  if (minRating !== undefined) conditions.push(Prisma.sql`p."averageRating" >= ${minRating}`);
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(Prisma.sql`(p."nameEn" ILIKE ${pattern} OR p."nameAr" ILIKE ${pattern}
      OR p."descriptionEn" ILIKE ${pattern} OR p."descriptionAr" ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM "Brand" b WHERE b.id = p."brandId" AND b.name ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "ProductVariant" sv WHERE sv."productId" = p.id AND sv.sku ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "ProductSpecification" s WHERE s."productId" = p.id AND
        (s."keyEn" ILIKE ${pattern} OR s."keyAr" ILIKE ${pattern} OR s."valueEn" ILIKE ${pattern} OR s."valueAr" ILIKE ${pattern})))`);
  }
  if (specification && specificationValue) conditions.push(Prisma.sql`
    EXISTS (SELECT 1 FROM "ProductSpecification" s WHERE s."productId" = p.id AND s."isFilterable" = true
      AND (s."keyEn" = ${specification} OR s."keyAr" = ${specification})
      AND (s."valueEn" = ${specificationValue} OR s."valueAr" = ${specificationValue}))`);

  const now = new Date();
  const price = effectivePriceSql(now);
  const variantConditions = [Prisma.sql`v."productId" = p.id AND v."isActive" = true`];
  if (minPrice !== undefined) variantConditions.push(Prisma.sql`${price} >= ${minPrice}`);
  if (maxPrice !== undefined) variantConditions.push(Prisma.sql`${price} <= ${maxPrice}`);
  if (inStock !== undefined) variantConditions.push(inStock ? Prisma.sql`v.stock > 0` : Prisma.sql`v.stock <= 0`);
  if (minPrice !== undefined || maxPrice !== undefined || inStock !== undefined) conditions.push(Prisma.sql`priced.id IS NOT NULL`);

  const from = Prisma.sql`FROM "Product" p LEFT JOIN LATERAL (
    SELECT v.id, ${price} AS amount FROM "ProductVariant" v
    WHERE ${Prisma.join(variantConditions, " AND ")} ORDER BY amount ASC, v.id ASC LIMIT 1
  ) priced ON true WHERE ${Prisma.join(conditions, " AND ")}`;
  const orderBy = {
    newest: Prisma.sql`p."createdAt" DESC, p.id ASC`,
    name_asc: Prisma.sql`p."nameEn" ASC, p.id ASC`,
    name_desc: Prisma.sql`p."nameEn" DESC, p.id ASC`,
    price_asc: Prisma.sql`priced.amount ASC NULLS LAST, p.id ASC`,
    price_desc: Prisma.sql`priced.amount DESC NULLS LAST, p.id ASC`,
    rating_desc: Prisma.sql`p."averageRating" DESC, p.id ASC`,
  }[sort];
  const [matches, counts] = await Promise.all([
    prisma.$queryRaw<{ id: string; variantId: string | null }[]>(Prisma.sql`
      SELECT p.id, priced.id AS "variantId" ${from} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
    prisma.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::int AS total ${from}`),
  ]);
  const total = counts[0]?.total ?? 0;
  if (!matches.length) return { ...empty, total, totalPages: Math.ceil(total / limit) };
  const ids = matches.map(row => row.id);
  const variantIds = matches.flatMap(row => row.variantId ? [row.variantId] : []);
  const items = await prisma.product.findMany({ where: { id: { in: ids } }, select: {
    id: true, nameEn: true, nameAr: true, slug: true, averageRating: true, reviewCount: true,
    images: { where: { isPrimary: true }, take: 1, select: { url: true, alt: true } },
    category: { select: { nameEn: true, nameAr: true, slug: true } }, brand: { select: { name: true, slug: true } },
    variants: { where: { id: { in: variantIds } }, select: { price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true, stock: true } },
  } });
  const byId = new Map(items.map(item => [item.id, item]));
  return { items: ids.flatMap(id => { const item = byId.get(id); return item ? [item] : []; }), total, page, limit, totalPages: Math.ceil(total / limit) };
}
