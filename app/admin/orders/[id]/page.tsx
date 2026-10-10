import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { OrderActions } from "@/components/admin/order-actions";

type Params = Promise<{ id: string }>;

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Params;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "orders:read")) redirect("/");

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      payment: true,
      shipment: true,
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

      <OrderActions
        orderId={order.id}
        orderStatus={order.status}
        paymentStatus={order.paymentStatus}
        paymentMethod={order.payment?.method ?? null}
        shipmentStatus={order.shipment?.status ?? null}
        trackingNumber={order.shipment?.trackingNumber}
        carrier={order.shipment?.carrier}
      />
    </div>
  );
}
