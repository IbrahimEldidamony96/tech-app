import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

const bodySchema = z.object({ productId: z.string().min(1) });

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;
  const alerts = await prisma.stockAlert.findMany({ where: { userId: session!.user.id, notifiedAt: null }, orderBy: { createdAt: "desc" }, include: { product: { select: { id: true, slug: true, nameEn: true, nameAr: true } } } });
  return NextResponse.json({ data: alerts });
}

export async function POST(request: Request) {
  const { session, error } = await requireUser(); if (error) return error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  const product = await prisma.product.findFirst({ where: { id: parsed.data.productId, isActive: true, deletedAt: null }, select: { id: true, variants: { where: { isActive: true, stock: { gt: 0 } }, take: 1, select: { id: true } } } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (product.variants.length) return NextResponse.json({ error: "Product is already in stock" }, { status: 409 });
  const alert = await prisma.stockAlert.upsert({ where: { userId_productId: { userId: session!.user.id, productId: product.id } }, create: { userId: session!.user.id, productId: product.id }, update: { notifiedAt: null } });
  return NextResponse.json({ data: alert }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { session, error } = await requireUser(); if (error) return error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  await prisma.stockAlert.deleteMany({ where: { userId: session!.user.id, productId: parsed.data.productId } });
  return NextResponse.json({ ok: true });
}
