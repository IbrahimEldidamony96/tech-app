import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { withLockedCart } from "@/lib/cart";
import { addToCartSchema } from "@/lib/validations/cart";

export async function POST(request: NextRequest) {
  const { session, error } = await requireUser();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = addToCartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { variantId, quantity } = parsed.data;

  return withLockedCart(session!.user.id, async (tx, cartId) => {
    const variant = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: { stock: true, isActive: true, product: { select: { isActive: true, deletedAt: true } } },
    });
    if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    if (!variant.isActive || !variant.product.isActive || variant.product.deletedAt) {
      return NextResponse.json({ error: "This product is no longer available" }, { status: 400 });
    }
    // This stock cap is advisory. Checkout reserves inventory atomically.
    const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
    const quantityToSave = Math.min((existing?.quantity ?? 0) + quantity, 10, variant.stock);
    if (quantityToSave <= 0) return NextResponse.json({ error: "Out of stock" }, { status: 400 });
    const item = await tx.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      create: { cartId, variantId, quantity: quantityToSave }, update: { quantity: quantityToSave },
      select: { id: true, quantity: true, variantId: true },
    });
    await tx.cart.update({ where: { id: cartId }, data: { abandonedReminderSentAt: null } });
    return NextResponse.json({ data: item }, { status: existing ? 200 : 201 });
  });
}
