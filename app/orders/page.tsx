import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getOrdersForUser } from "@/lib/queries/orders";

// *** ده كان بالغلط بينده على getAllOrders (استعلام الأدمن) ويرفض أي
// حد مش أدمن — يعني اليوزر العادي كان بيتحوّل بره ("/") لما يدوس على
// "Orders" في الـ header، ومفيش أي صفحة فعلية بتوريله هو طلباته. الصفحة
// دي بقت بتاعة اليوزر نفسه فعلاً: طلباته هو بس، من غير أي فحص أدمن.
export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/orders");

  const orders = await getOrdersForUser(session.user.id);
  const t = await getTranslations("OrdersPage");
  const tStatus = await getTranslations("OrderStatus");
  const tPayment = await getTranslations("PaymentStatus");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-bold text-ink">{t("title")}</h1>

      {orders.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-steel">{t("empty")}</p>
          <Link href="/" className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper">
            {t("browseProducts")}
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-steel/15">
          <table className="w-full text-sm">
            <thead className="bg-steel/5 text-start text-xs uppercase tracking-wide text-steel">
              <tr>
                <th className="px-4 py-2 text-start">{t("order")}</th>
                <th className="px-4 py-2 text-start">{t("date")}</th>
                <th className="px-4 py-2 text-start">{t("status")}</th>
                <th className="px-4 py-2 text-start">{t("payment")}</th>
                <th className="px-4 py-2 text-end">{t("total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel/10">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-steel/5">
                  <td className="px-4 py-3">
                    <Link href={`/orders/${order.id}`} className="block font-mono text-xs text-ink hover:underline">
                      #{order.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-steel">
                    <Link href={`/orders/${order.id}`} className="block">
                      {order.createdAt.toLocaleDateString()}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${order.id}`} className="block">
                      <span className="rounded bg-steel/10 px-2 py-0.5 text-xs font-medium text-ink">
                        {tStatus(order.status)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-steel">
                    <Link href={`/orders/${order.id}`} className="block">
                      {tPayment(order.paymentStatus)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-end font-mono text-ink">
                    <Link href={`/orders/${order.id}`} className="block">
                      EGP {order.total.toNumber().toLocaleString()}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
