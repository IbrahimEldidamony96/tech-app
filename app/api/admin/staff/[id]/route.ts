import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  role: z.enum(["CUSTOMER", "SUPPORT", "PRODUCT_MANAGER", "ORDER_MANAGER", "ADMIN", "SUPER_ADMIN"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // staff:manage is reserved for SUPER_ADMIN in the permission matrix.
  const guard = await requirePermission("staff:manage");
  if (guard.error) return guard.error;

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  if (id === guard.user!.id && parsed.data.role === "CUSTOMER") {
    return NextResponse.json({ error: "You cannot remove your own staff access" }, { status: 409 });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Serialize *all* super-admin demotions: concurrent requests must not
    // each observe a second remaining super-admin and remove both.
    await tx.$queryRaw`SELECT id FROM "User"
      WHERE role = 'SUPER_ADMIN' AND "deletedAt" IS NULL ORDER BY id FOR UPDATE`;

    // A super-admin may have been demoted while the request waited on the lock.
    const actor = await tx.user.findUnique({
      where: { id: guard.user!.id },
      select: { role: true, deletedAt: true },
    });
    if (!actor || actor.deletedAt || actor.role !== "SUPER_ADMIN") {
      return { kind: "forbidden" as const };
    }

    const before = await tx.user.findUnique({
      where: { id },
      select: { role: true, email: true, deletedAt: true },
    });
    if (!before || before.deletedAt) return { kind: "missing" as const };

    if (before.role === "SUPER_ADMIN" && parsed.data.role !== "SUPER_ADMIN") {
      const activeSuperAdmins = await tx.user.count({
        where: { role: "SUPER_ADMIN", deletedAt: null },
      });
      if (activeSuperAdmins <= 1) return { kind: "last_super_admin" as const };
    }

    const user = await tx.user.update({
      where: { id },
      data: { role: parsed.data.role, sessionVersion: { increment: 1 } },
      select: { id: true, name: true, email: true, role: true },
    });
    await writeAuditLog(tx, {
      actorId: guard.user!.id,
      action: "UPDATE",
      entityType: "User",
      entityId: id,
      summary: `Role changed for ${before.email}: ${before.role} -> ${parsed.data.role}`,
      metadata: { from: before.role, to: parsed.data.role },
    });
    return { kind: "updated" as const, user };
  });

  if (result.kind === "missing") return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (result.kind === "last_super_admin") {
    return NextResponse.json({ error: "Cannot demote the last active super-admin" }, { status: 409 });
  }
  return NextResponse.json({ user: result.user });
}
