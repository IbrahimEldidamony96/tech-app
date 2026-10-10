import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cancelOrderAndRestock } from "@/lib/order-cancellation";

export const dynamic = "force-dynamic";

const EXPIRY_MINUTES = Number(process.env.UNPAID_ORDER_EXPIRY_MINUTES) || 60;

// *** باج كان موجود: أوردر أونلاين (كارت/محفظة) بيحجز المخزون وقت
// الـ checkout فورًا، لكن لو العميل سابه من غير ما يدفع (قفل الصفحة،
// اتصاله انقطع)، مفيش أي حاجة بترجع المخزون تاني — بيفضل محجوز للأبد
// لعميل مش هيكمل الدفع خالص. بوت كمان يقدر يستنزف مخزون منتج معين
// بعمل checkout متكرر من غير دفع.
//
// الحل: job دوري (Vercel Cron) بينادي الـ endpoint ده كل شوية، يلاقي
// أي أوردر PENDING بدفع أونلاين (مش COD) لسه PENDING من فترة أطول من
// EXPIRY_MINUTES، ويلغيه بنفس منطق الإلغاء العادي (compare-and-set +
// رجوع مخزون + تحرير كوبون) — مفيش فرق عن إلغاء عادي غير إن محدش ضغط
// زرار، الوقت نفسه هو اللي "ضغط" الزرار.
//
// الحماية: Vercel Cron بيبعت Authorization: Bearer <CRON_SECRET> لو
// الهيدر متظبط في إعدادات الـ cron — من غيره أي حد يعرف الـ URL يقدر
// يلغي أوردرات بالجملة. لو CRON_SECRET مش متظبط في البيئة، الـ endpoint
// بيرفض تمامًا (بدل ما يفضل مفتوح بالغلط).
export async function GET(request: NextRequest) {
  const expectedAuth = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;
  if (!expectedAuth || request.headers.get("authorization") !== expectedAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - EXPIRY_MINUTES * 60 * 1000);

  const expiredOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoff },
      payment: {
        method: { not: "CASH_ON_DELIVERY" },
        status: "PENDING",
      },
    },
    include: { items: true },
    // حد أقصى معقول لكل تشغيلة — لو تراكم عدد كبير جدًا (مثلاً أول
    // مرة تشغيل الـ job بعد فترة طويلة)، بنكمل الباقي في التشغيلة الجاية
    // بدل ما نحاول نعالج آلاف الصفوف في request واحد
    take: 500,
  });

  let cancelledCount = 0;
  for (const order of expiredOrders) {
    const succeeded = await cancelOrderAndRestock(order);
    if (succeeded) cancelledCount++;
  }

  return NextResponse.json({
    checked: expiredOrders.length,
    cancelled: cancelledCount,
    cutoff: cutoff.toISOString(),
  });
}
