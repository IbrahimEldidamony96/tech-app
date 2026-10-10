import { prisma } from "@/lib/prisma";

// عمود مقابل lib/queries/admin-orders.ts، لكن ده بتاع اليوزر نفسه بس —
// مفيش user.name/email هنا لأننا عارفينه هو صاحب الصفحة أصلاً
export async function getOrdersForUser(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      total: true,
      createdAt: true,
    },
  });
}
