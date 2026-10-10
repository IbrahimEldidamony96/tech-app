"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function InventoryAdjustForm({ variantId, sku }: { variantId: string; sku: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const delta = Number(form.get("delta"));
    const note = String(form.get("note") ?? "");
    setBusy(true); setError("");
    const res = await fetch("/api/admin/inventory/adjust", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ variantId, delta, note }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not update stock");
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-2 grid gap-2 sm:grid-cols-[100px_1fr_auto]">
      <input name="delta" type="number" required placeholder="+/- qty" className="rounded border border-steel/20 px-2 py-1 text-sm" aria-label={`Adjustment for ${sku}`} />
      <input name="note" required minLength={2} maxLength={500} placeholder="Reason" className="rounded border border-steel/20 px-2 py-1 text-sm" />
      <button disabled={busy} className="rounded bg-ink px-3 py-1 text-sm text-white disabled:opacity-50">{busy ? "Saving…" : "Adjust"}</button>
      {error ? <p className="text-xs text-alert sm:col-span-3">{error}</p> : null}
    </form>
  );
}
