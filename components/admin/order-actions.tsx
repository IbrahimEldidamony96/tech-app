"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  canTransitionPayment,
  canTransitionOrder,
} from "@/lib/order-state-machine";
import type {
  OrderStatus,
  PaymentStatus,
  ShipmentStatus,
} from "@/app/generated/prisma/client";
import { ShipmentRecovery } from "@/components/admin/shipment-recovery";

type Props = {
  orderId: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: "CASH_ON_DELIVERY" | "CARD" | "WALLET" | null;
  shipmentStatus: ShipmentStatus | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  paymentTransactionId?: string | null;
};

// نفس خريطة shipment transitions بتاعة lib/order-state-machine.ts، لكن
// هنا بشكل "الحالة الحالية -> كل الخطوات الجاية الممكنة" عشان نعرض زرار
// لكل واحدة، مش بس نتحقق من true/false زي canTransitionShipment
const SHIPMENT_NEXT_STEPS: Record<ShipmentStatus, ShipmentStatus[]> = {
  PENDING: ["PREPARING"],
  PREPARING: ["SHIPPED"],
  SHIPPED: ["IN_TRANSIT", "RETURNED"],
  IN_TRANSIT: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  RETURNED: [],
  LOST: ["AWAITING_RECEIPT"],
  DAMAGED: ["AWAITING_RECEIPT"],
  CANCELLED: ["AWAITING_RECEIPT"],
  EXCEPTION: ["AWAITING_RECEIPT"],
  AWAITING_RECEIPT: ["RETURNED"],
};

