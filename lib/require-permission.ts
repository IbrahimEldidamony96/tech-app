import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type Permission } from "@/lib/permissions";

export async function requirePermission(permission: Permission) {
  const session = await auth();
  if (!session?.user?.id) {
    return { session: null, user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await prisma.user.findFirst({
    where: { id: session.user.id, deletedAt: null },
    select: { id: true, role: true, name: true, email: true },
  });

  if (!user || !hasPermission(user.role, permission)) {
    return { session: null, user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session, user, error: null };
}
