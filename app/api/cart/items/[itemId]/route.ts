import { NextRequest, NextResponse } from "next/server";
import { withLockedCart } from "@/lib/cart";
import { requireUser } from "@/lib/require-user";
import { updateCartItemSchema } from "@/lib/validations/cart";

type Params = { params: Promise<{ itemId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { itemId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateCartItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  return withLockedCart(session!.user.id, async (tx, cartId) => {
    const item = await tx.cartItem.findFirst({
      where: { id: itemId, cartId },
      select: { variant: { select: { stock: true } } },
    });
    if (!item) return NextResponse.json({ error: "Cart item not found" }, { status: 404 });
    const quantity = Math.min(parsed.data.quantity, item.variant.stock);
    if (quantity <= 0) return NextResponse.json({ error: "Out of stock" }, { status: 400 });
    const updated = await tx.cartItem.update({ where: { id: itemId }, data: { quantity }, select: { id: true, quantity: true } });
    await tx.cart.update({ where: { id: cartId }, data: { abandonedReminderSentAt: null } });
    return NextResponse.json({ data: updated });
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { session, error } = await requireUser();
  if (error) return error;
  const { itemId } = await params;
  return withLockedCart(session!.user.id, async (tx, cartId) => {
    const deleted = await tx.cartItem.deleteMany({ where: { id: itemId, cartId } });
    if (deleted.count !== 1) return NextResponse.json({ error: "Cart item not found" }, { status: 404 });
    await tx.cart.update({ where: { id: cartId }, data: { abandonedReminderSentAt: null } });
    return NextResponse.json({ data: { id: itemId, deleted: true } });
  });
}
