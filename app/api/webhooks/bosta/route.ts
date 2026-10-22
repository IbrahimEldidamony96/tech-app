import { NextRequest, NextResponse } from "next/server";
import { receiveBostaEvent } from "@/lib/bosta-events";
import { z } from "zod";

const payloadSchema = z.object({
  _id: z.string().min(1).optional(),
  trackingNumber: z.union([z.string().min(1), z.number().int()]).optional(),
  state: z.number().int(),
  businessReference: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  // Bosta's configured custom header authenticates callbacks.
  const secret = request.headers.get("x-webhook-secret");
  if (!process.env.BOSTA_WEBHOOK_SECRET || secret !== process.env.BOSTA_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
  const payload = parsed.data;
  await receiveBostaEvent({
    bostaDeliveryId: payload._id,
    trackingNumber: payload.trackingNumber === undefined ? undefined : String(payload.trackingNumber),
    businessReference: payload.businessReference,
    state: payload.state,
  });
  return NextResponse.json({ received: true });
}
