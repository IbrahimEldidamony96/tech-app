import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { syncProductStartingPrice } from "@/lib/product-maintenance";
import type { VariantCreateInput } from "@/lib/validations/variant";

export class VariantCreationError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function createProductVariant(productId: string, actorId: string, input: VariantCreateInput) {
  return prisma.$transaction(async tx => {
    // Serialize duplicate-combination checks and starting-price maintenance.
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
    if (!await tx.product.findUnique({ where: { id: productId }, select: { id: true } })) {
      throw new VariantCreationError("Product not found", 404);
    }
    const { optionValueIds = [], ...fields } = input;
    if (new Set(optionValueIds).size !== optionValueIds.length) {
      throw new VariantCreationError("Duplicate option values are not allowed", 400);
    }
    if (optionValueIds.length) {
      const values = await tx.productOptionValue.findMany({ where: { id: { in: optionValueIds } },
        select: { id: true, optionId: true, option: { select: { productId: true } } } });
      if (values.length !== optionValueIds.length) throw new VariantCreationError("One or more option values do not exist", 400);
      if (values.some(value => value.option.productId !== productId)) {
        throw new VariantCreationError("Every option value must belong to this product", 400);
      }
      if (new Set(values.map(value => value.optionId)).size !== values.length) {
        throw new VariantCreationError("A variant can contain only one value from each option", 400);
      }
      const existing = await tx.productVariant.findMany({ where: { productId },
        select: { optionValues: { select: { optionValueId: true } } } });
      const ids = new Set(optionValueIds);
      if (existing.some(v => v.optionValues.length === ids.size && v.optionValues.every(value => ids.has(value.optionValueId)))) {
        throw new VariantCreationError("A variant with this exact option combination already exists", 409);
      }
    }
    const created = await tx.productVariant.create({
      data: { productId, ...fields,
        ...(optionValueIds.length ? { optionValues: { create: optionValueIds.map(optionValueId => ({ optionValueId })) } } : {}) },
      select: { id: true, sku: true, price: true, stock: true, isActive: true,
        salePrice: true, saleStartsAt: true, saleEndsAt: true,
        optionValues: { select: { optionValueId: true, optionValue: { select: { valueEn: true } } } } },
    });
    if (created.stock > 0) {
      await tx.inventoryMovement.create({ data: { variantId: created.id, type: "ADMIN_ADJUSTMENT",
        quantityDelta: created.stock, stockAfter: created.stock, referenceType: "VARIANT_CREATE", referenceId: created.id, note: "Initial stock" } });
    }
    await writeAuditLog(tx, { actorId, action: "CREATE", entityType: "ProductVariant", entityId: created.id, summary: `Created variant ${created.sku}` });
    await syncProductStartingPrice(productId, tx);
    return created;
  });
}
