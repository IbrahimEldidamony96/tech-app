import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { paymentStatusesThatCanReach } from "@/lib/order-state-machine";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("orders:write");
  if (error) return error;

  const { id } = await params;

  const order = await prisma.order.findUnique({ where: { id }, include: { payment: true, items: true } });
  if (!order || !order.payment) {
    return NextResponse.json({ error: "Order or payment not found" }, { status: 404 });
  }

  // فشل الدفع = الأوردر بيتلغي، والمخزون اللي اتحجز وقت الـ checkout
  // (Phase 5) لازم يرجع تاني — نفس فكرة التحديث الذرّي، بالعكس هنا.
  // updateMany بشرط status الحالي (compare-and-set) بدل findUnique+update:
  // لو حد ضغط الزرار مرتين، أو الـ webhook وصل لنفس اللحظة، مين ما سبق
  // بس هو اللي يرجّع المخزون — مش الاتنين.
  const { count } = await prisma.$transaction(async (tx) => {
    const result = await tx.payment.updateMany({
      where: { orderId: id, status: { in: paymentStatusesThatCanReach("FAILED") } },
      data: { status: "FAILED" },
    });
    if (result.count > 0) {
      await tx.order.update({ where: { id }, data: { paymentStatus: "FAILED", status: "CANCELLED" } });
      for (const item of order.items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      }
      if (order.couponId) {
        await tx.coupon.updateMany({
          where: { id: order.couponId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        });
      }
    }
    return result;
  });

  if (count === 0) {
    return NextResponse.json(
      { error: `Cannot mark payment as FAILED from status ${order.payment.status}` },
      { status: 409 }
    );
  }

  return NextResponse.json({ data: { id, status: "CANCELLED", paymentStatus: "FAILED" } });
}
