import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  variantId: z.string().min(1),
  delta: z.number().int().refine((v) => v !== 0 && Math.abs(v) <= 100000),
  note: z.string().trim().min(2).max(500),
});

export async function POST(request: Request) {
  const guard = await requirePermission("inventory:write");
  if (guard.error) return guard.error;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid inventory adjustment", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { variantId, delta, note } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.productVariant.updateMany({
      where: {
        id: variantId,
        ...(delta < 0 ? { stock: { gte: Math.abs(delta) } } : {}),
      },
      data: { stock: { increment: delta } },
    });
    if (updated.count !== 1) throw new Error("INSUFFICIENT_STOCK_OR_NOT_FOUND");

    const variant = await tx.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      select: { id: true, sku: true, stock: true, productId: true },
    });

    await tx.inventoryMovement.create({
      data: {
        variantId,
        type: "ADMIN_ADJUSTMENT",
        quantityDelta: delta,
        stockAfter: variant.stock,
        referenceType: "ADMIN",
        referenceId: guard.user!.id,
        note,
      },
    });
    await writeAuditLog(tx, {
      actorId: guard.user!.id,
      action: "UPDATE",
      entityType: "ProductVariant",
      entityId: variantId,
      summary: `Inventory adjusted for ${variant.sku} by ${delta}`,
      metadata: { delta, stockAfter: variant.stock, note },
    });
    return variant;
  }).catch((error) => {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK_OR_NOT_FOUND") return null;
    throw error;
  });

  if (!result) return NextResponse.json({ error: "Variant not found or stock would become negative" }, { status: 409 });
  return NextResponse.json({ variant: result });
}
