import { prisma } from "@/lib/prisma";
import type {
  Order,
  OrderItem,
  Payment,
  Shipment,
  ShipmentStatus,
  Prisma,
} from "@/app/generated/prisma/client";
import {
  canTransitionShipment,
  canTransitionOrder,
} from "@/lib/order-state-machine";
import { SHIPMENT_STATUS_RANK } from "@/lib/bosta";
import { changeLoyaltyPoints, pointsEarnedFromOrder, REFERRAL_REWARD_NEW_USER, REFERRAL_REWARD_REFERRER } from "@/lib/loyalty";
import { compensateOrderLoyalty } from "@/lib/order-loyalty-compensation";
import { createNotification } from "@/lib/notifications";
import { notifyStockAvailable } from "@/lib/stock-alerts";

export class ShipmentTransitionError extends Error {}

type OrderWithRelations = Order & {
  shipment: Shipment | null;
  payment: Payment | null;
  items: OrderItem[];
};

type TransitionMode = "manual" | "webhook";

/**
 * Applies one shipment transition while holding a row lock on Shipment.
 *
 * The old implementation decided whether a transition was valid from an
 * order snapshot loaded before the transaction. Two concurrent webhooks
 * could therefore both decide that RETURNED was new and both restock. By
 * locking first and then re-reading the order, only one caller can observe
 * any given shipment status as current, so stock/coupon side effects happen
 * at most once.
 */
