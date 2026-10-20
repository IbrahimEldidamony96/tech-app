import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { ReturnStatusActions } from "@/components/admin/return-status-actions";
import { ReturnRefundActions } from "@/components/admin/return-refund-actions";

export const dynamic = "force-dynamic";

export default async function AdminReturnsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  // Never trust the 7-day session role snapshot for customer refunds/details.
  const actor = await prisma.user.findFirst({
    where: { id: session.user.id, deletedAt: null },
    select: { role: true },
  });
  if (!hasPermission(actor?.role, "returns:read")) redirect("/");

  const canWrite = hasPermission(actor!.role, "returns:write");
  const rows = await prisma.returnRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { name: true, email: true } },
      order: { select: { id: true, paymentStatus: true, payment: { select: { method: true } } } },
      refund: { select: { status: true, amount: true } },
      items: { include: { orderItem: { select: { productName: true, sku: true } } } },
    },
  });

  return <main className="mx-auto max-w-6xl px-4 py-10">
    <h1 className="text-2xl font-bold">Returns & refunds</h1>
    <p className="mt-2 text-sm text-steel">Refund intents never issue a bank/Paymob transfer. Confirm only after external settlement.</p>
    <div className="mt-6 space-y-4">
      {rows.map((r) => <article key={r.id} className="rounded border border-steel/15 p-4">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <strong>{r.status}</strong>
            <p className="text-sm text-steel">{r.user.name} · {r.user.email} · Order {r.orderId}</p>
            <p className="text-xs text-steel">Payment: {r.order.paymentStatus}</p>
          </div>
          <span className="text-xs text-steel">{r.createdAt.toLocaleString()}</span>
        </div>
        <p className="mt-2 text-sm">{r.reason}</p>
        <p className="mt-2 text-xs text-steel">
          {r.items.map(i => `${i.quantity}× ${i.orderItem.productName} (${i.orderItem.sku})`).join(", ")}
        </p>
        {canWrite ? <div className="mt-3">
          <ReturnStatusActions id={r.id} current={r.status} />
          <ReturnRefundActions id={r.id} current={r.status}
            refund={r.refund ? { status: r.refund.status, amount: r.refund.amount.toFixed(2) } : null}
            paymentMethod={r.order.payment?.method} canConfirm={actor!.role === "ADMIN" || actor!.role === "SUPER_ADMIN"} />
        </div> : null}
      </article>)}
    </div>
  </main>;
}
