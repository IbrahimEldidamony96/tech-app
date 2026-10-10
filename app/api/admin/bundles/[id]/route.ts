import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("marketing:write");
  if (guard.error) return guard.error;
  const { id } = await params;
  const found = await prisma.bundle.findUnique({ where: { id }, select: { id: true, nameEn: true } });
  if (!found) return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.bundle.delete({ where: { id } });
    await writeAuditLog(tx, { actorId: guard.user!.id, action: "DELETE", entityType: "Bundle", entityId: id, summary: `Deleted bundle ${found.nameEn}` });
  });
  return NextResponse.json({ ok: true });
}
