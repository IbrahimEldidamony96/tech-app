"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProductArchiveButton({ productId, archived = false }: { productId: string; archived?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function act() {
    if (!archived && !confirm("Archive this product? Existing orders will be preserved.")) return;
    setBusy(true);
    const res = await fetch(archived ? `/api/products/${productId}/restore` : `/api/products/${productId}`, { method: archived ? "POST" : "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => ({}))).error ?? "Action failed");
  }
  return <button type="button" disabled={busy} onClick={act} className="text-xs font-medium text-alert hover:underline disabled:opacity-50">{busy ? "…" : archived ? "Restore" : "Archive"}</button>;
}
