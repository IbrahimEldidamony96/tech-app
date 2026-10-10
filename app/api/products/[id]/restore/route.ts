import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { writeAuditLog } from "@/lib/audit";
import { Prisma } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { error, user } = await requirePermission("catalog:write");
  if (error) return error;
  const { id } = await params;
  try {
    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data: { deletedAt: null, isActive: true }, select: { id: true, nameEn: true } });
      await writeAuditLog(tx, { actorId: user!.id, action: "RESTORE", entityType: "Product", entityId: id, summary: `Restored product ${updated.nameEn}` });
      return updated;
    });
    return NextResponse.json({ data: product });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return NextResponse.json({ error: "Product not found" }, { status: 404 });
    throw err;
  }
}
