import { prisma } from "@/lib/prisma";

export async function getAllCouponsForAdmin() {
  return prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export type AdminCouponRow = Awaited<ReturnType<typeof getAllCouponsForAdmin>>[number];
