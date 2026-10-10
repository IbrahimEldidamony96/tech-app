import { prisma } from "@/lib/prisma";

export async function getProductBySlug(slug: string) {
  return prisma.product.findUnique({
    where: { slug, isActive: true, deletedAt: null },
    select: {
      id: true,
      nameEn: true,
      nameAr: true,
      descriptionEn: true,
      descriptionAr: true,
      slug: true,
      metaTitleEn: true,
      metaTitleAr: true,
      metaDescriptionEn: true,
      metaDescriptionAr: true,
      averageRating: true,
      reviewCount: true,
      category: { select: { nameEn: true, slug: true } },
      brand: { select: { name: true, slug: true } },
      images: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, url: true, alt: true, isPrimary: true },
      },
      options: {
        select: {
          id: true,
          nameEn: true,
          nameAr: true,
          values: { select: { id: true, valueEn: true, valueAr: true } },
        },
      },
      specifications: { orderBy: { sortOrder: "asc" }, select: { id: true, keyEn: true, keyAr: true, valueEn: true, valueAr: true, isFilterable: true } },
      variants: {
        where: { isActive: true },
        select: {
          id: true,
          sku: true,
          price: true,
          salePrice: true,
          saleStartsAt: true,
          saleEndsAt: true,
          stock: true,
          optionValues: { select: { optionValueId: true } },
        },
      },
    },
  });
}
