import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { canTransitionPayment, canTransitionOrder } from "@/lib/order-state-machine";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("orders:write");
  if (error) return error;
  const { id } = await params;

  // Order is ALWAYS locked before Payment, including the Paymob webhook and
  // expiry cancellation. Re-read the payment after acquiring this lock.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id },
      include: { payment: true },
    });
    if (!order || !order.payment) return { kind: "missing" as const };
    if (order.status === "CANCELLED" ||
        !canTransitionPayment(order.payment.status, "PAID")) {
      return { kind: "invalid" as const };
    }

    await tx.payment.update({
      where: { orderId: id },
      data: { status: "PAID", paidAt: new Date() },
    });
    const updated = await tx.order.update({
      where: { id },
      data: {
        paymentStatus: "PAID",
        ...(canTransitionOrder(order.status, "CONFIRMED") ? { status: "CONFIRMED" as const } : {}),
      },
      select: { id: true, status: true, paymentStatus: true },
    });
    return { kind: "ok" as const, updated };
  });

  if (result.kind === "missing") {
    return NextResponse.json({ error: "Order or payment not found" }, { status: 404 });
  }
  if (result.kind === "invalid") {
    return NextResponse.json({ error: "Cannot mark a cancelled or already settled order paid" }, { status: 409 });
  }
  return NextResponse.json({ data: result.updated });
}
