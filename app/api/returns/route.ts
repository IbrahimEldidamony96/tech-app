import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { createNotification } from "@/lib/notifications";
import { returnQuantityConflict } from "@/lib/return-quantities";

const schema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
  customerNote: z.string().trim().max(1000).optional(),
  items: z.array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().min(1) })).min(1),
});

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;
  const data = await prisma.returnRequest.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { orderItem: { select: { productName: true, sku: true, quantity: true, unitPrice: true } } } }, order: { select: { id: true, createdAt: true, paymentStatus: true } } },
  });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid return request", issues: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  if (new Set(input.items.map((i) => i.orderItemId)).size !== input.items.length) {
    return NextResponse.json({ error: "Duplicate order items are not allowed" }, { status: 400 });
  }

  // All return reservations for an order serialize on the SAME database row.
  // Lock BEFORE reading purchased/reserved quantities and hold until commit.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;

    const order = await tx.order.findFirst({
      where: { id: input.orderId, userId: session!.user.id, status: "DELIVERED" },
      include: { items: true },
    });
    if (!order) return { kind: "missing" as const };

    const requestedIds = input.items.map((item) => item.orderItemId);
    const existing = await tx.returnItem.groupBy({
      by: ["orderItemId"],
      where: {
        orderItemId: { in: requestedIds },
        returnRequest: { status: { in: ["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED"] } },
      },
      _sum: { quantity: true },
    });
    const reserved = new Map(existing.map((row) => [row.orderItemId, row._sum.quantity ?? 0]));
    const conflict = returnQuantityConflict(input.items, order.items, reserved);
    if (conflict) return { kind: "conflict" as const, conflict };

    const rr = await tx.returnRequest.create({
      data: {
        orderId: order.id,
        userId: session!.user.id,
        reason: input.reason,
        customerNote: input.customerNote,
        items: { create: input.items.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
          variantId: order.items.find((source) => source.id === item.orderItemId)!.variantId,
        })) },
      },
      include: { items: true },
    });
    await createNotification(tx, {
      userId: session!.user.id,
      type: "ORDER",
      title: "Return requested",
      message: `Return request ${rr.id} was submitted.`,
      link: "/account/returns",
    });
    return { kind: "created" as const, data: rr };
  });

  if (result.kind === "missing") return NextResponse.json({ error: "Delivered order not found" }, { status: 404 });
  if (result.kind === "conflict") {
    if (result.conflict.kind === "invalid_item") {
      return NextResponse.json({ error: "One of the items does not belong to this order" }, { status: 400 });
    }
    return NextResponse.json({ error: `Return quantity exceeds purchased quantity for ${result.conflict.productName}` }, { status: 409 });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
