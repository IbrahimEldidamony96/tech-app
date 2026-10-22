import { requireAdminPagePermission } from "@/lib/require-admin-page-permission";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { OrderActions } from "@/components/admin/order-actions";
import { ReturnRefundActions } from "@/components/admin/return-refund-actions";
import { hasPermission } from "@/lib/permissions";

type Params = Promise<{ id: string }>;

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Params;
}) {
  const actor = await requireAdminPagePermission("orders:read");

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      payment: true,
      shipment: true,
      refunds: { where: { returnRequestId: null, status: { not: "CANCELLED" } }, take: 1, orderBy: { createdAt: "desc" } },
      user: { select: { name: true, email: true } },
    },
  });

  if (!order) notFound();

  const customerName = order.user?.name ??
    `${order.shippingFirstName} ${order.shippingLastName}`.trim();
  const customerEmail = order.user?.email ?? order.guestEmail;

  const t = await getTranslations("AdminOrders");
  const tStatus = await getTranslations("OrderStatus");
  const tPayment = await getTranslations("PaymentStatus");
  const tShipment = await getTranslations("ShipmentStatus");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="font-mono text-xs text-steel">#{order.id}</p>
      <h1 className="mt-1 font-display text-xl font-bold text-ink">
        {customerName}
      </h1>
      <p className="text-sm text-steel">{customerEmail}</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <span className="rounded bg-steel/10 px-2 py-1 text-xs font-medium text-ink">
          {t("order")}: {tStatus(order.status)}
        </span>
        <span className="rounded bg-steel/10 px-2 py-1 text-xs font-medium text-ink">
          {t("payment")}: {tPayment(order.paymentStatus)}
        </span>
        {order.shipment && (
          <span className="rounded bg-steel/10 px-2 py-1 text-xs font-medium text-ink">
            {t("shipment")}: {tShipment(order.shipment.status)}
          </span>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-steel/15 p-5">
        <ul className="space-y-2">
          {order.items.map((item) => (
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
        <div className="mt-4 flex justify-between border-t border-steel/15 pt-4 text-sm font-semibold">
          <span className="text-ink">{t("total")}</span>
          <span className="font-mono text-ink">
            EGP {order.total.toNumber().toLocaleString()}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-steel/15 p-5 text-sm text-steel">
        <p className="font-medium text-ink">{t("shippingTo")}</p>
        <p className="mt-1">
          {order.shippingFirstName} {order.shippingLastName} ·{" "}
          {order.shippingPhone}
        </p>
        <p>
          {order.shippingStreet}, {order.shippingCity},{" "}
          {order.shippingGovernorate}
        </p>
      </div>

      {hasPermission(actor.role, "orders:write") && <OrderActions
        orderId={order.id}
        orderStatus={order.status}
        paymentStatus={order.paymentStatus}
        paymentMethod={order.payment?.method ?? null}
        paymentTransactionId={order.payment?.transactionId}
        shipmentStatus={order.shipment?.status ?? null}
        trackingNumber={order.shipment?.trackingNumber}
        carrier={order.shipment?.carrier}
      />}
      {hasPermission(actor.role, "returns:write") && order.status === "CANCELLED" && ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.paymentStatus) &&
        <section className="mt-6"><h2 className="font-semibold">Cancelled order refund</h2>
          <ReturnRefundActions id={order.id} scope="order" current={order.status}
            refund={order.refunds[0] ? { status: order.refunds[0].status as "PENDING_CONFIRMATION" | "CONFIRMED", amount: order.refunds[0].amount.toFixed(2) } : null}
            paymentMethod={order.payment?.method} canConfirm={actor.role === "ADMIN" || actor.role === "SUPER_ADMIN"} />
        </section>}
    </div>
  );
}
