import { prisma } from "@/lib/prisma";

export async function getAllProductsForAdmin(includeArchived = false) {
  return prisma.product.findMany({
    where: includeArchived ? undefined : { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, nameEn: true, nameAr: true, slug: true, isActive: true, deletedAt: true,
      startingPrice: true, averageRating: true, reviewCount: true,
      category: { select: { nameEn: true, nameAr: true } },
      brand: { select: { name: true } },
      variants: { select: { stock: true } },
      images: { where: { isPrimary: true }, take: 1, select: { url: true } },
    },
  });
}

export async function getProductForAdminEdit(id: string) {
  return prisma.product.findUnique({
    where: { id },
    select: {
      id: true, nameEn: true, nameAr: true, slug: true,
      descriptionEn: true, descriptionAr: true,
      metaTitleEn: true, metaTitleAr: true, metaDescriptionEn: true, metaDescriptionAr: true,
      categoryId: true, brandId: true, isActive: true, deletedAt: true,
      specifications: { orderBy: [{ sortOrder: "asc" }, { keyEn: "asc" }] },
      images: { orderBy: { sortOrder: "asc" }, select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true } },
    },
  });
}
