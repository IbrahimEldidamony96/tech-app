import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { getOrCreateCart } from "@/lib/cart";
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

  const cart = await getOrCreateCart(session!.user.id);
  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { cartId: cart.id } }),
    prisma.cart.update({ where: { id: cart.id }, data: { abandonedReminderSentAt: null } }),
  ]);

  return NextResponse.json({ data: { cleared: true } });
}