async function applyShipmentStatus(
  orderId: string,
  nextStatus: ShipmentStatus,
  extra: Partial<
    Pick<
      Shipment,
      | "trackingNumber"
      | "carrier"
      | "shippingMethod"
      | "bostaRawState"
      | "bostaDeliveryId"
    >
  > = {},
  mode: TransitionMode,
) {
  return prisma.$transaction(async (tx) => {
    // orderId is unique on Shipment, so this lock serializes all state
    // transitions for one shipment while allowing unrelated orders to run.
    await tx.$queryRaw`SELECT id FROM "Shipment" WHERE "orderId" = ${orderId} FOR UPDATE`;
    // Serialize shipment restocking against customer/admin return operations.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { shipment: true, payment: true, items: true },
    });

    if (!order?.shipment) {
      if (mode === "manual") {
        throw new ShipmentTransitionError("Shipment not found");
      }
      return null;
    }

    const currentStatus = order.shipment.status;

    if (mode === "manual") {
      if (!canTransitionShipment(currentStatus, nextStatus)) {
        throw new ShipmentTransitionError(
          `Cannot move shipment from ${currentStatus} to ${nextStatus}`,
        );
      }
    } else {
      const currentRank = SHIPMENT_STATUS_RANK[currentStatus];
      const nextRank = SHIPMENT_STATUS_RANK[nextStatus];

      if (nextRank <= currentRank) {
        // Stale/duplicate webhook. Keep the raw provider state for audit but
        // never replay business side effects and never move state backwards.
        const shipment = await tx.shipment.update({
          where: { orderId },
          data: { bostaRawState: extra.bostaRawState },
        });
        return { shipment, order: null };
      }
    }

    const shipmentData: Prisma.ShipmentUpdateInput = {
      status: nextStatus,
      ...extra,
    };
    if (nextStatus === "SHIPPED") shipmentData.shippedAt = new Date();
    if (nextStatus === "DELIVERED") shipmentData.deliveredAt = new Date();

    const updatedShipment = await tx.shipment.update({
      where: { orderId },
      data: shipmentData,
    });

    let updatedOrder = null;

    if (
      nextStatus === "DELIVERED" &&
      canTransitionOrder(order.status, "DELIVERED")
    ) {
      const orderData: Prisma.OrderUpdateInput = { status: "DELIVERED" };

      if (
        order.payment?.method === "CASH_ON_DELIVERY" &&
        order.payment.status === "PENDING"
      ) {
        orderData.paymentStatus = "PAID";
        await tx.payment.updateMany({
          where: { orderId, status: "PENDING" },
          data: { status: "PAID", paidAt: new Date() },
        });
      }

      updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: orderData,
        select: { id: true, status: true, paymentStatus: true },
      });

      await tx.orderEvent.create({ data: { orderId, status: "DELIVERED", title: "Order delivered", description: "Your shipment was delivered." } });
      await createNotification(tx, { userId: order.userId, type: "SHIPMENT", title: "Order delivered", message: `Order ${orderId} has been delivered.`, link: `/orders/${orderId}` });

      if (order.userId) {
        const points = pointsEarnedFromOrder(order.total.toNumber());
        if (points > 0) {
          await changeLoyaltyPoints(tx, { userId: order.userId, points, type: "EARN", referenceType: "ORDER", referenceId: orderId, note: "Points earned from delivered order" });
        }

        const customer = await tx.user.findUnique({ where: { id: order.userId }, select: { referredById: true } });
        if (customer?.referredById) {
          const previousDelivered = await tx.order.count({ where: { userId: order.userId, id: { not: orderId }, status: "DELIVERED" } });
          if (previousDelivered === 0) {
            await changeLoyaltyPoints(tx, { userId: customer.referredById, points: REFERRAL_REWARD_REFERRER, type: "REFERRAL", referenceType: "REFERRED_ORDER", referenceId: orderId, note: "Referral reward" });
            await changeLoyaltyPoints(tx, { userId: order.userId, points: REFERRAL_REWARD_NEW_USER, type: "REFERRAL", referenceType: "FIRST_DELIVERED_ORDER", referenceId: orderId, note: "Welcome referral reward" });
            await createNotification(tx, { userId: customer.referredById, type: "PROMOTION", title: "Referral reward", message: `${REFERRAL_REWARD_REFERRER} loyalty points were added to your account.` });
          }
        }
      }
    } else if (
      (nextStatus === "SHIPPED" || nextStatus === "IN_TRANSIT") &&
      canTransitionOrder(order.status, "SHIPPED")
    ) {
      updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: "SHIPPED" },
        select: { id: true, status: true, paymentStatus: true },
      });
      await tx.orderEvent.create({ data: { orderId, status: "SHIPPED", title: "Order shipped" } });
      await createNotification(tx, { userId: order.userId, type: "SHIPMENT", title: "Order shipped", message: `Order ${orderId} is on the way.`, link: `/orders/${orderId}` });
    } else if (
      nextStatus === "RETURNED" &&
      (canTransitionOrder(order.status, "CANCELLED") || order.status === "DELIVERED")
    ) {
      // This branch is now protected by the Shipment row lock above. A
      // duplicate/concurrent RETURNED webhook will observe RETURNED and exit
      // before reaching these increments.
      // A previously DELIVERED shipment can later be returned by Bosta.
      // Customer return requests may already have restored some stock:
      // subtract that quantity before replenishing the remaining items.
      const alreadyReceived = await tx.returnItem.groupBy({
        by: ["orderItemId"],
        where: {
          orderItemId: { in: order.items.map((item) => item.id) },
          returnRequest: { status: { in: ["RECEIVED", "REFUNDED"] } },
        },
        _sum: { quantity: true },
      });
      const receivedByItem = new Map(alreadyReceived.map((item) => [item.orderItemId, item._sum.quantity ?? 0]));
      for (const item of order.items) {
        const stillToRestock = item.quantity - (receivedByItem.get(item.id) ?? 0);
        if (stillToRestock <= 0) continue;
        const variant = await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: stillToRestock } },
          select: { stock: true },
        });
        await tx.inventoryMovement.create({ data: { variantId: item.variantId, type: "RETURN", quantityDelta: stillToRestock, stockAfter: variant.stock, referenceType: "ORDER", referenceId: orderId, note: "Returned shipment restock (excludes received returns)" } });
        await notifyStockAvailable(tx, item.variantId);
      }

      if (order.couponId) {
        await tx.coupon.updateMany({
          where: { id: order.couponId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        });
      }

      if (order.payment?.status === "PAID") {
        console.error(
          `Shipment for order ${orderId} came back RETURNED, but payment is PAID (${order.payment.method}) — manual refund/reconciliation is required.`,
        );
      }

      updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: "CANCELLED" },
        select: { id: true, status: true, paymentStatus: true },
      });
      // Points earned at delivery, referral bonuses and redeemed points are
      // compensated here. Paid refunds still require financial reconciliation.
      await compensateOrderLoyalty(tx, orderId, { returnedShipment: true });
      await tx.orderEvent.create({ data: { orderId, status: "CANCELLED", title: "Shipment returned", description: "The shipment was returned to the store. Any paid refund requires reconciliation." } });
      await createNotification(tx, { userId: order.userId, type: "SHIPMENT", title: "Shipment returned", message: `Order ${orderId} was returned.`, link: `/orders/${orderId}` });
    }

    return { shipment: updatedShipment, order: updatedOrder };
  });
}

/** Manual admin update: must follow the explicit state machine. */
export async function applyManualShipmentUpdate(
  orderId: string,
  _order: OrderWithRelations,
  nextStatus: ShipmentStatus,
  details: {
    trackingNumber?: string;
    carrier?: string;
    shippingMethod?: string;
  },
) {
  return applyShipmentStatus(orderId, nextStatus, details, "manual");
}

/**
 * Automatic Bosta update: only forward progress is accepted. The current
 * status is re-read under a row lock, so duplicate/out-of-order callbacks are
 * idempotent even when they arrive concurrently.
 */
export async function applyBostaWebhookStatus(
  orderId: string,
  _order: OrderWithRelations,
  nextStatus: ShipmentStatus,
  bostaRawState: string,
) {
  return applyShipmentStatus(
    orderId,
    nextStatus,
    { bostaRawState },
    "webhook",
  );
}
