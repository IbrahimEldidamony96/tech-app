import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createBostaDelivery, cancelBostaDelivery, resolveBostaCityIdCached, resolveBostaDistrictIdCached, BostaApiError } from "@/lib/bosta";
import { writeAuditLog } from "@/lib/audit";
import { replayBookingEvents } from "@/lib/bosta-events";

export class BookingError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
const active = ["REQUESTING", "UNKNOWN"];
const lease = () => new Date(Date.now() + 120_000);

export async function createShipmentBooking(orderId: string, actorId: string) {
  const snapshot = await prisma.order.findUnique({ where: { id: orderId }, include: { shipment: true, items: true } });
  if (!snapshot) throw new BookingError("Order not found", 404);
  if (snapshot.shipment) throw new BookingError("Shipment already exists");
  if (snapshot.status !== "CONFIRMED") throw new BookingError("Reconcile any pending carrier booking before trying again");
  const cityId = await resolveBostaCityIdCached(snapshot.shippingBostaCityId, snapshot.shippingGovernorate);
  const districtId = await resolveBostaDistrictIdCached(snapshot.shippingBostaDistrictId, cityId, snapshot.shippingCity);
  const requestKey = randomUUID();
  const order = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const current = await tx.order.findUnique({ where: { id: orderId }, include: { payment: true, shipment: true, shipmentBooking: true } });
    if (!current || current.status !== "CONFIRMED" || current.shipment) throw new BookingError("Order status changed");
    if (current.shipmentBooking && active.includes(current.shipmentBooking.status)) throw new BookingError("Reconcile the previous carrier booking first");
    if (!current.payment || (current.payment.method !== "CASH_ON_DELIVERY" &&
        (current.payment.status !== "PAID" || !current.payment.transactionId))) throw new BookingError("Verify the online payment before shipping");
    await tx.shipmentBooking.upsert({ where: { orderId }, create: { orderId, requestKey, leaseUntil: lease() },
      update: { status: "REQUESTING", requestKey, leaseUntil: lease(), bostaDeliveryId: null, trackingNumber: null, lastError: null } });
    await tx.order.update({ where: { id: orderId }, data: { status: "PROCESSING" } });
    await writeAuditLog(tx, { actorId, action: "CREATE", entityType: "ShipmentBooking", entityId: orderId, summary: "Reserved carrier booking attempt" });
    return current;
  });
  let result: { bostaDeliveryId: string; trackingNumber: string };
  try {
    result = await createBostaDelivery({
      businessReference: orderId, cod: order.payment!.method === "CASH_ON_DELIVERY" ? order.total.toNumber() : 0,
      receiver: { firstName: order.shippingFirstName, lastName: order.shippingLastName, phone: order.shippingPhone },
      address: { city: order.shippingGovernorate, cityId, zone: order.shippingCity, districtId,
        firstLine: order.shippingStreet, buildingNumber: order.shippingBuildingNo ?? undefined, apartment: order.shippingApartment ?? undefined },
      itemsCount: snapshot.items.reduce((sum, item) => sum + item.quantity, 0), notes: `Tech Store order ${orderId}`,
    });
  } catch (error) {
    // A timeout/5xx may mean the carrier committed the booking. Never retry it
    // automatically; the durable attempt can be reconciled from the dashboard.
    const rejected = error instanceof BostaApiError && error.status >= 400 && error.status < 500 && ![408, 409, 429].includes(error.status);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const changed = await tx.shipmentBooking.updateMany({ where: { orderId, requestKey, status: { in: active } },
        data: { status: rejected ? "FAILED" : "UNKNOWN", leaseUntil: new Date(), lastError: "Carrier request failed; inspect the carrier dashboard before retrying" } });
      if (rejected && changed.count) await tx.order.updateMany({ where: { id: orderId, status: "PROCESSING" }, data: { status: "CONFIRMED" } });
    });
    throw new BookingError(rejected ? "Carrier rejected the booking. Correct the address and retry." : "Carrier booking outcome is unknown. Use shipment recovery to reconcile it.", 502);
  }
  try {
    await prisma.shipmentBooking.updateMany({ where: { orderId, requestKey, status: { in: active } }, data: result });
    return await attachBooking(orderId, requestKey, result, actorId);
  } catch {
    const saved = await prisma.shipment.findUnique({ where: { orderId } }).catch(() => null);
    if (saved?.bostaDeliveryId === result.bostaDeliveryId) return saved;
    await prisma.shipmentBooking.updateMany({ where: { orderId, requestKey, status: { in: active } },
      data: { ...result, status: "UNKNOWN", leaseUntil: new Date(), lastError: "Carrier booked successfully; local shipment requires recovery" } }).catch(() => {});
    throw new BookingError(`Carrier booking needs recovery. Delivery ${result.bostaDeliveryId}; tracking ${result.trackingNumber}. No second booking was created.`, 502);
  }
}

