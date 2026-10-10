import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

  // *** فحص ملكية مهم ***: من غير الشرط ده، أي يوزر مسجل دخول يقدر
  // يعدّل quantity بتاع أي cart item لأي حد تاني، لو عرف الـ id بس
  // (IDOR — Insecure Direct Object Reference). دايمًا تأكد إن الـ resource
  // فعلاً بتاع اليوزر اللي بينفذ الطلب قبل أي update/delete.
  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    select: { id: true, cartId: true, cart: { select: { userId: true } }, variant: { select: { stock: true } } },
  });

  if (!item || item.cart.userId !== session!.user.id) {
    return NextResponse.json({ error: "Cart item not found" }, { status: 404 });
  }

  const quantity = Math.min(parsed.data.quantity, item.variant.stock);
  if (quantity <= 0) {
    return NextResponse.json({ error: "Out of stock" }, { status: 400 });
  }

  const updated = await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
    select: { id: true, quantity: true },
  });

  await prisma.cart.update({ where: { id: item.cartId }, data: { abandonedReminderSentAt: null } });
  return NextResponse.json({ data: updated });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { itemId } = await params;

  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    select: { id: true, cartId: true, cart: { select: { userId: true } } },
  });

  if (!item || item.cart.userId !== session!.user.id) {
    return NextResponse.json({ error: "Cart item not found" }, { status: 404 });
  }

  await prisma.cartItem.delete({ where: { id: itemId } });
  await prisma.cart.update({ where: { id: item.cartId }, data: { abandonedReminderSentAt: null } });

  return NextResponse.json({ data: { id: itemId, deleted: true } });
}
