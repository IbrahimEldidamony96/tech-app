import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { updateShipmentSchema } from "@/lib/validations/order-admin";
import {
  applyManualShipmentUpdate,
  ShipmentTransitionError,
} from "@/lib/shipment-service";
import { z } from "zod";
import { createShipmentBooking, recoverShipmentBooking, BookingError } from "@/lib/shipment-booking";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requirePermission("orders:read"); if (guard.error) return guard.error;
  const { id } = await params;
  const booking = await prisma.shipmentBooking.findUnique({ where: { orderId: id } });
  return NextResponse.json({ data: booking ? { status: booking.status, bostaDeliveryId: booking.bostaDeliveryId, trackingNumber: booking.trackingNumber, recoverable: booking.leaseUntil <= new Date(), lastError: booking.lastError } : null });
}

export async function POST(_request: NextRequest, { params }: Params) {
  const guard = await requirePermission("orders:write"); if (guard.error) return guard.error;
  const { id } = await params;
  try { return NextResponse.json({ data: await createShipmentBooking(id, guard.user!.id) }, { status: 201 }); }
  catch (error) { if (error instanceof BookingError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requirePermission("orders:write");
  if (guard.error) return guard.error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body && typeof body === "object" && "action" in body) {
    const recovery = z.object({ action: z.enum(["ATTACH", "NO_BOOKING", "CANCEL_BOOKING"]), reason: z.string().trim().min(10).max(1000), attested: z.literal(true), bostaDeliveryId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(), trackingNumber: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional() }).safeParse(body);
    if (!recovery.success) return NextResponse.json({ error: "Confirm the carrier dashboard outcome and provide a reason (10+ characters)" }, { status: 400 });
    try { return NextResponse.json({ data: await recoverShipmentBooking(id, guard.user!.id, recovery.data) }); }
    catch (error) { if (error instanceof BookingError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
  }

  const parsed = updateShipmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { shipment: true, payment: true, items: true },
  });

  if (!order || !order.shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  const { status: nextStatus, receiptConfirmed, ...details } = parsed.data;

  try {
    const result = await applyManualShipmentUpdate(
      id,
      order,
      nextStatus,
      details,
      receiptConfirmed === true,
    );
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ShipmentTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
