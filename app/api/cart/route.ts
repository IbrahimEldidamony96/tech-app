import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { withLockedCart } from "@/lib/cart";
import { getCartForUser } from "@/lib/queries/cart";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const cart = await getCartForUser(session!.user.id);
  return NextResponse.json({ data: cart });
}

export async function DELETE() {
  const { session, error } = await requireUser();
  if (error) return error;

  await withLockedCart(session!.user.id, async (tx, cartId) => {
    await tx.cartItem.deleteMany({ where: { cartId } });
    await tx.cart.update({ where: { id: cartId }, data: { abandonedReminderSentAt: null } });
  });

  return NextResponse.json({ data: { cleared: true } });
}
