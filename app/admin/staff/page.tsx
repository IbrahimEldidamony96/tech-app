import { requireAdminPagePermission } from "@/lib/require-admin-page-permission";
import { prisma } from "@/lib/prisma";
import { StaffRoleSelect } from "@/components/admin/staff-role-select";

export const dynamic = "force-dynamic";
export default async function StaffPage() {
  await requireAdminPagePermission("staff:manage");
  const users = await prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true, email: true, role: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 200 });
  return <main className="mx-auto max-w-5xl px-4 py-10"><h1 className="text-2xl font-bold text-ink">Staff & Roles</h1><p className="mt-1 text-sm text-steel">Changes take effect immediately in server APIs.</p><div className="mt-6 divide-y divide-steel/10 rounded-lg border border-steel/15">{users.map((u)=><div key={u.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_1fr_220px] sm:items-center"><div><p className="font-medium text-ink">{u.name}</p><p className="text-xs text-steel">{u.email}</p></div><p className="text-xs text-steel">Joined {u.createdAt.toLocaleDateString()}</p><StaffRoleSelect userId={u.id} value={u.role} /></div>)}</div></main>;
}
