import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { brandUpdateSchema } from "@/lib/validations/brand";
import { Prisma } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("catalog:write");
  if (error) return error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = brandUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const brand = await prisma.brand.update({
      where: { id },
      data: parsed.data,
      select: { id: true, name: true, slug: true },
    });
    return NextResponse.json({ data: brand });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Brand not found" }, { status: 404 });
      }
      if (err.code === "P2002") {
        return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
      }
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("catalog:write");
  if (error) return error;

  const { id } = await params;

  // ملحوظة مهمة: Product.brandId معمول onDelete: SetNull (مش Restrict
  // زي الكاتيجوري). يعني حذف براند مش هيترفض حتى لو عنده منتجات —
  // المنتجات دي هتفضل موجودة، بس brandId بتاعها هيبقى null. ده قرار
  // متعمد: البراند بيانات وصفية اختيارية، مش جزء من هيكل الكاتالوج
  // الأساسي زي الكاتيجوري.
  try {
    await prisma.brand.delete({ where: { id } });
    return NextResponse.json({ data: { id, deleted: true } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }
    throw err;
  }
}
