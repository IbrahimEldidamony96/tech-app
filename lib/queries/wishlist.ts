import { prisma } from "@/lib/prisma";
import { getOrCreateWishlist } from "@/lib/wishlist";

export async function getWishlistForUser(userId: string) {
  const wishlist = await getOrCreateWishlist(userId);

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
            where: { isActive: true },
            orderBy: { price: "asc" },
            take: 1,
            select: { price: true, stock: true },
          },
        },
      },
    },
  });
}
