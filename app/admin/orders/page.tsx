import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { getAllOrders } from "@/lib/queries/admin-orders";
import type { OrderStatus } from "@/app/generated/prisma/client";

const STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

type SearchParams = Promise<{ status?: string }>;

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "orders:read")) redirect("/");

  const { status } = await searchParams;
  const orders = await getAllOrders(status as OrderStatus | undefined);

  const t = await getTranslations("AdminOrders");
  const tStatus = await getTranslations("OrderStatus");
  const tPayment = await getTranslations("PaymentStatus");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-bold text-ink">{t("title")}</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/orders"
          className={`rounded-md border px-3 py-1 text-xs font-medium ${
            !status ? "border-ink bg-ink text-paper" : "border-steel/25 text-steel"
          }`}
        >
          {t("all")}
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/orders?status=${s}`}
            className={`rounded-md border px-3 py-1 text-xs font-medium ${
              status === s ? "border-ink bg-ink text-paper" : "border-steel/25 text-steel"
            }`}
          >
            {tStatus(s)}
          </Link>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-steel/15">
        <table className="w-full text-sm">
          <thead className="bg-steel/5 text-start text-xs uppercase tracking-wide text-steel">
            <tr>
              <th className="px-4 py-2 text-start">{t("order")}</th>
              <th className="px-4 py-2 text-start">{t("customer")}</th>
              <th className="px-4 py-2 text-start">{t("status")}</th>
              <th className="px-4 py-2 text-start">{t("payment")}</th>
              <th className="px-4 py-2 text-end">{t("total")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel/10">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-steel/5">
                <td className="px-4 py-3">
                  <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs text-ink hover:underline">
                    #{order.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-steel">
                  {order.user?.name ?? `${order.shippingFirstName} ${order.shippingLastName}`.trim()}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-steel/10 px-2 py-0.5 text-xs font-medium text-ink">
                    {tStatus(order.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-steel">{tPayment(order.paymentStatus)}</td>
                <td className="px-4 py-3 text-end font-mono text-ink">
                  EGP {order.total.toNumber().toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <p className="p-6 text-center text-sm text-steel">{t("noOrders")}</p>}
      </div>
    </div>
  );
}
