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

  const order = await prisma.order.findUnique({
    where: { id },
    include: { payment: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // paymentMethod مش field على Order نفسه — موجود على Payment المرتبط
  // بيه (order.payment.method). بنتحقق منه هنا من السيرفر برضه (مش بس
  // من الفرونت إند) عشان الروت ده يفضل مخصص لـ COD بس
  if (order.payment?.method !== "CASH_ON_DELIVERY") {
    return NextResponse.json(
      { error: "This action is only for Cash on Delivery orders" },
      { status: 400 },
    );
  }

  if (!canTransitionOrder(order.status, "CONFIRMED")) {
    return NextResponse.json(
      { error: `Cannot confirm an order from status ${order.status}` },
      { status: 409 },
    );
  }

  // paymentStatus عمدًا مش بيتلمس هنا — بيفضل PENDING لحد ما الكاش
  // فعلاً يتحصّل (أو الأدمن يستخدم "Mark Payment Paid" وقتها كأداة
  // تصحيح يدوي لو احتاج)
  const result = await prisma.order.update({
    where: { id },
    data: { status: "CONFIRMED" },
    select: { id: true, status: true, paymentStatus: true },
  });

  return NextResponse.json({ data: result });
}