export function OrderActions({
  orderId,
  orderStatus,
  paymentStatus,
  paymentMethod,
  shipmentStatus,
  trackingNumber,
  carrier,
  paymentTransactionId,
}: Props) {
  const router = useRouter();
  const t = useTranslations("AdminOrders");
  const tShipment = useTranslations("ShipmentStatus");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [receiptConfirmed, setReceiptConfirmed] = useState(false);

  async function call(url: string, method: string, body?: object) {
    setLoading(url);
    setError("");

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const responseBody = await res.json().catch(() => ({}));
        setError(responseBody.error ?? t("actionFailed"));
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError(t("actionFailed"));
    } finally {
      setLoading(null);
    }
  }

  const isCod = paymentMethod === "CASH_ON_DELIVERY";
  // COD بتتأكد بزرار منفصل (من غير ما تلمس الدفع) — الكارت/المحفظة
  // بتتأكد عن طريق تأكيد الدفع نفسه زي ما كان
  const canConfirmCod = isCod && orderStatus === "PENDING";
  const canMarkPaid = !!paymentMethod && !isCod && (paymentStatus === "FAILED" || canTransitionPayment(paymentStatus, "PAID") || (paymentStatus === "PAID" && !paymentTransactionId));
  const canMarkFailed = !isCod && canTransitionPayment(paymentStatus, "FAILED");
  const recoveringBooking = orderStatus === "PROCESSING" && !shipmentStatus;
  const canCancel = !recoveringBooking && canTransitionOrder(orderStatus, "CANCELLED") && !["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(paymentStatus);
  const canCreateShipment =
    !shipmentStatus &&
    canTransitionOrder(orderStatus, "PROCESSING") &&
    (isCod || (paymentStatus === "PAID" && !!paymentTransactionId));
  const nextShipmentSteps = shipmentStatus
    ? SHIPMENT_NEXT_STEPS[shipmentStatus]
    : [];

  const noActionsLeft =
    !recoveringBooking &&
    !canConfirmCod &&
    !canMarkPaid &&
    !canMarkFailed &&
    !canCreateShipment &&
    nextShipmentSteps.length === 0 &&
    !canCancel;

  return (
    <div className="mt-6 space-y-4">
      {error && <p role="alert" className="text-sm text-alert">{error}</p>}
      {!shipmentStatus && orderStatus === "PROCESSING" && <ShipmentRecovery orderId={orderId} />}
      {canMarkPaid && <label className="block text-sm text-steel">
        {t("transactionId")}
        <input value={transactionId} onChange={e => setTransactionId(e.target.value)} inputMode="numeric" pattern="[0-9]+" className="field-input mt-2 w-full" />
        <span className="mt-1 block text-xs">{t("verifyPaymentHelp")}</span>
      </label>}
      {nextShipmentSteps.includes("RETURNED") && <label className="flex items-start gap-2 text-sm text-steel">
        <input type="checkbox" checked={receiptConfirmed} onChange={e => setReceiptConfirmed(e.target.checked)} />
        {t("receiptConfirmed")}
      </label>}

      {trackingNumber && (
        <p className="text-sm text-steel">
          {t("trackingNumberLabel", { carrier: carrier ?? t("carrier") })}{" "}
          <span className="font-mono text-ink">{trackingNumber}</span>
          {" — "}
          <a
            href="https://bosta.co/tracking-shipments"
            target="_blank"
            rel="noreferrer"
            className="text-ink underline"
          >
            {t("trackOnBosta")}
          </a>
          {/* لينك مباشر بالرقم مش متأكدين من شكله بالظبط (الصفحة SPA)،
              فبنسيب الرقم واضح للنسخ بدل ما نخمّن رابط ممكن يبقى غلط */}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canConfirmCod && (
          <button
            onClick={() => call(`/api/admin/orders/${orderId}/confirm`, "POST")}
            disabled={loading !== null}
            className="rounded-md bg-signal px-3 py-2 text-xs font-semibold text-ink hover:opacity-90 disabled:opacity-40"
          >
            {t("confirmOrderCod")}
          </button>
        )}
        {canMarkPaid && (
          <button
            onClick={() =>
              call(`/api/admin/orders/${orderId}/payment/mark-paid`, "POST", { transactionId })
            }
            disabled={loading !== null || !/^\d{1,30}$/.test(transactionId)}
            className="rounded-md bg-signal px-3 py-2 text-xs font-semibold text-ink hover:opacity-90 disabled:opacity-40"
          >
            {t("verifyPayment")}
          </button>
        )}
        {canMarkFailed && (
          <button
            onClick={() =>
              call(`/api/admin/orders/${orderId}/payment/mark-failed`, "POST")
            }
            disabled={loading !== null}
            className="rounded-md border border-alert px-3 py-2 text-xs font-semibold text-alert hover:bg-alert/5 disabled:opacity-40"
          >
            {t("markPaymentFailed")}
          </button>
        )}
        {canCreateShipment && (
          <button
            onClick={() =>
              call(`/api/admin/orders/${orderId}/shipment`, "POST")
            }
            disabled={loading !== null}
            className="rounded-md border border-ink px-3 py-2 text-xs font-semibold text-ink hover:bg-ink/5 disabled:opacity-40"
          >
            {loading === `/api/admin/orders/${orderId}/shipment`
              ? t("bookingWithBosta")
              : t("shipWithBosta")}
          </button>
        )}
        {nextShipmentSteps.map((step) => (
          <button
            key={step}
            onClick={() =>
              call(`/api/admin/orders/${orderId}/shipment`, "PATCH", {
                status: step,
                receiptConfirmed: step === "RETURNED" && receiptConfirmed,
              })
            }
            disabled={loading !== null || (step === "RETURNED" && !receiptConfirmed)}
            className="rounded-md border border-ink px-3 py-2 text-xs font-semibold text-ink hover:bg-ink/5 disabled:opacity-40"
          >
            {t("moveTo", { status: tShipment(step) })}
          </button>
        ))}
        {canCancel && (
          <button
            onClick={() => call(`/api/admin/orders/${orderId}/cancel`, "POST")}
            disabled={loading !== null}
            className="rounded-md border border-steel/25 px-3 py-2 text-xs font-medium text-steel hover:border-alert hover:text-alert disabled:opacity-40"
          >
            {t("cancelOrder")}
          </button>
        )}
      </div>

      {noActionsLeft && (
        <p className="text-sm text-steel">{t("noActionsLeft")}</p>
      )}
    </div>
  );
}
