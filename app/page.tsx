import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getProductList } from "@/lib/queries/products";
import { getActiveSlidersForHomepage } from "@/lib/queries/sliders";
import { isSaleActive } from "@/lib/product-pricing";
import { StorefrontHome } from "@/components/storefront-home";
import type { AppLocale } from "@/i18n/request";

type SearchParams = Promise<{
  category?: string;
  search?: string;
  page?: string;
}>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const locale = (await getLocale()) as AppLocale;

  const [{ items, total, totalPages }, categories, slides] = await Promise.all([
    getProductList({ category: params.category, search: params.search, page, limit: 12 }),
    prisma.category.findMany({
      where: { OR: [{ parentId: null }, { products: { some: { isActive: true, deletedAt: null } } }] },
      orderBy: { nameEn: "asc" },
      select: { id: true, nameEn: true, nameAr: true, slug: true, parentId: true },
    }),
    getActiveSlidersForHomepage(),
  ]);

  const products = items.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => ({
      price: variant.price.toNumber(),
      salePrice: variant.salePrice?.toNumber() ?? null,
      saleActive: isSaleActive(variant),
      stock: variant.stock,
    })),
  }));

  return (
    <StorefrontHome
      products={products}
      categories={categories}
      slides={slides}
      locale={locale}
      search={params.search}
      activeCategory={params.category}
      page={page}
      total={total}
      totalPages={totalPages}
    />
  );
}
