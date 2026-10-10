import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { getOrCreateCart } from "@/lib/cart";
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

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, stock: true, isActive: true, product: { select: { isActive: true } } },
  });

  if (!variant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }
  if (!variant.isActive || !variant.product.isActive) {
    return NextResponse.json({ error: "This product is no longer available" }, { status: 400 });
  }

  const cart = await getOrCreateCart(session!.user.id);

  // ⚠️ الفحص ده استرشادي بس (UX)، مش نقطة إنفاذ فعلية ضد الـ overselling.
  // الفحص الحقيقي بـ row locking/transaction بيحصل وقت الـ checkout
  // (Phase 5) — هنا بنمنع بس تجربة استخدام سيئة زي إنك تضيف كمية
  // أكبر من المتاح وانت لسه بتتصفح، مش أكتر.
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  });

  const desiredQuantity = Math.min((existing?.quantity ?? 0) + quantity, 10, variant.stock);

  if (variant.stock === 0 || desiredQuantity <= 0) {
    return NextResponse.json({ error: "Out of stock" }, { status: 400 });
  }

  const cartItem = existing
    ? await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: desiredQuantity },
        select: { id: true, quantity: true, variantId: true },
      })
    : await prisma.cartItem.create({
        data: { cartId: cart.id, variantId, quantity: desiredQuantity },
        select: { id: true, quantity: true, variantId: true },
      });

  await prisma.cart.update({ where: { id: cart.id }, data: { abandonedReminderSentAt: null } });
  return NextResponse.json({ data: cartItem }, { status: existing ? 200 : 201 });
}
