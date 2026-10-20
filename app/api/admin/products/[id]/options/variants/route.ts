import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { variantCreateSchema } from "@/lib/validations/variant";
import { Prisma } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requirePermission("catalog:read");
  if (guard.error) return guard.error;
  const { id: productId } = await params;

  const variants = await prisma.productVariant.findMany({
    where: { productId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sku: true,
      price: true,
      stock: true,
      isActive: true,
      optionValues: { select: { optionValueId: true, optionValue: { select: { valueEn: true } } } },
    },
  });

  return NextResponse.json({ data: variants });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("catalog:write");
  if (error) return error;

  const { id: productId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = variantCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const { optionValueIds, ...variantFields } = parsed.data;

  // نفس منطق المطابقة بالظبط اللي في VariantSelector بتاع العميل —
  // نرتب المجموعتين ونقارن عنصر بعنصر، عشان نمنع تكرار نفس التوليفة
  // (مثلاً "أسود / 128 جيجا" مرتين) بغلطة إدخال
  if (optionValueIds && optionValueIds.length > 0) {
    const existingVariants = await prisma.productVariant.findMany({
      where: { productId },
      select: { optionValues: { select: { optionValueId: true } } },
    });
    const sortedNew = [...optionValueIds].sort();
    const isDuplicate = existingVariants.some((v) => {
      const ids = v.optionValues.map((ov) => ov.optionValueId).sort();
      return ids.length === sortedNew.length && ids.every((id, i) => id === sortedNew[i]);
    });
    if (isDuplicate) {
      return NextResponse.json(
        { error: "A variant with this exact option combination already exists" },
        { status: 409 }
      );
    }
  }

  try {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        ...variantFields,
        ...(optionValueIds &&
          optionValueIds.length > 0 && {
            optionValues: { create: optionValueIds.map((optionValueId) => ({ optionValueId })) },
          }),
      },
      select: {
        id: true,
        sku: true,
        price: true,
        stock: true,
        isActive: true,
        optionValues: { select: { optionValueId: true, optionValue: { select: { valueEn: true } } } },
      },
    });
    return NextResponse.json({ data: variant }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json({ error: "SKU already exists" }, { status: 409 });
      }
      if (err.code === "P2003") {
        return NextResponse.json({ error: "One of the option values doesn't exist" }, { status: 400 });
      }
    }
    throw err;
  }
}
