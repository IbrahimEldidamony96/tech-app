import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inquirePaymobTransaction, PaymobApiError, verifiedPaymobCapture, verifyPaymobTransactionHmac } from "@/lib/paymob";
import { createNotification } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("obj" in body) ||
      !body.obj || typeof body.obj !== "object" || Array.isArray(body.obj)) {
    return NextResponse.json({ error: "Missing transaction object" }, { status: 400 });
  }
  const obj = body.obj as Record<string, unknown>;
  try {
    if (!verifyPaymobTransactionHmac(obj, request.nextUrl.searchParams.get("hmac") ?? "")) {
      return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
    }
    if (obj.pending !== false || obj.success !== true || obj.is_refunded === true ||
        obj.is_voided === true || (obj.is_auth === true && obj.is_capture !== true)) {
      return NextResponse.json({ received: true });
    }
    const capture = verifiedPaymobCapture(obj, await inquirePaymobTransaction(String(obj.id)));
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${capture.orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: capture.orderId }, include: { payment: true } });
      if (!order?.payment) throw new PaymobApiError("Payment order not found", 409);
      const expectedIntegration = order.payment.method === "CARD" ? process.env.PAYMOB_INTEGRATION_ID_CARD
        : order.payment.method === "WALLET" ? process.env.PAYMOB_INTEGRATION_ID_WALLET : null;
      if (!expectedIntegration || capture.integrationId !== expectedIntegration ||
          capture.amountCents !== Math.round(order.total.toNumber() * 100) ||
          capture.amountCents !== Math.round(order.payment.amount.toNumber() * 100)) {
        throw new PaymobApiError("Payment does not match the order amount or method", 409);
      }
      if (order.payment.transactionId === capture.transactionId) return;
      if (order.payment.status !== "PENDING" && order.payment.status !== "FAILED") {
        throw new PaymobApiError("Order already has a different settled payment", 409);
      }
      await tx.payment.update({ where: { id: order.payment.id }, data: {
        status: "PAID", transactionId: capture.transactionId, paidAt: new Date(),
      } });
      const nextStatus = order.status === "PENDING" ? "CONFIRMED" : order.status;
      await tx.order.update({ where: { id: order.id }, data: { status: nextStatus, paymentStatus: "PAID" } });
      const late = order.status === "CANCELLED";
      await tx.orderEvent.create({ data: {
        orderId: order.id, status: nextStatus,
        title: late ? "Payment received after cancellation" : "Payment confirmed",
        description: late ? "Refund reconciliation is required from the order refund controls." : "Your online payment was received.",
      } });
      await createNotification(tx, { userId: order.userId, type: "PAYMENT",
        title: late ? "Payment needs a refund" : "Payment received",
        message: late ? `Order ${order.id} was already cancelled. Contact support for your refund.` : `Payment for order ${order.id} was confirmed.`,
        link: `/orders/${order.id}`,
      });
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof PaymobApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status === 409 || error.status === 400 ? error.status : 503 });
    }
    console.error("Paymob callback processing failed", error);
    return NextResponse.json({ error: "Payment verification unavailable" }, { status: 503 });
  }
}
