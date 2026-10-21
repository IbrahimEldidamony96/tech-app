import { NextRequest, NextResponse } from "next/server";
import { withLockedCart } from "@/lib/cart";
import { requireUser } from "@/lib/require-user";
import { mergeCartSchema } from "@/lib/validations/cart";

export async function POST(request: NextRequest) {
  const { session, error } = await requireUser();
  if (error) return error;

  const parsed = mergeCartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid cart", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userId = session!.user.id;
  const result = await withLockedCart(userId, async (tx, cartId) => {
    const variantIds = parsed.data.items.map((item) => item.variantId);
    const [variants, existingItems] = await Promise.all([
      tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: {
          id: true,
          stock: true,
          isActive: true,
          product: { select: { isActive: true, deletedAt: true } },
        },
      }),
      tx.cartItem.findMany({
        where: { cartId, variantId: { in: variantIds } },
        select: { id: true, variantId: true, quantity: true },
      }),
    ]);
    const variantsById = new Map(variants.map((variant) => [variant.id, variant]));
    const existingByVariant = new Map(existingItems.map((item) => [item.variantId, item]));
    const skipped: string[] = [];
    let merged = 0;

    for (const item of parsed.data.items) {
      const variant = variantsById.get(item.variantId);
      if (!variant || !variant.isActive || !variant.product.isActive || variant.product.deletedAt || variant.stock <= 0) {
        skipped.push(item.variantId);
        continue;
      }

      const existing = existingByVariant.get(item.variantId);
      const quantity = Math.min(10, variant.stock, Math.max(existing?.quantity ?? 0, item.quantity));
      if (existing) {
        await tx.cartItem.update({ where: { id: existing.id }, data: { quantity } });
      } else {
        await tx.cartItem.create({ data: { cartId, variantId: item.variantId, quantity } });
      }
      merged++;
    }

    await tx.cart.update({ where: { id: cartId }, data: { abandonedReminderSentAt: null } });
    return { merged, skipped };
  });

  return NextResponse.json({ data: result });
}
