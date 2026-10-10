import { prisma } from "@/lib/prisma";

export async function syncProductStartingPrice(productId: string) {
  const first = await prisma.productVariant.findFirst({
    where: { productId, isActive: true },
    orderBy: { price: "asc" },
    select: { price: true },
  });
  await prisma.product.update({ where: { id: productId }, data: { startingPrice: first?.price ?? null } });
}

export async function syncProductRating(productId: string) {
  const result = await prisma.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { rating: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: { averageRating: result._avg.rating ?? 0, reviewCount: result._count.rating },
  });
}
