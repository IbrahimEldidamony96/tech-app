import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import {
  canTransitionPayment,
  canTransitionOrder,
} from "@/lib/order-state-machine";

type Params = { params: Promise<{ id: string }> };

// ملحوظة: ده دلوقتي أداة تصحيح يدوي احتياطية للأدمن (مثلاً لو webhook
// من Paymob اتأخر أو ضاع)، مش المسار الأساسي — الدفع الحقيقي بالكارت/
// المحفظة بيتأكد تلقائي عن طريق app/api/webhooks/paymob بعد التحقق
// بالـ HMAC. لو الأدمن دوس هنا يدوي، إحنا بنثق فيه إنه شافظ فعلاً حصل
// (مثلاً حوّلة بنكية يدوية) — مفيش تحقق فعلي هنا.
export async function POST(_request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("orders:write");
  if (error) return error;

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { payment: true },
  });
  if (!order || !order.payment) {
    return NextResponse.json(
      { error: "Order or payment not found" },
      { status: 404 },
    );
  }

  if (!canTransitionPayment(order.payment.status, "PAID")) {
    return NextResponse.json(
      {
        error: `Cannot mark payment as PAID from status ${order.payment.status}`,
      },
      { status: 409 },
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { orderId: id },
      data: { status: "PAID", paidAt: new Date() },
    });

    return tx.order.update({
      where: { id },
      data: {
        paymentStatus: "PAID",
        // الدفع نجح يقفل الأوردر من PENDING لـ CONFIRMED تلقائي —
        // بس لو كان أصلاً في حالة تانية (اتلغى مثلاً)، منسيبوش يتحرك
        ...(canTransitionOrder(order.status, "CONFIRMED") && {
          status: "CONFIRMED",
        }),
      },
      select: { id: true, status: true, paymentStatus: true },
    });
  });

  return NextResponse.json({ data: result });
}
