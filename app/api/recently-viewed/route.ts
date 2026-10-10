import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;
  const items = await prisma.recentlyViewed.findMany({
    where: { userId: session!.user.id },
    orderBy: { viewedAt: "desc" },
    take: 30,
    include: {
      product: {
        select: {
          id: true, slug: true, nameEn: true, nameAr: true,
          images: { where: { isPrimary: true }, take: 1, select: { url: true, alt: true } },
          variants: { where: { isActive: true }, orderBy: { price: "asc" }, take: 1, select: { price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true, stock: true } },
        },
      },
    },
  });
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
