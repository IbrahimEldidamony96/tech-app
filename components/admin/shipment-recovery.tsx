"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type Booking = { status: string; bostaDeliveryId: string | null; trackingNumber: string | null; recoverable: boolean };
export function ShipmentRecovery({ orderId }: { orderId: string }) {
  const t = useTranslations("AdminOrders");
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("ATTACH");
  const [deliveryId, setDeliveryId] = useState("");
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("");
  const [attested, setAttested] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/shipment`, { signal });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (signal?.aborted) return;
      setBooking(body.data);
      setDeliveryId(body.data?.bostaDeliveryId ?? "");
      setTracking(body.data?.trackingNumber ?? "");
      setLoaded(true);
      setError("");
    } catch { if (!signal?.aborted) setError(t("actionFailed")); }
  }, [orderId, t]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);
  async function recover(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/shipment`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, attested, ...(action === "ATTACH" ? { bostaDeliveryId: deliveryId, trackingNumber: tracking } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t("actionFailed"));
      router.refresh();
    } catch (error) { await load(); setError(error instanceof Error ? error.message : t("actionFailed")); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-lg border border-steel/25 p-4">
    <h2 className="font-semibold">{t("shipmentRecovery")}</h2>
    <p className="text-sm text-steel">{t("shipmentRecoveryHelp")}</p>
    {error && <p role="alert" className="text-sm text-alert">{error}</p>}
    <button type="button" className="text-sm underline" disabled={busy} onClick={() => void load()}>{t("refreshBooking")}</button>
    {loaded && booking && !booking.recoverable && <p role="status" className="text-sm">{t("bookingInProgress")}</p>}
    {loaded && (!booking || booking.recoverable) && <form onSubmit={recover} className="space-y-3">
      <label className="block text-sm">{t("recoveryOutcome")}
        <select value={action} onChange={e => setAction(e.target.value)} className="field-input mt-1 w-full">
          <option value="ATTACH">{t("recordExistingShipment")}</option>
          {!booking?.bostaDeliveryId && <option value="NO_BOOKING">{t("noCarrierBooking")}</option>}
          {booking?.bostaDeliveryId && <option value="CANCEL_BOOKING">{t("cancelCarrierBooking")}</option>}
        </select>
      </label>
      {action === "ATTACH" && <>
        <label className="block text-sm">{t("carrierDeliveryId")}<input required value={deliveryId} readOnly={!!booking?.bostaDeliveryId} onChange={e => setDeliveryId(e.target.value)} pattern="[A-Za-z0-9_-]{1,128}" className="field-input mt-1 w-full" /></label>
        <label className="block text-sm">{t("carrierTrackingId")}<input required value={tracking} onChange={e => setTracking(e.target.value)} pattern="[A-Za-z0-9_-]{1,100}" className="field-input mt-1 w-full" /></label>
      </>}
      <label className="block text-sm">{t("recoveryReason")}<textarea required minLength={10} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} className="field-input mt-1 w-full" /></label>
      <label className="flex gap-2 text-sm"><input required type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} />{t("carrierOutcomeConfirmed")}</label>
      <button disabled={busy || !attested} className="button-secondary disabled:opacity-50">{t("recoverShipment")}</button>
    </form>}
  </section>;
}
