"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { BostaLocationFields } from "@/components/bosta-location-fields";

export type AddressData = {
  id?: string; firstName: string; lastName: string; phone: string; country: string;
  governorate: string; city: string; area?: string | null;
  bostaCityId?: string | null; bostaDistrictId?: string | null;
  street: string; buildingNo?: string | null; apartment?: string | null;
  postalCode?: string | null; isDefault: boolean;
};
const empty: AddressData = { firstName: "", lastName: "", phone: "", country: "Egypt", governorate: "", city: "", street: "", isDefault: false };
export function AddressForm({ initialAddress, onSaved, onCancel }: {
  initialAddress?: AddressData; onSaved: () => void | Promise<void>; onCancel?: () => void;
}) {
  const t = useTranslations("Checkout");
  const tForm = useTranslations("AddressForm");
  const [form, setForm] = useState<AddressData>(initialAddress ?? empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const field = (key: "firstName" | "lastName" | "phone" | "street" | "buildingNo" | "apartment") => ({
    value: form[key] ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [key]: event.target.value })),
  });
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (!form.bostaCityId || !form.bostaDistrictId) { setError(t("errors.selectAddressFields")); return; }
    setSubmitting(true);
    try {
      const response = await fetch(initialAddress?.id ? `/api/addresses/${initialAddress.id}` : "/api/addresses", {
        method: initialAddress?.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? t("errors.saveAddressFailed"));
      await onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : t("errors.saveAddressFailed")); }
    finally { setSubmitting(false); }
  }
  return <form onSubmit={submit} className="grid grid-cols-2 gap-3 rounded-lg border border-steel/15 p-4">
    <input aria-label={t("firstName")} placeholder={t("firstName")} {...field("firstName")} required className="field-input" />
    <input aria-label={t("lastName")} placeholder={t("lastName")} {...field("lastName")} required className="field-input" />
    <input aria-label={t("phone")} placeholder={t("phone")} {...field("phone")} required className="field-input col-span-2" />
    <BostaLocationFields value={form} onChange={location => setForm(prev => ({ ...prev, ...location }))} />
    <input aria-label={t("street")} placeholder={t("street")} {...field("street")} required className="field-input col-span-2" />
    <input aria-label={t("buildingNo")} placeholder={t("buildingNo")} {...field("buildingNo")} className="field-input" />
    <input aria-label={t("apartment")} placeholder={t("apartment")} {...field("apartment")} className="field-input" />
    <label className="col-span-2 flex gap-2"><input type="checkbox" checked={form.isDefault} onChange={event => setForm(prev => ({ ...prev, isDefault: event.target.checked }))} />{tForm("setAsDefault")}</label>
    {error && <p role="alert" className="col-span-2 text-sm text-alert">{error}</p>}
    <div className="col-span-2 flex gap-2">
      <button type="submit" disabled={submitting} className="button-primary disabled:opacity-50">{submitting ? tForm("saving") : tForm("saveAddress")}</button>
      {onCancel && <button type="button" onClick={onCancel} className="button-secondary">{tForm("cancel")}</button>}
    </div>
  </form>;
}
