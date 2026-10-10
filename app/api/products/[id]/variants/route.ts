import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { variantCreateSchema } from "@/lib/validations/variant";
import { Prisma } from "@/app/generated/prisma/client";
import { syncProductStartingPrice } from "@/lib/product-maintenance";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// *** باج كان موجود: الـ GET ده كان عام بالكامل (من غير أي تسجيل دخول)،
// وبيرجّع الـ SKU والمخزون الدقيق لكل variant — وكمان الـ variants
// الغير مفعّلة (isActive: false)، اللي المفروض تبقى مخفية. المستخدم
// الوحيد الحقيقي للـ endpoint ده هو لوحة الأدمن (variants-manager.tsx)؛
// صفحة المنتج للعميل بتاخد بياناتها من استعلام منفصل
// (lib/queries/product-detail.ts) مباشرة، مش من هنا. فمفيش داعي يفضل عام.
export async function GET(_request: NextRequest, { params }: Params) {
  const { error, user } = await requirePermission("catalog:write");
  if (error) return error;

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
      optionValues: {
        select: {
          optionValueId: true,
          optionValue: { select: { valueEn: true } },
        },
      },
    },
  });

  return NextResponse.json({ data: variants });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { error, user } = await requirePermission("catalog:write");
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
      { status: 400 },
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const { optionValueIds, ...variantFields } = parsed.data;

  if (optionValueIds && optionValueIds.length > 0) {
    const uniqueIds = [...new Set(optionValueIds)];
    if (uniqueIds.length !== optionValueIds.length) {
      return NextResponse.json(
        { error: "Duplicate option values are not allowed" },
        { status: 400 },
      );
    }

    const values = await prisma.productOptionValue.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        optionId: true,
        option: { select: { productId: true } },
      },
    });
    if (values.length !== uniqueIds.length) {
      return NextResponse.json(
        { error: "One or more option values do not exist" },
        { status: 400 },
      );
    }
    if (values.some((value) => value.option.productId !== productId)) {
      return NextResponse.json(
        { error: "Every option value must belong to this product" },
        { status: 400 },
      );
    }
    if (new Set(values.map((value) => value.optionId)).size !== values.length) {
      return NextResponse.json(
        { error: "A variant can contain only one value from each option" },
        { status: 400 },
      );
    }
    const existingVariants = await prisma.productVariant.findMany({
      where: { productId },
      select: { optionValues: { select: { optionValueId: true } } },
    });
    const sortedNew = [...optionValueIds].sort();
    const isDuplicate = existingVariants.some((v) => {
      const ids = v.optionValues.map((ov) => ov.optionValueId).sort();
      return (
        ids.length === sortedNew.length &&
        ids.every((id, i) => id === sortedNew[i])
      );
    });
    if (isDuplicate) {
      return NextResponse.json(
        {
          error: "A variant with this exact option combination already exists",
        },
        { status: 409 },
      );
    }
  }

  try {
    const variant = await prisma.$transaction(async (tx) => {
      const created = await tx.productVariant.create({
        data: {
          productId,
          ...variantFields,
          ...(optionValueIds && optionValueIds.length > 0 && {
            optionValues: { create: optionValueIds.map((optionValueId) => ({ optionValueId })) },
          }),
        },
        select: {
          id: true, sku: true, price: true, stock: true, isActive: true,
          salePrice: true, saleStartsAt: true, saleEndsAt: true,
          optionValues: { select: { optionValueId: true, optionValue: { select: { valueEn: true } } } },
        },
      });
      if (created.stock > 0) {
        await tx.inventoryMovement.create({ data: { variantId: created.id, type: "ADMIN_ADJUSTMENT", quantityDelta: created.stock, stockAfter: created.stock, referenceType: "VARIANT_CREATE", referenceId: created.id, note: "Initial stock" } });
      }
      await writeAuditLog(tx, { actorId: user!.id, action: "CREATE", entityType: "ProductVariant", entityId: created.id, summary: `Created variant ${created.sku}` });
      return created;
    });
    await syncProductStartingPrice(productId);
    return NextResponse.json({ data: variant }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json(
          { error: "SKU already exists" },
          { status: 409 },
        );
      }
      if (err.code === "P2003") {
        return NextResponse.json(
          { error: "One of the option values doesn't exist" },
          { status: 400 },
        );
      }
    }
    throw err;
  }
}
