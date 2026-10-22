import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { getWishlistForUser } from "@/lib/queries/wishlist";
import { effectiveVariantPrice, isSaleActive } from "@/lib/product-pricing";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getOrCreateWishlist } from "@/lib/wishlist";
export async function GET() {
  const { session, error } = await requireUser(); if (error) return error;
  const rows = await getWishlistForUser(session.user.id);
  return NextResponse.json({ data: rows.map(row => ({ ...row, product: { ...row.product,
    variants: row.product.variants.map(v => ({ ...v, effectivePrice: effectiveVariantPrice(v).toNumber(), saleActive: isSaleActive(v) })),
  } })) });
}

export async function DELETE(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;
  const parsed = z.object({ productId: z.string().min(1).max(128) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  await prisma.wishlistItem.deleteMany({ where: { productId: parsed.data.productId, wishlist: { userId: session.user.id } } });
  return NextResponse.json({ success: true });
}

export async function PUT(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;
  const parsed = z.object({ productId: z.string().min(1).max(128), saved: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid wishlist selection" }, { status: 400 });
  const { productId, saved } = parsed.data;
  if (saved) {
    const product = await prisma.product.findFirst({ where: { id: productId, isActive: true, deletedAt: null }, select: { id: true } });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const wishlist = await getOrCreateWishlist(session.user.id);
    await prisma.wishlistItem.createMany({ data: { wishlistId: wishlist.id, productId }, skipDuplicates: true });
  } else await prisma.wishlistItem.deleteMany({ where: { productId, wishlist: { userId: session.user.id } } });
  return NextResponse.json({ data: { productId, saved } });
}
