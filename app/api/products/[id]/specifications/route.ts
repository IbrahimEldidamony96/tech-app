import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { productSpecificationsReplaceSchema } from "@/lib/validations/product";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const specs = await prisma.productSpecification.findMany({ where: { productId: id }, orderBy: [{ sortOrder: "asc" }, { keyEn: "asc" }] });
  return NextResponse.json({ data: specs });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { error, user } = await requirePermission("catalog:write");
  if (error) return error;
  const { id } = await params;
  const parsed = productSpecificationsReplaceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid specifications", details: parsed.error.flatten() }, { status: 400 });

  const exists = await prisma.product.count({ where: { id, deletedAt: null } });
  if (!exists) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const data = await prisma.$transaction(async (tx) => {
    await tx.productSpecification.deleteMany({ where: { productId: id } });
    if (parsed.data.specifications.length) {
      await tx.productSpecification.createMany({ data: parsed.data.specifications.map((s) => ({ ...s, productId: id })) });
    }
    await writeAuditLog(tx, { actorId: user!.id, action: "UPDATE", entityType: "ProductSpecification", entityId: id, summary: `Replaced ${parsed.data.specifications.length} product specifications` });
    return tx.productSpecification.findMany({ where: { productId: id }, orderBy: [{ sortOrder: "asc" }, { keyEn: "asc" }] });
  });
  return NextResponse.json({ data });
}
