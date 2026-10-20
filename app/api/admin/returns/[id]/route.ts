import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { createNotification } from "@/lib/notifications";
import { notifyStockAvailable } from "@/lib/stock-alerts";
import { writeAuditLog } from "@/lib/audit";
import { returnQuantityConflict } from "@/lib/return-quantities";

const schema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "RECEIVED"]),
  adminNote: z.string().trim().max(1000).optional(),
});
const transitions: Record<string, readonly string[]> = {
  REQUESTED: ["APPROVED", "REJECTED"],
  APPROVED: ["RECEIVED", "REJECTED"],
  RECEIVED: [],
  REJECTED: [],
  REFUNDED: [],
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("returns:write");
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid return transition", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Same lock order as customer POST: Order -> ReturnRequest.
    // Prevents two separate approved requests on the same order from
    // replenishing more units than the order originally contained.
    const target = await tx.returnRequest.findUnique({ where: { id }, select: { orderId: true } });
    if (!target) return { kind: "missing" as const };
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${target.orderId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ReturnRequest" WHERE id = ${id} FOR UPDATE`;

    const rr = await tx.returnRequest.findUnique({
      where: { id },
      include: {
        items: true,
        order: {
          select: {
            paymentStatus: true,
            userId: true,
            items: { select: { id: true, quantity: true, productName: true } },
          },
        },
      },
    });
    if (!rr) return { kind: "missing" as const };
    if (!transitions[rr.status]?.includes(parsed.data.status)) {
      return { kind: "invalid" as const, current: rr.status };
    }

    if (parsed.data.status === "RECEIVED") {
      // A defence in depth for legacy or manually inserted over-reservations.
      // Only previously received (stock-restored) quantities count here;
      // pending/rejected requests have not increased stock.
      const received = await tx.returnItem.groupBy({
        by: ["orderItemId"],
        where: {
          orderItemId: { in: rr.items.map((item) => item.orderItemId) },
          returnRequest: {
            id: { not: rr.id },
            status: { in: ["RECEIVED", "REFUNDED"] },
          },
        },
        _sum: { quantity: true },
      });
      const restored = new Map(received.map((row) => [row.orderItemId, row._sum.quantity ?? 0]));
      const conflict = returnQuantityConflict(rr.items, rr.order.items, restored);
      if (conflict) return { kind: "excess" as const };

      for (const item of rr.items) {
        const variant = await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
          select: { stock: true },
        });
        await tx.inventoryMovement.create({
          data: {
            variantId: item.variantId,
            type: "RETURN",
            quantityDelta: item.quantity,
            stockAfter: variant.stock,
            referenceType: "RETURN_REQUEST",
            referenceId: rr.id,
            note: "Customer return received",
          },
        });
        await notifyStockAvailable(tx, item.variantId);
      }
    }

    const updated = await tx.returnRequest.update({
      where: { id },
      data: {
        status: parsed.data.status,
        adminNote: parsed.data.adminNote,
      },
    });
    await createNotification(tx, {
      userId: rr.userId,
      type: "ORDER",
      title: "Return updated",
      message: `Your return request is now ${parsed.data.status}.`,
      link: "/account/returns",
    });
    await writeAuditLog(tx, {
      actorId: guard.user!.id,
      action: "STATUS_CHANGE",
      entityType: "ReturnRequest",
      entityId: id,
      summary: `Return ${id}: ${rr.status} -> ${parsed.data.status}`,
    });
    return { kind: "ok" as const, updated };
  });

  if (result.kind === "missing") return NextResponse.json({ error: "Return request not found" }, { status: 404 });
  if (result.kind === "invalid") {
    return NextResponse.json({ error: `Cannot transition return from ${result.current} to ${parsed.data.status}` }, { status: 409 });
  }
  if (result.kind === "excess") {
    return NextResponse.json({ error: "Restoring these return quantities would exceed the original purchase" }, { status: 409 });
  }
  return NextResponse.json({ data: result.updated });
}
