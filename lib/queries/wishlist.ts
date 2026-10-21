import { prisma } from "@/lib/prisma";
import { getOrCreateWishlist } from "@/lib/wishlist";
import { cheapestVariantIds } from "@/lib/queries/effective-variants";

export async function getWishlistForUser(userId: string) {
  const wishlist = await getOrCreateWishlist(userId);
  const productIds = await prisma.wishlistItem.findMany({ where: { wishlistId: wishlist.id }, select: { productId: true } });
  const chosen = await cheapestVariantIds(productIds.map(row => row.productId));

  return prisma.wishlistItem.findMany({
    where: { wishlistId: wishlist.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      product: {
        select: {
          id: true,
          nameEn: true,
          nameAr: true,
          slug: true,
          isActive: true,
          images: { where: { isPrimary: true }, take: 1, select: { url: true } },
          variants: {
            where: { id: { in: chosen.map(row => row.id) } },
            take: 1,
            select: { price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true, stock: true },
          },
        },
      },
    },
  });
}
