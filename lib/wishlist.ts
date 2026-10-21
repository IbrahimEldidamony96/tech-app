import { prisma } from "@/lib/prisma";

export async function getOrCreateWishlist(userId: string) {
  await prisma.wishlist.createMany({ data: { userId }, skipDuplicates: true });
  return prisma.wishlist.findUniqueOrThrow({ where: { userId } });
}
