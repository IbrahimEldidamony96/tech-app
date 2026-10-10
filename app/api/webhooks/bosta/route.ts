import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapBostaState } from "@/lib/bosta";
import { applyBostaWebhookStatus } from "@/lib/shipment-service";

// شكل الـ payload ده مؤكد من التوثيق الرسمي (docs.bosta.co/docs/how-to/get-delivery-status-via-webhook)،
// مش تخمين. "state" رقم كود مش اسم نصي — لو غيّرت لوجيك الـ mapping
// راجع نفس الصفحة.
type BostaWebhookPayload = {
  _id: string;
  trackingNumber: string | number;
  state: number;
  businessReference?: string;
};

export async function POST(request: NextRequest) {
  // Bosta مفهاش توقيع (signature) موثّق للـ webhook، بس بتديك خيار تحط
  // "Authorization Key" مخصص من الـ Dashboard (Settings → API Integration
  // → Set Up Your Webhook) يتبعت كـ header مع كل نداء — احنا بنستخدم
  // header اسمه X-Webhook-Secret بدل query param، لأن ده اللي الـ
  // dashboard بيدعمه فعليًا (custom header)، مش query string.
  const secret = request.headers.get("x-webhook-secret");
  if (
    !process.env.BOSTA_WEBHOOK_SECRET ||
    secret !== process.env.BOSTA_WEBHOOK_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: BostaWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.trackingNumber && !payload._id) {
    console.warn("Bosta webhook: missing identifiers", payload);
    return NextResponse.json({ received: true });
  }

  const trackingNumber =
    payload.trackingNumber !== undefined
      ? String(payload.trackingNumber)
      : undefined;

  const shipment = await prisma.shipment.findFirst({
    where: trackingNumber
      ? { trackingNumber }
      : { bostaDeliveryId: payload._id },
  });

  if (!shipment) {
    console.warn("Bosta webhook: no matching shipment", {
      trackingNumber,
      bostaDeliveryId: payload._id,
    });
    return NextResponse.json({ received: true });
  }

  const order = await prisma.order.findUnique({
    where: { id: shipment.orderId },
    include: { shipment: true, payment: true, items: true },
  });

  if (!order) {
    return NextResponse.json({ received: true });
  }

  const mappedStatus = mapBostaState(payload.state);
  const rawState = String(payload.state);

  if (!mappedStatus) {
    // حالة مؤقتة/إدارية (Exception, Investigation, Archived, On hold) —
    // بنسجلها للمراجعة اليدوية من غير ما نغيّر status الرسمي
    await prisma.shipment.update({
      where: { orderId: order.id },
      data: { bostaRawState: rawState },
    });
    return NextResponse.json({ received: true });
  }

  await applyBostaWebhookStatus(order.id, order, mappedStatus, rawState);

  return NextResponse.json({ received: true });
}
