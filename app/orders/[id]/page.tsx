import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CompletePaymentButton } from "@/components/complete-payment-button";
import { CancelOrderButton } from "@/components/cancel-order-button";
import Link from "next/link";
import { hasPermission } from "@/lib/permissions";

type Params = Promise<{ id: string }>;

export default async function OrderPage({ params }: { params: Params }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect(`/login?next=/orders/${id}`);

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, payment: true, shipment: true, events: { orderBy: { createdAt: "asc" } } },
  });

  if (!order) notFound();
  // نفس فحص الملكية من الـ API — صاحب الأوردر أو الأدمن بس
  if (order.userId !== session.user.id && !hasPermission(session.user.role, "orders:read"))
    notFound();

  const needsPayment =
    order.payment &&
    order.payment.method !== "CASH_ON_DELIVERY" &&
    order.payment.status === "PENDING";

  // Mirrors app/api/orders/[id]/cancel/route.ts exactly: only the order's own
  // owner can self-cancel, and only before it enters fulfillment. An admin
  // viewing someone else's order here uses the admin cancel route instead,
  // so the button is intentionally hidden for that case.
  const canCancel =
    order.userId === session.user.id &&
    (order.status === "PENDING" || order.status === "CONFIRMED");

  const t = await getTranslations("OrderDetail");
  const tStatus = await getTranslations("OrderStatus");
  const tPayment = await getTranslations("PaymentStatus");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="font-mono text-xs uppercase tracking-wide text-signal">
        {t("orderConfirmed")}
      </p>
      <h1 className="mt-1 font-display text-2xl font-bold text-ink">
        {t("thankYou")}
      </h1>
      <p className="mt-1 font-mono text-sm text-steel">#{order.id}</p>

      <div className="mt-8 rounded-lg border border-steel/15 p-5">
        <ul className="space-y-2">
          {order.items.map((item) => (
            // item.productName صورة تاريخية باللغة اللي اتحفظت بيها وقت
            // الشراء (الإنجليزية بس حاليًا — الـ schema مفيهوش productNameAr)،
            // فبتفضل زي ما هي بغض النظر عن اللغة الحالية، عكس بقية الصفحة
            <li key={item.id} className="flex justify-between text-sm">
              <span className="text-steel">
                {item.productName} × {item.quantity}
              </span>
              <span className="font-mono text-ink">
                EGP {item.totalPrice.toNumber().toLocaleString()}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-1 border-t border-steel/15 pt-4 text-sm">
          <div className="flex justify-between text-steel">
            <span>{t("subtotal")}</span>
            <span className="font-mono">
              EGP {order.subtotal.toNumber().toLocaleString()}
            </span>
          </div>
          {order.discount.toNumber() > 0 && (
            <div className="flex justify-between text-signal">
              <span>{t("discount")}</span>
              <span className="font-mono">
                −EGP {order.discount.toNumber().toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between text-steel">
            <span>{t("shipping")}</span>
            <span className="font-mono">
              EGP {order.shippingCost.toNumber().toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between font-semibold text-ink">
            <span>{t("total")}</span>
            <span className="font-mono">
              EGP {order.total.toNumber().toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-steel">
        {t("status")}: <span className="font-medium text-ink">{tStatus(order.status)}</span> ·{" "}
        {t("payment")}:{" "}
        <span className="font-medium text-ink">{tPayment(order.paymentStatus)}</span>
      </p>


      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/api/orders/${order.id}/invoice`} className="rounded border border-steel/20 px-3 py-2 text-sm text-ink">Download invoice PDF</Link>
      </div>

      {order.events.length ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold text-ink">Order timeline</h2>
          <ol className="mt-4 border-s border-steel/20 ps-5">
            {order.events.map((event) => (
              <li key={event.id} className="relative pb-5">
                <span className="absolute -start-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-ink" />
                <p className="text-sm font-medium text-ink">{event.title}</p>
                {event.description ? <p className="text-xs text-steel">{event.description}</p> : null}
                <time className="font-mono text-[11px] text-steel">{event.createdAt.toLocaleString()}</time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {needsPayment && <CompletePaymentButton orderId={order.id} />}
      {canCancel && <CancelOrderButton orderId={order.id} />}
    </div>
  );
}
