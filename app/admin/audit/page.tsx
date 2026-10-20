import { requireAdminPagePermission } from "@/lib/require-admin-page-permission";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function AuditPage() {
  const guardedUser = await requireAdminPagePermission("audit:read");
  const logs = await prisma.auditLog.findMany({ include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return <main className="mx-auto max-w-6xl px-4 py-10"><h1 className="text-2xl font-bold text-ink">Audit Log</h1><div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-steel/20"><th className="p-2">Time</th><th className="p-2">Actor</th><th className="p-2">Action</th><th className="p-2">Entity</th><th className="p-2">Summary</th></tr></thead><tbody>{logs.map((l)=><tr key={l.id} className="border-b border-steel/10"><td className="p-2 whitespace-nowrap">{l.createdAt.toLocaleString()}</td><td className="p-2">{l.actor?.email ?? "System"}</td><td className="p-2 font-mono text-xs">{l.action}</td><td className="p-2">{l.entityType}</td><td className="p-2">{l.summary}</td></tr>)}</tbody></table></div></main>;
}
