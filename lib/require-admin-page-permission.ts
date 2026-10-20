import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type Permission } from "@/lib/permissions";

/**
 * Always revalidate current permissions against the User row, not the
 * seven-day role snapshot embedded in the JWT. Must run before any admin
 * database query that could disclose customer or audit information.
 */
export async function requireAdminPagePermission(permission: Permission) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findFirst({
    where: { id: session.user.id, deletedAt: null },
    select: { id: true, role: true },
  });
  if (!user || !hasPermission(user.role, permission)) redirect("/");
  return user;
}
