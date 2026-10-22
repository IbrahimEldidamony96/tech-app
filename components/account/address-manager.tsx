"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AddressForm, type AddressData } from "./address-form";

type Address = AddressData & { id: string };

export function AddressManager({
  initialAddresses,
}: {
  initialAddresses: Address[];
}) {
  const t = useTranslations("AddressForm");
  const [addresses, setAddresses] = useState(initialAddresses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const res = await fetch("/api/addresses");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      setAddresses(body.data ?? []);
      setEditingId(null);
      setAdding(false);

    } catch { setError(requestFailureMessage()); }

  }

  async function handleDelete(id: string) {
    try {
      setDeletingId(id);
      setError("");

      const res = await fetch(`/api/addresses/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("couldNotDelete"));
        setDeletingId(null);
        return;
      }

      await refresh();
      setDeletingId(null);

    } catch { setError(requestFailureMessage()); }
    finally { setDeletingId(null); }
  }

  async function handleSetDefault(address: Address) {
    try {
      setError("");

      const res = await fetch(`/api/addresses/${address.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...address, isDefault: true }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("couldNotSetDefault"));
        return;
      }

      await refresh();

    } catch { setError(requestFailureMessage()); }

  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-alert">{error}</p>}

      {addresses.map((addr) =>
        editingId === addr.id ? (
          <AddressForm
            key={addr.id}
            initialAddress={addr}
            onSaved={refresh}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div
            key={addr.id}
            className="flex items-start justify-between rounded-lg border border-steel/15 p-4 text-sm"
          >
            <div>
              <p className="font-medium text-ink">
                {addr.firstName} {addr.lastName} · {addr.phone}
                {addr.isDefault && (
                  <span className="ms-2 rounded bg-signal/20 px-2 py-0.5 text-xs font-semibold text-ink">
                    {t("default")}
                  </span>
                )}
              </p>
              <p className="mt-1 text-steel">
                {addr.street}, {addr.city}, {addr.governorate}
              </p>
            </div>
            <div className="flex shrink-0 gap-3 text-xs font-medium">
              {!addr.isDefault && (
                <button
                  onClick={() => handleSetDefault(addr)}
                  className="text-steel hover:text-ink"
                >
                  {t("setDefault")}
                </button>
              )}
              <button
                onClick={() => setEditingId(addr.id)}
                className="text-steel hover:text-ink"
              >
                {t("edit")}
              </button>
              <button
                onClick={() => handleDelete(addr.id)}
                disabled={deletingId === addr.id}
                className="text-alert hover:opacity-80 disabled:opacity-40"
              >
                {deletingId === addr.id ? t("removing") : t("remove")}
              </button>
            </div>
          </div>
        ),
      )}

      {adding ? (
        <AddressForm onSaved={refresh} onCancel={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-sm font-medium text-signal hover:underline"
        >
          {t("addNewAddress")}
        </button>
      )}
    </div>
  );
}
