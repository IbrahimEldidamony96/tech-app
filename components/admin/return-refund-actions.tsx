"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Refund = { status: "PENDING_CONFIRMATION" | "CONFIRMED"; amount: string | number };
export function ReturnRefundActions({
  id, current, refund, paymentMethod, canConfirm, scope = "return",
}: {
  id: string;
  current: string;
  refund: Refund | null;
  paymentMethod?: string | null;
  canConfirm: boolean;
  scope?: "return" | "order";
}) {
  const [amount, setAmount] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [noTransferMade, setNoTransferMade] = useState(false);
  const router = useRouter();
  const isManual = paymentMethod === "CASH_ON_DELIVERY";
  if (current !== "RECEIVED" && current !== "REFUNDED" && !(scope === "order" && current === "CANCELLED")) return null;
  if (current === "REFUNDED" && !refund) return <p className="mt-3 text-sm">Return completed. Redeemed points were restored; no cash refund was due.</p>;
  if (refund?.status === "CONFIRMED") {
    return <p className="mt-3 text-sm font-medium">Refund confirmed: EGP {String(refund.amount)}</p>;
  }
  const submit = async (method: "POST" | "PATCH" | "DELETE", payload: object) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/${scope === "order" ? "orders" : "returns"}/${id}/refund`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setError(body.error ?? "Refund reconciliation failed");
      else router.refresh();
    } catch {
      setError("Could not contact the server");
    } finally {
      setBusy(false);
    }
  };
  if (!refund) {
    return <div className="mt-3 space-y-2 rounded border border-steel/20 p-3">
      <p className="text-xs font-semibold">Step 1 — Reserve refund amount (does NOT send money)</p>
      <div className="flex gap-2">
        <input className="w-32 rounded border border-steel/30 p-2 text-sm" inputMode="decimal"
          placeholder="EGP 0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button disabled={busy || !amount} className="rounded bg-ink px-3 py-2 text-xs text-paper disabled:opacity-50"
          onClick={() => void submit("POST", { amount })}>Create refund intent</button>
      </div>
      {error && <p className="text-xs text-alert" role="alert">{error}</p>}
    </div>;
  }
  return <div className="mt-3 space-y-2 rounded border border-steel/20 p-3">
    <p className="text-sm font-semibold">Refund pending: EGP {String(refund.amount)}</p>
    <p className="text-xs text-steel">Step 2 — {isManual
      ? "Pay the customer and enter the receipt/reference below."
      : "Issue the exact refund in Paymob Dashboard, then verify the confirmed cumulative provider amount."}</p>
    {isManual && <input className="w-full max-w-sm rounded border border-steel/30 p-2 text-sm"
      value={evidenceReference} onChange={(e) => setEvidenceReference(e.target.value)}
      placeholder="Manual refund receipt/reference (min 8 characters)" />}
    {canConfirm ? <button disabled={busy || (isManual && evidenceReference.trim().length < 8)}
      className="rounded bg-ink px-3 py-2 text-xs text-paper disabled:opacity-50"
      onClick={() => void submit("PATCH", { evidenceReference })}>
      {isManual ? "Confirm manual settlement" : "Verify Paymob and confirm"}
    </button> : <p className="text-xs text-steel">An administrator must confirm the settlement.</p>}
    {canConfirm && <div className="space-y-2 border-t border-steel/20 pt-3">
      <label className="block text-xs">Reason for cancelling this unexecuted refund
        <input value={cancellationReason} onChange={e => setCancellationReason(e.target.value)} maxLength={500} className="mt-1 w-full rounded border border-steel/30 p-2 text-sm" />
      </label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={noTransferMade} onChange={e => setNoTransferMade(e.target.checked)} />I have verified that no transfer was made.</label>
      <button disabled={busy || !noTransferMade || cancellationReason.trim().length < 8}
        onClick={() => void submit("DELETE", { reason: cancellationReason, noTransferMade })}
        className="rounded border border-steel/30 px-3 py-2 text-xs disabled:opacity-50">Cancel refund request</button>
    </div>}
    {error && <p className="text-xs text-alert" role="alert">{error}</p>}
  </div>;
}
