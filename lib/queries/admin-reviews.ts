import { prisma } from "@/lib/prisma";

export async function getAllReviewsForAdmin() {
  return prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      product: { select: { nameEn: true, nameAr: true, slug: true } },
    },
  });
}
