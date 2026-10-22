import { prisma } from "@/lib/prisma";
import { cheapestVariantIds } from "@/lib/queries/effective-variants";
export async function getRecentlyViewed(userId: string) {
  const where = { userId, product: { isActive: true, deletedAt: null } };
  const rows = await prisma.recentlyViewed.findMany({ where, orderBy: { viewedAt: "desc" }, take: 30, select: { productId: true } });
  const chosen = await cheapestVariantIds(rows.map(row => row.productId));
  return prisma.recentlyViewed.findMany({ where: { ...where, productId: { in: rows.map(row => row.productId) } },
    orderBy: { viewedAt: "desc" }, include: { product: { select: {
      id: true, slug: true, nameEn: true, nameAr: true, brand: { select: { name: true } },
      images: { where: { isPrimary: true }, take: 1, select: { url: true, alt: true } },
      variants: { where: { id: { in: chosen.map(row => row.id) } }, take: 1,
        select: { price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true, stock: true } },
    } } },
  });
}
