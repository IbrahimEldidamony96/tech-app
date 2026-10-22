import { getRecentlyViewed } from "@/lib/queries/recently-viewed";
import { effectiveVariantPrice, isSaleActive } from "@/lib/product-pricing";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;
  const rows = await getRecentlyViewed(session!.user.id);
  const items = rows.map(row => ({ ...row, product: { ...row.product, variants: row.product.variants.map(v => ({ ...v, effectivePrice: effectiveVariantPrice(v).toNumber(), saleActive: isSaleActive(v) })) } }));
  return NextResponse.json({ data: items });
}

export async function POST(request: Request) {
  const { session, error } = await requireUser();
  if (error) return error;
  const parsed = z.object({ productId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  const product = await prisma.product.findFirst({ where: { id: parsed.data.productId, isActive: true, deletedAt: null }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  await prisma.recentlyViewed.upsert({
    where: { userId_productId: { userId: session!.user.id, productId: product.id } },
    create: { userId: session!.user.id, productId: product.id },
    update: { viewedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { session, error } = await requireUser();
  if (error) return error;
  await prisma.recentlyViewed.deleteMany({ where: { userId: session!.user.id } });
  return NextResponse.json({ ok: true });
}
