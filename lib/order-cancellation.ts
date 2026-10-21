import { prisma } from "@/lib/prisma";
import { orderStatusesThatCanReach } from "@/lib/order-state-machine";
import type { OrderStatus } from "@/app/generated/prisma/client";
import { changeLoyaltyPoints } from "@/lib/loyalty";
import { createNotification } from "@/lib/notifications";
import { notifyStockAvailable } from "@/lib/stock-alerts";
import { isExpiredUnpaidOnlineOrder } from "@/lib/order-expiry";

const FINANCIALLY_CAPTURED = new Set<string>(["PAID", "PARTIALLY_REFUNDED", "REFUNDED"]);

type CancellationOptions = {
  /** Recheck expiry against locked current DB state, not a cron scan snapshot. */
  unpaidExpiredBefore?: Date;
  /** Admin manual failure only for uncaptured PENDING online payments. */
  markPaymentFailed?: boolean;
  carrierCancellationConfirmed?: boolean;
};

/**
 * Shared customer/admin/cron cancellation. Parent Order row is the
 * serialization point. Paymob webhook must lock that SAME row FIRST.
 * It is not sufficient to check Order.paymentStatus alone: a payment may
 * have been captured while its denormalized Order snapshot is still stale.
 */
export async function cancelOrderAndRestock(
  order: { id: string },
  allowedFromStatuses: OrderStatus[] = orderStatusesThatCanReach("CANCELLED"),
  options: CancellationOptions = {},
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
    const current = await tx.order.findUnique({
      where: { id: order.id },
      include: { items: true, payment: true, shipment: true },
    });
    if (!current || !allowedFromStatuses.includes(current.status)) return false;
    if (current.shipment) {
      if (!["PENDING", "PREPARING"].includes(current.shipment.status)) return false;
      if (current.shipment.bostaDeliveryId && !options.carrierCancellationConfirmed) return false;
    }

    if (FINANCIALLY_CAPTURED.has(current.paymentStatus) ||
        (current.payment && FINANCIALLY_CAPTURED.has(current.payment.status))) {
      return false;
    }

    if (options.unpaidExpiredBefore &&
        !isExpiredUnpaidOnlineOrder(current, options.unpaidExpiredBefore)) {
      return false;
    }

    if (options.markPaymentFailed) {
      // Preserve lock order and never let "mark failed" cancel shipped COD
      // or any order with captured money.
      if (current.status !== "PENDING" || current.paymentStatus !== "PENDING" ||
          !current.payment || current.payment.status !== "PENDING" ||
          current.payment.method === "CASH_ON_DELIVERY") return false;
      const failedPayment = await tx.payment.updateMany({
        where: { orderId: current.id, status: "PENDING" },
        data: { status: "FAILED" },
      });
      if (failedPayment.count !== 1) return false;
    }

    const updated = await tx.order.updateMany({
      where: {
        id: current.id,
        status: { in: allowedFromStatuses },
        paymentStatus: { notIn: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] },
      },
      data: {
        status: "CANCELLED",
        ...(options.markPaymentFailed ? { paymentStatus: "FAILED" as const } : {}),
      },
    });
    if (updated.count !== 1) return false;
    if (current.shipment) {
      await tx.shipment.update({ where: { orderId: current.id }, data: { status: "RETURNED" } });
    }

    for (const item of [...current.items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      const variant = await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stock: { increment: item.quantity } },
        select: { stock: true },
      });
      await tx.inventoryMovement.create({
        data: {
          variantId: item.variantId,
          type: "CANCELLATION",
          quantityDelta: item.quantity,
          stockAfter: variant.stock,
          referenceType: "ORDER",
          referenceId: current.id,
          note: "Order cancellation restock",
        },
      });
      await notifyStockAvailable(tx, item.variantId);
    }

    if (current.couponId) {
      await tx.coupon.updateMany({
        where: { id: current.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
    }

    if (current.userId && current.loyaltyPointsRedeemed > 0) {
      await changeLoyaltyPoints(tx, {
        userId: current.userId,
        points: current.loyaltyPointsRedeemed,
        type: "REFUND",
        referenceType: "ORDER_REDEMPTION_RESTORE",
        referenceId: current.id,
        idempotencyKey: `redeem-restoration:${current.id}:${current.loyaltyPointsRedeemed}`,
        note: "Loyalty points restored after cancellation",
      });
    }

    await tx.orderEvent.create({
      data: { orderId: current.id, status: "CANCELLED", title: "Order cancelled" },
    });
    await createNotification(tx, {
      userId: current.userId,
      type: "ORDER",
      title: "Order cancelled",
      message: `Order ${current.id} was cancelled.`,
      link: `/orders/${current.id}`,
    });
    return true;
  }, { timeout: 10000 });
}
