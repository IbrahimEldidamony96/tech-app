import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

export type ProductListFilters = {
  category?: string;
  brand?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  specification?: string;
  specificationValue?: string;
  sort?: "newest" | "name_asc" | "name_desc" | "price_asc" | "price_desc" | "rating_desc";
  page?: number;
  limit?: number;
};

export async function getProductList(filters: ProductListFilters = {}) {
  const {
    category, brand, search, minPrice, maxPrice, minRating, inStock,
    specification, specificationValue, sort = "newest", page = 1, limit = 20,
  } = filters;

  const where: Prisma.ProductWhereInput = { isActive: true, deletedAt: null };

  if (category) {
    const categories = await prisma.category.findMany({ select: { id: true, slug: true, parentId: true } });
    const selected = categories.find((item) => item.slug === category);
    if (!selected) return { items: [], total: 0, page, limit, totalPages: 0 };
    const descendantIds = new Set<string>([selected.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of categories) {
        if (item.parentId && descendantIds.has(item.parentId) && !descendantIds.has(item.id)) {
          descendantIds.add(item.id); changed = true;
        }
      }
    }
    where.categoryId = { in: [...descendantIds] };
  }
  if (brand) where.brand = { slug: brand };
  if (minRating !== undefined) where.averageRating = { gte: minRating };

  if (search) {
    where.OR = [
      { nameEn: { contains: search, mode: "insensitive" } },
      { nameAr: { contains: search, mode: "insensitive" } },
      { descriptionEn: { contains: search, mode: "insensitive" } },
      { descriptionAr: { contains: search, mode: "insensitive" } },
      { brand: { name: { contains: search, mode: "insensitive" } } },
      { variants: { some: { sku: { contains: search, mode: "insensitive" } } } },
      { specifications: { some: { OR: [
        { keyEn: { contains: search, mode: "insensitive" } },
        { keyAr: { contains: search, mode: "insensitive" } },
        { valueEn: { contains: search, mode: "insensitive" } },
        { valueAr: { contains: search, mode: "insensitive" } },
      ] } } },
    ];
  }

  const variantConditions: Prisma.ProductVariantWhereInput = { isActive: true };
  if (minPrice !== undefined || maxPrice !== undefined) {
    variantConditions.price = {
      ...(minPrice !== undefined ? { gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
    };
  }
  if (inStock === true) variantConditions.stock = { gt: 0 };
  if (inStock === false) variantConditions.stock = { lte: 0 };
  if (minPrice !== undefined || maxPrice !== undefined || inStock !== undefined) {
    where.variants = { some: variantConditions };
  }

  if (specification && specificationValue) {
    where.specifications = { some: {
      isFilterable: true,
      OR: [{ keyEn: specification }, { keyAr: specification }],
      AND: [{ OR: [{ valueEn: specificationValue }, { valueAr: specificationValue }] }],
    } };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sort === "name_asc" ? { nameEn: "asc" } :
    sort === "name_desc" ? { nameEn: "desc" } :
    sort === "price_asc" ? { startingPrice: "asc" } :
    sort === "price_desc" ? { startingPrice: "desc" } :
    sort === "rating_desc" ? { averageRating: "desc" } :
    { createdAt: "desc" };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where, orderBy, skip: (page - 1) * limit, take: limit,
      select: {
        id: true, nameEn: true, nameAr: true, slug: true, averageRating: true, reviewCount: true,
        images: { where: { isPrimary: true }, take: 1, select: { url: true, alt: true } },
        category: { select: { nameEn: true, nameAr: true, slug: true } },
        brand: { select: { name: true, slug: true } },
        variants: {
          where: variantConditions,
          orderBy: { price: "asc" }, take: 1,
          select: { price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true, stock: true },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}
