import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { canTransitionOrder } from "@/lib/order-state-machine";

type Params = { params: Promise<{ id: string }> };

// أوردرات الدفع عند الاستلام (COD) لازم طريقة تتقدم من PENDING لـ
// CONFIRMED من غير ما "تتأكد كدفع" — الكاش بيتحصّل وقت التسليم نفسه،
// مش دلوقتي. من غير الروت ده، الطريقة الوحيدة كانت زرار "Mark Payment
// Paid" اللي كان بيسجل أوردرات COD كأنها اتدفعت فعلاً وهي لسه هتتدفع
// كاش بعدين — نفس الباج اللي name-check بتاعنا اتكلم عنه قبل كده.
export async function POST(_request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("orders:write");
  if (error) return error;

  const { id } = await params;

  const result = await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
  const order = await tx.order.findUnique({
    where: { id },
    include: { payment: true },
  });
  if (!order) {
    return { kind: "missing" as const };
  }

  // paymentMethod مش field على Order نفسه — موجود على Payment المرتبط
  // بيه (order.payment.method). بنتحقق منه هنا من السيرفر برضه (مش بس
  // من الفرونت إند) عشان الروت ده يفضل مخصص لـ COD بس
  if (order.payment?.method !== "CASH_ON_DELIVERY") {
    return { kind: "method" as const };
  }

  if (!canTransitionOrder(order.status, "CONFIRMED") || order.payment.status !== "PENDING") {
    return { kind: "invalid" as const };
  }

  // paymentStatus عمدًا مش بيتلمس هنا — بيفضل PENDING لحد ما الكاش
  // فعلاً يتحصّل (أو الأدمن يستخدم "Mark Payment Paid" وقتها كأداة
  // تصحيح يدوي لو احتاج)
  const updated = await tx.order.update({
    where: { id },
    data: { status: "CONFIRMED" },
    select: { id: true, status: true, paymentStatus: true },
  });

  return { kind: "ok" as const, updated };
  });
  if (result.kind === "missing") return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (result.kind === "method") return NextResponse.json({ error: "This action is only for Cash on Delivery orders" }, { status: 400 });
  if (result.kind === "invalid") return NextResponse.json({ error: "Order or payment status changed. Reload and try again." }, { status: 409 });
  return NextResponse.json({ data: result.updated });
}
