import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
export async function syncProductStartingPrice(productId: string, db: Pick<Prisma.TransactionClient, "productVariant" | "product"> = prisma) {
  const first = await db.productVariant.findFirst({ where: { productId, isActive: true }, orderBy: { price: "asc" }, select: { price: true } });
  await db.product.update({ where: { id: productId }, data: { startingPrice: first?.price ?? null } });
}
async function updateRating(tx: Prisma.TransactionClient, productId: string) {
  const result = await tx.review.aggregate({ where: { productId }, _avg: { rating: true }, _count: { rating: true } });
  await tx.product.update({ where: { id: productId }, data: { averageRating: result._avg.rating ?? 0, reviewCount: result._count.rating } });
}
export async function withProductReviewLock<T>(productId: string, mutate: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
    const value = await mutate(tx);
    await updateRating(tx, productId);
    return value;
  });
}
export async function syncProductRating(productId: string) {
  await withProductReviewLock(productId, async () => undefined);
}
