import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { productUpdateSchema } from "@/lib/validations/product";
import { writeAuditLog } from "@/lib/audit";
import { Prisma } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { error, user } = await requirePermission("catalog:write");
  if (error) return error;
  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = productUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const nullableText = ["descriptionEn", "descriptionAr", "metaTitleEn", "metaTitleAr", "metaDescriptionEn", "metaDescriptionAr"] as const;
  const data: Prisma.ProductUncheckedUpdateInput = { ...parsed.data };
  for (const key of nullableText) {
    const value = parsed.data[key];
    if (value !== undefined) (data as Record<string, unknown>)[key] = value === null || value.trim() === "" ? null : value.trim();
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  try {
    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id, deletedAt: null },
        data,
        select: { id: true, nameEn: true, nameAr: true, slug: true, isActive: true, categoryId: true, brandId: true },
      });
      await writeAuditLog(tx, {
        actorId: user!.id,
        action: "UPDATE",
        entityType: "Product",
        entityId: id,
        summary: `Updated product ${updated.nameEn}`,
        metadata: parsed.data,
      });
      return updated;
    });
    return NextResponse.json({ data: product });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return NextResponse.json({ error: "Product not found" }, { status: 404 });
      if (err.code === "P2002") return NextResponse.json({ error: "A product with this slug already exists" }, { status: 409 });
      if (err.code === "P2003") return NextResponse.json({ error: "Category or brand does not exist" }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { error, user } = await requirePermission("catalog:write");
  if (error) return error;
  const { id } = await params;

  try {
    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date(), isActive: false },
        select: { id: true, nameEn: true, deletedAt: true },
      });
      await writeAuditLog(tx, {
        actorId: user!.id, action: "DELETE", entityType: "Product", entityId: id,
        summary: `Archived product ${updated.nameEn}`,
      });
      return updated;
    });
    return NextResponse.json({ data: product });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Product not found or already archived" }, { status: 404 });
    }
    throw err;
  }
}
