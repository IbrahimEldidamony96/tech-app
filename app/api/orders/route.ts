import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const orders = await prisma.order.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      subtotal: true,
      discount: true,
      shippingCost: true,
      total: true,
      createdAt: true,
      items: { select: { productName: true, quantity: true, unitPrice: true } },
    },
  });

  return NextResponse.json({ data: orders });
}
