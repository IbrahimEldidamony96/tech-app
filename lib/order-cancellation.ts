import { prisma } from "@/lib/prisma";
import { orderStatusesThatCanReach } from "@/lib/order-state-machine";
import type { OrderStatus } from "@/app/generated/prisma/client";
import { changeLoyaltyPoints } from "@/lib/loyalty";
import { createNotification } from "@/lib/notifications";
import { notifyStockAvailable } from "@/lib/stock-alerts";

type CancellableOrder = {
  id: string;
  userId?: string | null;
  couponId: string | null;
  loyaltyPointsRedeemed?: number;
  items: { variantId: string; quantity: number }[];
};

export async function cancelOrderAndRestock(
  order: CancellableOrder,
  allowedFromStatuses: OrderStatus[] = orderStatusesThatCanReach("CANCELLED"),
): Promise<boolean> {
  const { count } = await prisma.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: {
        id: order.id,
        status: { in: allowedFromStatuses },
        // A partial refund is still proof of captured funds; never restock
        // or cancel it as though it were an unpaid checkout.
        paymentStatus: { notIn: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] },
      },
      data: { status: "CANCELLED" },
    });

    if (result.count > 0) {
      for (const item of order.items) {
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
            referenceId: order.id,
            note: "Order cancellation restock",
          },
        });
        await notifyStockAvailable(tx, item.variantId);
      }

      if (order.couponId) {
        await tx.coupon.updateMany({
          where: { id: order.couponId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        });
      }

      if (order.userId && (order.loyaltyPointsRedeemed ?? 0) > 0) {
        await changeLoyaltyPoints(tx, {
          userId: order.userId,
          points: order.loyaltyPointsRedeemed!,
          type: "REFUND",
          referenceType: "ORDER",
          referenceId: order.id,
          note: "Loyalty points restored after cancellation",
        });
      }

      await tx.orderEvent.create({
        data: { orderId: order.id, status: "CANCELLED", title: "Order cancelled" },
      });
      await createNotification(tx, {
        userId: order.userId,
        type: "ORDER",
        title: "Order cancelled",
        message: `Order ${order.id} was cancelled.`,
        link: `/orders/${order.id}`,
      });
    }
    return result;
  });

  return count > 0;
}
