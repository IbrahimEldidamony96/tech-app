import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { variantUpdateSchema } from "@/lib/validations/variant";
import { Prisma } from "@/app/generated/prisma/client";
import { syncProductStartingPrice } from "@/lib/product-maintenance";
import { writeAuditLog } from "@/lib/audit";
import { notifyStockAvailable } from "@/lib/stock-alerts";

type Params = { params: Promise<{ id: string; variantId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { error, user } = await requirePermission("catalog:write");
  if (error) return error;

  const { id: productId, variantId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = variantUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProductVariant" WHERE id = ${variantId} FOR UPDATE`;
      const existing = await tx.productVariant.findFirst({ where: { id: variantId, productId } });
      if (!existing) return { kind: "missing" as const };
      const { expectedStock, ...changes } = parsed.data;
      if (changes.stock !== undefined && existing.stock !== expectedStock) return { kind: "stale" as const };
      const price = changes.price ?? existing.price.toNumber();
      const sale = changes.salePrice === undefined ? existing.salePrice?.toNumber() ?? null : changes.salePrice;
      if (sale !== null && sale >= price) return { kind: "price" as const };
      const startsAt = changes.saleStartsAt === undefined ? existing.saleStartsAt : changes.saleStartsAt;
      const endsAt = changes.saleEndsAt === undefined ? existing.saleEndsAt : changes.saleEndsAt;
      if (startsAt && endsAt && startsAt >= endsAt) return { kind: "dates" as const };
      const updated = await tx.productVariant.update({
        where: { id: variantId },
        data: changes,
        select: { id: true, sku: true, price: true, stock: true, isActive: true, salePrice: true, saleStartsAt: true, saleEndsAt: true },
      });
      if (parsed.data.stock !== undefined && parsed.data.stock !== existing.stock) {
        await tx.inventoryMovement.create({ data: { variantId, type: "ADMIN_ADJUSTMENT", quantityDelta: parsed.data.stock - existing.stock, stockAfter: parsed.data.stock, referenceType: "VARIANT_EDIT", referenceId: variantId, note: "Stock edited from product manager" } });
      }
      if (updated.stock > existing.stock) await notifyStockAvailable(tx, variantId);
      await writeAuditLog(tx, { actorId: user!.id, action: "UPDATE", entityType: "ProductVariant", entityId: variantId, summary: `Updated variant ${updated.sku}` });
      return { kind: "ok" as const, variant: updated };
    });
    if (result.kind === "missing") return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    if (result.kind === "stale") return NextResponse.json({ error: "Stock changed while you were editing. Reload and try again." }, { status: 409 });
    if (result.kind === "price") return NextResponse.json({ error: "Sale price must be lower than the regular price" }, { status: 400 });
    if (result.kind === "dates") return NextResponse.json({ error: "Sale end must be after sale start" }, { status: 400 });
    await syncProductStartingPrice(productId);
    return NextResponse.json({ data: result.variant });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }
    throw err;
  }
}
