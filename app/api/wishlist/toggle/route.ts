import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { getOrCreateWishlist } from "@/lib/wishlist";
import { toggleWishlistSchema } from "@/lib/validations/wishlist";

// endpoint واحد بس لضغطة "القلب" — لو المنتج مش محفوظ يتحفظ، لو محفوظ
// يتشال. أبسط من endpoint إضافة + endpoint حذف منفصلين للاستخدام ده تحديدًا.
export async function POST(request: NextRequest) {
  const { session, error } = await requireUser();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = toggleWishlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { productId } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const wishlist = await getOrCreateWishlist(session!.user.id);

  const existing = await prisma.wishlistItem.findUnique({
    where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
  });

  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
    return NextResponse.json({ data: { productId, saved: false } });
  }

  await prisma.wishlistItem.create({ data: { wishlistId: wishlist.id, productId } });
  return NextResponse.json({ data: { productId, saved: true } }, { status: 201 });
}
