import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPaymobTransactionHmac } from "@/lib/paymob";
import { createNotification } from "@/lib/notifications";

// Paymob بتبعت نتيجة الدفع هنا (نجاح أو فشل) — ده مصدر الحقيقة الوحيد،
// مش الـ redirect للعميل بعد الدفع (query params مش موثّقة/موقّعة).
// أي تحديث لازم يعدي من التحقق بالـ HMAC الأول.
export async function POST(request: NextRequest) {
  const receivedHmac = request.nextUrl.searchParams.get("hmac") ?? "";

  let body: { obj?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const obj = body.obj;
  if (!obj) {
    return NextResponse.json(
      { error: "Missing transaction object" },
      { status: 400 },
    );
  }

  let hmacValid: boolean;
  try {
    hmacValid = verifyPaymobTransactionHmac(obj, receivedHmac);
  } catch (err) {
    console.error("Paymob HMAC verification error", err);
    return NextResponse.json(
      { error: "HMAC verification failed" },
      { status: 500 },
    );
  }

  if (!hmacValid) {
    // مرفوضة — من غير ما نلمس أي حاجة في الداتابيز
    console.warn("Paymob webhook: invalid HMAC, rejecting");
    return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
  }

  // special_reference اللي بعتناه وقت إنشاء الـ intention (= order id بتاعنا)
  // بيرجع هنا متداخل جوه order.merchant_order_id، مش على المستوى الأول
  const order = obj.order as Record<string, unknown> | undefined;
  const merchantOrderId = order?.merchant_order_id as string | undefined;
  const paymobTransactionId = String(obj.id);

  if (!merchantOrderId) {
    console.warn("Paymob webhook: missing merchant_order_id", obj);
    return NextResponse.json({ received: true });
  }

  const isPending = obj.pending === true;
  const isSuccess = obj.success === true;
  const isRefundOrVoid = obj.is_refunded === true || obj.is_voided === true;

  // *** باج كان موجود: أي callback مش "success" كان بيتحط FAILED نهائي.
  // ده كان بيكسر حالتين حقيقيتين: (1) محفظة إلكترونية بترجع callback
  // مؤقت pending=true قبل النتيجة النهائية، و(2) عميل يفشل في محاولة
  // كارت ويعيد المحاولة بنجاح على نفس صفحة الدفع (Unified Checkout
  // بتسمح بأكتر من محاولة على نفس الـ intention). المرتين، الـ FAILED
  // كان بيقفل الشرط status:"PENDING" تحت، فالنجاح اللي بعده كان بيتجاهل
  // (count=0) — العميل يتخصم منه فعليًا والأوردر يفضل شايف إنه فشل.
  //
  // الحل: الـ webhook دلوقتي بس بيأكد نجاح (PAID) بشروط صارمة، أو ميعملش
  // حاجة خالص. الفشل الدائم بقى قرار يدوي من الأدمن (Mark Payment Failed)
  // أو من job مستقبلي بيلغي الأوردرات اللي فضلت من غير دفع لفترة طويلة —
  // مش قرار الـ webhook نفسه.
  if (isPending) {
    console.info(
      `Paymob webhook: interim pending callback for order ${merchantOrderId}, transaction ${paymobTransactionId} — no state change`,
    );
    return NextResponse.json({ received: true });
  }

  if (isRefundOrVoid) {
    // مفيش refund flow متكامل لسه (هيتعمل مع فيتشر المرتجعات) — بنسجل
    // بس عشان الأدمن يقدر يراجع يدوي، من غير ما نلمس حالة الدفع/الأوردر
    console.warn(
      `Paymob webhook: refund/void callback for order ${merchantOrderId}, transaction ${paymobTransactionId} — needs manual reconciliation (no automated refund flow yet)`,
    );
    return NextResponse.json({ received: true });
  }

  if (!isSuccess) {
    // محاولة فشلت (كارت مرفوض مثلاً) — مش بالضرورة نهاية القصة، العميل
    // لسه يقدر يعيد المحاولة (زرار "Complete Payment" على صفحة الأوردر).
    // فبنسيب الدفع PENDING زي ما هو، من غير ما نقفله.
    console.info(
      `Paymob webhook: declined attempt for order ${merchantOrderId}, transaction ${paymobTransactionId} — payment stays retryable`,
    );
    return NextResponse.json({ received: true });
  }

  // من هنا: success===true, pending===false, مش refund ولا void —
  // فعلاً محاولة دفع نجحت. قبل ما نصدقها، لازم نتأكد إنها بتتكلم عن
  // نفس المبلغ والعملة اللي إحنا طلبناهم، مش بس إن الـ HMAC توقيعه صحيح
  // (توقيع صحيح بيثبت إن Paymob هي اللي بعتت الرسالة، مش إن المبلغ
  // فيها هو اللي إحنا متوقعينه لنفس الأوردر ده بالذات).
  const orderRow = await prisma.order.findUnique({
    where: { id: merchantOrderId },
    select: { status: true, total: true, userId: true },
  });

  if (!orderRow) {
    console.warn(
      `Paymob webhook: order ${merchantOrderId} not found for transaction ${paymobTransactionId}`,
    );
    return NextResponse.json({ received: true });
  }

  // نفس الصيغة بالظبط اللي checkout استخدمها وقت إنشاء الـ intention
  // (Math.round(total * 100)) — لازم نتحقق بنفس الحساب عشان مانرفضش
  // دفعة صحيحة بسبب فرق تقريب، لا أكتر ولا أقل.
  const expectedCents = Math.round(orderRow.total.toNumber() * 100);
  const receivedCents = Number(obj.amount_cents);
  const amountMatches = receivedCents === expectedCents;
  const currencyMatches = obj.currency === "EGP"; // المتجر مصر بس دلوقتي

  if (!amountMatches || !currencyMatches) {
    console.error(
      `Paymob webhook: amount/currency MISMATCH for order ${merchantOrderId}, transaction ${paymobTransactionId} — expected ${expectedCents} EGP-cents, got ${receivedCents} ${obj.currency}. Refusing to mark paid; needs manual review.`,
    );
    return NextResponse.json({ received: true });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // نسجل حقيقة الدفع أولًا بشكل idempotent. Payment.status هو سجل
      // الحقيقة لما حصل عند مزود الدفع حتى لو الأوردر اتلغى في نفس اللحظة.
      const updatedPayment = await tx.payment.updateMany({
        where: { orderId: merchantOrderId, status: "PENDING" },
        data: {
          status: "PAID",
          transactionId: paymobTransactionId,
          paidAt: new Date(),
        },
      });

      if (updatedPayment.count === 0) return;

      // CAS على حالة الأوردر داخل نفس الـ transaction. لو cancel سبقنا،
      // count=0 وممنوع تمامًا "إحياء" الأوردر من CANCELLED إلى CONFIRMED.
      // لو إحنا سبقنا، paymentStatus=PAID يجعل cancelOrderAndRestock يرفض
      // أي إلغاء لاحق لحد ما يبقى عندنا refund flow حقيقي.
      const confirmedOrder = await tx.order.updateMany({
        where: {
          id: merchantOrderId,
          status: "PENDING",
          paymentStatus: "PENDING",
        },
        data: { status: "CONFIRMED", paymentStatus: "PAID" },
      });

      if (confirmedOrder.count > 0) {
        await tx.orderEvent.create({ data: { orderId: merchantOrderId, status: "CONFIRMED", title: "Payment confirmed", description: "Your online payment was received." } });
        await createNotification(tx, { userId: orderRow.userId, type: "PAYMENT", title: "Payment received", message: `Payment for order ${merchantOrderId} was confirmed.`, link: `/orders/${merchantOrderId}` });
      }

      if (confirmedOrder.count === 0) {
        // الدفع حصل فعلًا، فنسجل ده على snapshot الدفع في الأوردر حتى لو
        // حالته CANCELLED/غير قابلة للتأكيد. لا نرجع مخزون ولا نغير status.
        await tx.order.updateMany({
          where: { id: merchantOrderId, paymentStatus: "PENDING" },
          data: { paymentStatus: "PAID" },
        });
        console.error(
          `Paymob webhook: payment confirmed PAID for order ${merchantOrderId}, but the order could not atomically transition from PENDING to CONFIRMED. It may have been cancelled concurrently — manual refund/reconciliation is required.`,
        );
      }
    });

  } catch (err) {
    // مثلاً P2002 لو transactionId اتكرر بشكل غريب على أوردر تاني —
    // نرجع non-2xx عشان Paymob تعيد المحاولة بدل ما نسيب حاجة تضيع
    console.error("Paymob webhook processing failed", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 503 });
  }

  return NextResponse.json({ received: true });
}
