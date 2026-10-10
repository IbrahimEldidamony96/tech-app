import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { categoryUpdateSchema } from "@/lib/validations/category";
import { Prisma } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { error: authError } = await requirePermission("catalog:write");
  if (authError) return authError;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = categoryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.parentId === id) {
    return NextResponse.json({ error: "A category cannot be its own parent" }, { status: 400 });
  }

  if (parsed.data.parentId) {
    const categories = await prisma.category.findMany({
      select: { id: true, parentId: true },
    });
    const descendants = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const category of categories) {
        if (
          category.parentId &&
          descendants.has(category.parentId) &&
          !descendants.has(category.id)
        ) {
          descendants.add(category.id);
          changed = true;
        }
      }
    }
    if (descendants.has(parsed.data.parentId)) {
      return NextResponse.json(
        { error: "A category cannot be moved under one of its descendants" },
        { status: 400 },
      );
    }
  }

  try {
    const category = await prisma.category.update({
      where: { id },
      data: parsed.data,
      select: { id: true, nameEn: true, nameAr: true, slug: true, parentId: true },
    });
    return NextResponse.json({ data: category });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
      if (err.code === "P2002") {
        return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
      }
      if (err.code === "P2003") {
        return NextResponse.json({ error: "parentId does not exist" }, { status: 400 });
      }
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { error: authError } = await requirePermission("catalog:write");
  if (authError) return authError;

  const { id } = await params;

  // هنا بالظبط بيبان تأثير قرار Phase 0: onDelete: Restrict على
  // parent→children و categoryId→Category يخلي Postgres يرفض الحذف
  // لوحده لو فيه children أو products لسه مربوطين — إحنا بس بنترجم
  // الـ P2003 (foreign key) لرسالة مفهومة للأدمن بدل الخطأ الخام
  try {
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ data: { id, deleted: true } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
      if (err.code === "P2003") {
        return NextResponse.json(
          {
            error:
              "Cannot delete category: it still has subcategories or products assigned to it. Reassign or remove them first.",
          },
          { status: 409 }
        );
      }
    }
    throw err;
  }
}
