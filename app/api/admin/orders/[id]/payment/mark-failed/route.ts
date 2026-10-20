import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { cancelOrderAndRestock } from "@/lib/order-cancellation";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("orders:write");
  if (error) return error;

  const { id } = await params;
  const exists = await prisma.order.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // A manual failure is valid only for an unfulfilled PENDING online order.
  // Shared cancellation logic locks Order first, then Payment, and records
  // stock/loyalty/audit side effects once in the SAME transaction.
  const succeeded = await cancelOrderAndRestock(
    { id },
    ["PENDING"],
    { markPaymentFailed: true },
  );

  if (!succeeded) {
    return NextResponse.json({
      error: "Only a pending, uncaptured online payment can be marked failed",
    }, { status: 409 });
  }

  return NextResponse.json({ data: { id, status: "CANCELLED", paymentStatus: "FAILED" } });
}
