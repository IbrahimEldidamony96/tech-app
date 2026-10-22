import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { mapBostaState } from "@/lib/bosta";
import { applyBostaWebhookStatusInTransaction } from "@/lib/shipment-service";

type CarrierIdentity = { bostaDeliveryId: string | null; trackingNumber: string | null };
type Callback = { bostaDeliveryId?: string; trackingNumber?: string; businessReference?: string; state: number };

function matches(identity: CarrierIdentity, event: Pick<Callback, "bostaDeliveryId" | "trackingNumber">) {
  return (!event.bostaDeliveryId || !identity.bostaDeliveryId || event.bostaDeliveryId === identity.bostaDeliveryId) &&
    (!event.trackingNumber || !identity.trackingNumber || event.trackingNumber === identity.trackingNumber);
}

async function applyEvent(tx: Prisma.TransactionClient, orderId: string, rawState: string) {
  const status = mapBostaState(Number(rawState));
  if (status) await applyBostaWebhookStatusInTransaction(tx, orderId, status, rawState);
  else await tx.shipment.update({ where: { orderId }, data: { bostaRawState: rawState } });
}

export async function receiveBostaEvent(event: Callback) {
  const identity = [
    ...(event.bostaDeliveryId ? [{ bostaDeliveryId: event.bostaDeliveryId }] : []),
    ...(event.trackingNumber ? [{ trackingNumber: event.trackingNumber }] : []),
  ];
  if (!identity.length) return;
  const shipment = await prisma.shipment.findFirst({ where: { OR: identity }, select: { orderId: true } });
  const booking = shipment ? null : await prisma.shipmentBooking.findFirst({
    where: { OR: [...identity, ...(event.businessReference ? [{ orderId: event.businessReference }] : [])] },
    select: { orderId: true },
  });
  const orderId = shipment?.orderId ?? booking?.orderId;
  if (!orderId || (event.businessReference && event.businessReference !== orderId)) return;

  await prisma.$transaction(async tx => {
    // Attachment, recovery decisions and callbacks serialize on the same row.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { shipment: true, shipmentBooking: true } });
    if (!order) return;
    if (order.shipment) {
      if (matches(order.shipment, event)) await applyEvent(tx, orderId, String(event.state));
      return;
    }
    const current = order.shipmentBooking;
    if (!current || !["REQUESTING", "UNKNOWN"].includes(current.status) || !matches(current, event)) return;
    await tx.shipmentBooking.update({ where: { orderId }, data: {
      bostaDeliveryId: current.bostaDeliveryId ?? event.bostaDeliveryId,
      trackingNumber: current.trackingNumber ?? event.trackingNumber,
    } });
    const data = { bookingId: current.id, bostaDeliveryId: event.bostaDeliveryId ?? "", trackingNumber: event.trackingNumber ?? "", rawState: String(event.state) };
    await tx.shipmentBookingEvent.upsert({
      where: { bookingId_bostaDeliveryId_trackingNumber_rawState: data }, create: data, update: {},
    });
  }, { timeout: 15000 });
}

export async function replayBookingEvents(tx: Prisma.TransactionClient, orderId: string, bookingId: string, carrier: CarrierIdentity) {
  const events = await tx.shipmentBookingEvent.findMany({ where: { bookingId, processedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  for (const event of events) {
    // Never apply events belonging to a different carrier attempt.
    if (!matches(carrier, event)) continue;
    await applyEvent(tx, orderId, event.rawState);
    await tx.shipmentBookingEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
  }
}
