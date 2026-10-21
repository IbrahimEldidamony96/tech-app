import { prisma } from "@/lib/prisma";
import { cancelBostaDelivery } from "@/lib/bosta";
import { orderStatusesThatCanReach } from "@/lib/order-state-machine";
import { cancelOrderAndRestock } from "@/lib/order-cancellation";
import type { OrderStatus } from "@/app/generated/prisma/client";

export async function cancelBeforeDispatch(id: string, allowed: OrderStatus[] = orderStatusesThatCanReach("CANCELLED")) {
  const order = await prisma.order.findUnique({ where: { id }, include: { payment: true, shipment: true } });
  if (!order || !allowed.includes(order.status) ||
      [order.paymentStatus, order.payment?.status].some(s => s && ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(s)) ||
      (order.shipment && !["PENDING", "PREPARING"].includes(order.shipment.status))) {
    return { ok: false as const, status: 409, error: "This order can no longer be cancelled. A dispatched shipment must be returned before stock is restored." };
  }
  let carrierCancellationConfirmed = false;
  if (order.shipment?.bostaDeliveryId) {
    try {
      await cancelBostaDelivery(order.shipment.bostaDeliveryId);
      carrierCancellationConfirmed = true;
    } catch {
      return { ok: false as const, status: 502, error: "The carrier could not cancel this shipment. Stock and order status have been preserved; check the carrier dashboard." };
    }
  }
  const ok = await cancelOrderAndRestock({ id }, allowed, { carrierCancellationConfirmed });
  return ok ? { ok: true as const } : { ok: false as const, status: 409, error: "Order status changed during cancellation. Reload and review the shipment." };
}
