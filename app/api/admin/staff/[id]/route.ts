import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  role: z.enum(["CUSTOMER", "SUPPORT", "PRODUCT_MANAGER", "ORDER_MANAGER", "ADMIN", "SUPER_ADMIN"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("staff:manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  if (id === guard.user!.id && parsed.data.role === "CUSTOMER") {
    return NextResponse.json({ error: "You cannot remove your own staff access" }, { status: 409 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: { role: true, email: true } });
    if (!before) return null;
    const user = await tx.user.update({ where: { id }, data: { role: parsed.data.role }, select: { id: true, name: true, email: true, role: true } });
    await writeAuditLog(tx, {
      actorId: guard.user!.id,
      action: "UPDATE",
      entityType: "User",
      entityId: id,
      summary: `Role changed for ${before.email}: ${before.role} -> ${parsed.data.role}`,
      metadata: { from: before.role, to: parsed.data.role },
    });
    return user;
  });
  if (!result) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ user: result });
}
