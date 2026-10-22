import type { Prisma } from "@/app/generated/prisma/client";
import { PaymobApiError, verifiedPaymobCapture } from "@/lib/paymob";
import { createNotification } from "@/lib/notifications";

export async function recordVerifiedCapture(tx: Prisma.TransactionClient, capture: ReturnType<typeof verifiedPaymobCapture>) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${capture.orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: capture.orderId }, include: { payment: true } });
  if (!order?.payment) throw new PaymobApiError("Payment order not found", 409);
  const expected = order.payment.method === "CARD" ? process.env.PAYMOB_INTEGRATION_ID_CARD
    : order.payment.method === "WALLET" ? process.env.PAYMOB_INTEGRATION_ID_WALLET : null;
  if (!expected || capture.integrationId !== expected ||
      capture.amountCents !== Math.round(order.total.toNumber() * 100) ||
      capture.amountCents !== Math.round(order.payment.amount.toNumber() * 100)) {
    throw new PaymobApiError("Payment does not match the order amount or method", 409);
  }
  if (order.payment.transactionId === capture.transactionId && ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.payment.status)) return order;
  const repair = order.payment.status === "PAID" && !order.payment.transactionId;
  if (!repair && !["PENDING", "FAILED"].includes(order.payment.status)) {
    throw new PaymobApiError("Order already has a different settled payment", 409);
  }
  await tx.payment.update({ where: { id: order.payment.id }, data: {
    status: "PAID", transactionId: capture.transactionId, paidAt: order.payment.paidAt ?? new Date(),
  } });
  const nextStatus = order.status === "PENDING" ? "CONFIRMED" : order.status;
  const updated = await tx.order.update({ where: { id: order.id }, data: { status: nextStatus, paymentStatus: "PAID" } });
  const late = order.status === "CANCELLED";
  await tx.orderEvent.create({ data: { orderId: order.id, status: nextStatus,
    title: repair ? "Payment reference reconciled" : late ? "Payment received after cancellation" : "Payment confirmed",
    description: late ? "Refund reconciliation is required from the order refund controls." : "Online payment verified with Paymob.",
  } });
  if (!repair) await createNotification(tx, { userId: order.userId, type: "PAYMENT",
    title: late ? "Payment needs a refund" : "Payment received",
    message: late ? `Order ${order.id} was already cancelled. Contact support for your refund.` : `Payment for order ${order.id} was confirmed.`,
    link: `/orders/${order.id}`,
  });
  return updated;
}
