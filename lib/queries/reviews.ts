import { prisma } from "@/lib/prisma";

export async function getProductReviews(productId: string, page = 1, limit = 10) {
  const [items, total, ratingAgg, ratingBreakdown] = await Promise.all([
    prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.review.count({ where: { productId } }),
    prisma.review.aggregate({ where: { productId }, _avg: { rating: true } }),
    prisma.review.groupBy({ by: ["rating"], where: { productId }, _count: true }),
  ]);

  const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of ratingBreakdown) breakdown[row.rating] = row._count;

  return {
    items,
    total,
    average: ratingAgg._avg.rating ?? 0,
    breakdown,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
