import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { variantCreateSchema } from "@/lib/validations/variant";
import { Prisma } from "@/app/generated/prisma/client";
import { createProductVariant, VariantCreationError } from "@/lib/variant-creation";

type Params = { params: Promise<{ id: string }> };

// *** باج كان موجود: الـ GET ده كان عام بالكامل (من غير أي تسجيل دخول)،
// وبيرجّع الـ SKU والمخزون الدقيق لكل variant — وكمان الـ variants
// الغير مفعّلة (isActive: false)، اللي المفروض تبقى مخفية. المستخدم
// الوحيد الحقيقي للـ endpoint ده هو لوحة الأدمن (variants-manager.tsx)؛
// صفحة المنتج للعميل بتاخد بياناتها من استعلام منفصل
// (lib/queries/product-detail.ts) مباشرة، مش من هنا. فمفيش داعي يفضل عام.
export async function GET(_request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("catalog:write");
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

  try {
    const variant = await createProductVariant(productId, user!.id, parsed.data);
    return NextResponse.json({ data: variant }, { status: 201 });
  } catch (err) {
    if (err instanceof VariantCreationError) return NextResponse.json({ error: err.message }, { status: err.status });
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
