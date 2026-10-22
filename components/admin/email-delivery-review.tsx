"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestFailureMessage } from "@/lib/request-error";

export function EmailDeliveryReview({ deliveryKey }: { deliveryKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/email-deliveries", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: deliveryKey, evidence: form.get("evidence"), confirmedDelivered: form.get("confirmed") === "on" }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? requestFailureMessage()); return; }
      router.refresh();
    } catch { setError(requestFailureMessage()); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-3">
    <label className="block text-sm">Provider message reference and evidence<input name="evidence" required minLength={10} maxLength={1000} className="field-input mt-1 w-full" /></label>
    <label className="flex gap-2 text-sm"><input name="confirmed" type="checkbox" required />I confirmed that the provider delivered this email.</label>
    {error && <p role="alert" className="text-sm text-alert">{error}</p>}
    <button disabled={busy} className="button-secondary disabled:opacity-50">Record verified delivery</button>
  </form>;
}
