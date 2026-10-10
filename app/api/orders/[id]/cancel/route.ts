import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import {
  canTransitionShipment,
  orderStatusesThatCanReach,
} from "@/lib/order-state-machine";
import { cancelOrderAndRestock } from "@/lib/order-cancellation";
import { cancelBostaDelivery } from "@/lib/bosta";

type Params = { params: Promise<{ id: string }> };

// Customer self-cancel. This used to be a byte-for-byte copy of the admin
// cancel route (requireAdmin), so it 403'd every customer who hit their own
// "Cancel order" button. Two differences from the admin route on purpose:
//  - ownership check, 404 (not 403) for someone else's order - same
//    not-found-not-forbidden pattern the other customer order routes use,
//    so an order id can't be used to probe whether it belongs to someone else
//  - customers may only self-cancel while PENDING or CONFIRMED (before the
//    order enters fulfillment); PROCESSING onward still needs support/admin
export async function POST(_request: NextRequest, { params }: Params) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, shipment: true },
  });
  if (!order || order.userId !== session!.user.id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // نفس النطاق المسموح للعميل نفسه (PENDING/CONFIRMED بس) فوق الحالات
  // المسموحة أصلًا من state machine
  const customerCancellableFrom = orderStatusesThatCanReach("CANCELLED").filter(
    (s) => s === "PENDING" || s === "CONFIRMED",
  );
  const succeeded = await cancelOrderAndRestock(order, customerCancellableFrom);

  if (!succeeded) {
    return NextResponse.json(
      {
        error: `This order can no longer be cancelled (status: ${order.status}). Contact support if you need help.`,
      },
      { status: 409 },
    );
  }

  // Same best-effort Bosta cancel as the admin route, kept for symmetry in
  // case a shipment ever exists this early (it normally won't - shipments
  // are only created once an admin moves the order into PROCESSING).
  let bostaWarning: string | undefined;
  const shipmentAfterCancel = await prisma.shipment.findUnique({
    where: { orderId: id },
  });
  if (shipmentAfterCancel?.bostaDeliveryId) {
    try {
      await cancelBostaDelivery(shipmentAfterCancel.bostaDeliveryId);
      if (canTransitionShipment(shipmentAfterCancel.status, "RETURNED")) {
        await prisma.shipment.update({
          where: { orderId: id },
          data: { status: "RETURNED" },
        });
      }
    } catch (err) {
      bostaWarning =
        "Order cancelled, but the shipment could not be cancelled automatically — support has been notified.";
      console.warn("Bosta cancelDelivery failed", err);
    }
  }

  return NextResponse.json({
    data: { id, status: "CANCELLED" },
    warning: bostaWarning,
  });
}
