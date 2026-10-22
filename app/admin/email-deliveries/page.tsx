import { prisma } from "@/lib/prisma";
import { requireAdminPagePermission } from "@/lib/require-admin-page-permission";
import { EmailDeliveryReview } from "@/components/admin/email-delivery-review";

export default async function EmailDeliveriesPage() {
  await requireAdminPagePermission("settings:manage");
  const rows = await prisma.emailDelivery.findMany({ where: { status: "NEEDS_REVIEW" }, orderBy: { createdAt: "asc" }, take: 100, select: { key: true, firstAttemptAt: true, attempts: true } });
  return <div className="page-shell space-y-5">
    <h1 className="page-heading">Email delivery review</h1>
    <p className="text-sm text-steel">Automatic retries stopped because the provider duplicate protection window has closed. Check the Resend delivery logs. Confirm an existing delivery here. If no email was accepted, send it once from the provider dashboard, then record the delivered message reference here.</p>
    {!rows.length && <p>No deliveries need review.</p>}
    {rows.map(row => <section key={row.key} className="surface-card space-y-3">
      <p className="break-all font-mono text-xs">{row.key}</p>
      <p className="text-sm text-steel">{row.attempts} attempts; first attempt: {row.firstAttemptAt?.toISOString() ?? "unknown"}</p>
      <EmailDeliveryReview deliveryKey={row.key} />
    </section>)}
  </div>;
}