async function attachBooking(orderId: string, requestKey: string, carrier: { bostaDeliveryId: string; trackingNumber: string }, actorId: string, reason?: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { shipment: true, shipmentBooking: true } });
    if (order?.shipment?.bostaDeliveryId === carrier.bostaDeliveryId) return order.shipment;
    if (!order || order.status !== "PROCESSING" || order.shipment || order.shipmentBooking?.requestKey !== requestKey || !active.includes(order.shipmentBooking.status)) throw new BookingError("Booking status changed");
    await tx.shipment.create({ data: { orderId, status: "PENDING", carrier: "Bosta", ...carrier } });
    await tx.shipmentBooking.update({ where: { orderId }, data: { status: "BOOKED", ...carrier, lastError: null } });
    await replayBookingEvents(tx, orderId, order.shipmentBooking.id, carrier);
    await writeAuditLog(tx, { actorId, action: "UPDATE", entityType: "ShipmentBooking", entityId: orderId, summary: "Carrier shipment recorded", metadata: { ...carrier, ...(reason ? { reason } : {}) } });
    return tx.shipment.findUniqueOrThrow({ where: { orderId } });
  }, { timeout: 15000 });
}

export async function recoverShipmentBooking(orderId: string, actorId: string, input: {
  action: "ATTACH" | "NO_BOOKING" | "CANCEL_BOOKING"; reason: string;
  bostaDeliveryId?: string; trackingNumber?: string;
}) {
  const requestKey = randomUUID();
  const booking = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { shipment: true, shipmentBooking: true } });
    if (!order || order.status !== "PROCESSING" || order.shipment) throw new BookingError("Order or booking changed");
    const current = order.shipmentBooking;
    if (current && (!active.includes(current.status) || current.leaseUntil > new Date())) throw new BookingError("Booking is still in progress or already resolved. Refresh its status.");
    if (input.action === "ATTACH" && (!input.bostaDeliveryId || !input.trackingNumber)) throw new BookingError("Provide the existing carrier delivery and tracking IDs", 400);
    if (input.action === "ATTACH" && current?.bostaDeliveryId && current.bostaDeliveryId !== input.bostaDeliveryId) throw new BookingError("Use the recorded carrier booking");
    if (input.action === "ATTACH" && current?.trackingNumber && current.trackingNumber !== input.trackingNumber) throw new BookingError("Use the recorded carrier tracking number");
    if (input.action === "NO_BOOKING" && current?.bostaDeliveryId) throw new BookingError("Cancel or record the existing carrier booking first");
    if (input.action === "CANCEL_BOOKING" && !current?.bostaDeliveryId) throw new BookingError("No carrier delivery ID is recorded", 400);
    // Rotate the claim while holding the order lock. Delayed callbacks and
    // concurrent operators cannot finish an older recovery decision.
    return tx.shipmentBooking.upsert({ where: { orderId },
      create: { orderId, requestKey, status: "UNKNOWN", leaseUntil: lease(), ...(input.action === "ATTACH" ? { bostaDeliveryId: input.bostaDeliveryId, trackingNumber: input.trackingNumber } : {}) },
      update: { requestKey, status: "UNKNOWN", leaseUntil: lease(), ...(input.action === "ATTACH" ? { bostaDeliveryId: input.bostaDeliveryId, trackingNumber: input.trackingNumber } : {}) },
    });
  });
  try {
    if (input.action === "ATTACH") return await attachBooking(orderId, requestKey, { bostaDeliveryId: input.bostaDeliveryId!, trackingNumber: input.trackingNumber! }, actorId, input.reason);
    if (input.action === "CANCEL_BOOKING") {
      try { await cancelBostaDelivery(booking.bostaDeliveryId!); }
      catch { throw new BookingError("Carrier cancellation failed. The booking is preserved for reconciliation.", 502); }
    }
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { shipment: true, shipmentBooking: true } });
      if (!order || order.status !== "PROCESSING" || order.shipment || order.shipmentBooking?.requestKey !== requestKey) throw new BookingError("Order or booking changed");
      await tx.shipmentBooking.update({ where: { orderId }, data: { status: "CANCELLED", leaseUntil: new Date(), lastError: input.reason } });
      await tx.order.update({ where: { id: orderId }, data: { status: "CONFIRMED" } });
      await writeAuditLog(tx, { actorId, action: "UPDATE", entityType: "ShipmentBooking", entityId: orderId,
        summary: input.action === "NO_BOOKING" ? "Operator confirmed no carrier booking exists" : "Carrier booking cancelled", metadata: { reason: input.reason } });
      return null;
    });
  } catch (error) {
    await prisma.shipmentBooking.updateMany({ where: { orderId, requestKey, status: "UNKNOWN" }, data: { leaseUntil: new Date() } }).catch(() => {});
    throw error;
  }
}
