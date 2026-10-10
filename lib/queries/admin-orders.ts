import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/app/generated/prisma/client";

export async function getAllOrders(status?: OrderStatus) {
  return prisma.order.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      total: true,
      createdAt: true,
      shippingFirstName: true,
      shippingLastName: true,
      user: { select: { name: true, email: true } },
    },
  });
}
