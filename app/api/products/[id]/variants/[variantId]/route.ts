import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { variantUpdateSchema } from "@/lib/validations/variant";
import { Prisma } from "@/app/generated/prisma/client";
import { syncProductStartingPrice } from "@/lib/product-maintenance";
import { writeAuditLog } from "@/lib/audit";

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

  const existing = await prisma.productVariant.findFirst({
    where: { id: variantId, productId },
    select: { id: true, stock: true, sku: true, price: true, salePrice: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  const resultingPrice = parsed.data.price ?? existing.price.toNumber();
  const resultingSalePrice = parsed.data.salePrice === undefined
    ? existing.salePrice?.toNumber() ?? null
    : parsed.data.salePrice;
  if (resultingSalePrice != null && resultingSalePrice >= resultingPrice) {
    return NextResponse.json({ error: "Sale price must be lower than the regular price" }, { status: 400 });
  }

  try {
    const variant = await prisma.$transaction(async (tx) => {
      const updated = await tx.productVariant.update({
        where: { id: variantId },
        data: parsed.data,
        select: { id: true, sku: true, price: true, stock: true, isActive: true, salePrice: true, saleStartsAt: true, saleEndsAt: true },
      });
      if (parsed.data.stock !== undefined && parsed.data.stock !== existing.stock) {
        await tx.inventoryMovement.create({ data: { variantId, type: "ADMIN_ADJUSTMENT", quantityDelta: parsed.data.stock - existing.stock, stockAfter: parsed.data.stock, referenceType: "VARIANT_EDIT", referenceId: variantId, note: "Stock edited from product manager" } });
      }
      await writeAuditLog(tx, { actorId: user!.id, action: "UPDATE", entityType: "ProductVariant", entityId: variantId, summary: `Updated variant ${updated.sku}` });
      return updated;
    });
    await syncProductStartingPrice(productId);
    return NextResponse.json({ data: variant });
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
