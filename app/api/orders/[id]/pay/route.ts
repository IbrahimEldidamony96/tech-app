import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import {
  createIntention,
  paymobCheckoutUrl,
  PaymobApiError,
} from "@/lib/paymob";
import { getAppOrigin } from "@/lib/app-url";

type Params = { params: Promise<{ id: string }> };

// بيولّد رابط دفع جديد لأوردر قايم — لازم لأن client_secret بتاع
// Paymob استخدام واحد بس وبينتهي، فلو العميل قفل صفحة الدفع أو حصل
// فشل، محتاج طريقة "يكمّل الدفع" تاني بدون ما يعمل أوردر جديد من الصفر
export async function POST(_request: NextRequest, { params }: Params) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { payment: true },
  });

  if (!order || order.userId !== session!.user.id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!order.payment || order.payment.method === "CASH_ON_DELIVERY") {
    return NextResponse.json(
      { error: "This order does not require online payment" },
      { status: 409 },
    );
  }
  if (order.payment.status !== "PENDING") {
    return NextResponse.json(
      { error: `Payment already ${order.payment.status.toLowerCase()}` },
      { status: 409 },
    );
  }

  const integrationId =
    order.payment.method === "CARD"
      ? process.env.PAYMOB_INTEGRATION_ID_CARD
      : process.env.PAYMOB_INTEGRATION_ID_WALLET;

  if (!integrationId) {
    return NextResponse.json(
      { error: `Payment method ${order.payment.method} is not configured` },
      { status: 500 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: order.userId },
      select: { email: true },
    });
    const origin = getAppOrigin(_request);

    const { clientSecret } = await createIntention({
      amountCents: Math.round(order.total.toNumber() * 100),
      specialReference: order.id,
      integrationId: Number(integrationId),
      billing: {
        firstName: order.shippingFirstName,
        lastName: order.shippingLastName,
        email: user?.email ?? "customer@techstore.com",
        phone: order.shippingPhone,
        street: order.shippingStreet,
        building: order.shippingBuildingNo ?? undefined,
        apartment: order.shippingApartment ?? undefined,
        city: order.shippingCity,
      },
      notes: `Tech Store order ${order.id}`,
      notificationUrl: `${origin}/api/webhooks/paymob`,
      redirectionUrl: `${origin}/orders/${order.id}`,
    });

    return NextResponse.json({
      data: { checkoutUrl: paymobCheckoutUrl(clientSecret) },
    });
  } catch (err) {
    const message =
      err instanceof PaymobApiError || err instanceof Error
        ? err.message
        : "Could not start payment";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
