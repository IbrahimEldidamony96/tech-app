"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

type Opt = { id: string; name: string };
type Row = { variantId: string; quantity: number; price?: number; unavailable?: boolean; product?: { nameEn: string } };

function cart() {
  try {
    return JSON.parse(localStorage.getItem("guestCart") ?? "[]") as { variantId: string; quantity: number }[];
  } catch {
    return [];
  }
}

export function GuestCheckoutForm() {
  const router = useRouter();
  const t = useTranslations("Checkout");
  const auth = useTranslations("Auth");
  const tCart = useTranslations("Cart");
  const store = useTranslations("Storefront");
  const checkoutKeyRef = useRef(crypto.randomUUID());
  const guestAccessTokenRef = useRef(crypto.randomUUID() + crypto.randomUUID());
  const [rows, setRows] = useState<Row[]>([]);
  const [cities, setCities] = useState<Opt[]>([]);
  const [zones, setZones] = useState<Opt[]>([]);
  const [districts, setDistricts] = useState<Opt[]>([]);
  const [cityId, setCityId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const items = cart();
    fetch("/api/guest-cart/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    }).then((response) => response.json()).then((body) => setRows(body.data ?? []));
    fetch("/api/bosta/cities").then((response) => response.json()).then((body) => setCities(body.data ?? []));
  }, []);

  const subtotal = useMemo(() => rows.reduce((sum, row) => sum + (row.price ?? 0) * row.quantity, 0), [rows]);

  async function changeCity(id: string) {
    setCityId(id);
    setZoneId("");
    setDistrictId("");
    setZones([]);
    setDistricts([]);
    if (id) {
      const body = await fetch(`/api/bosta/zones?cityId=${encodeURIComponent(id)}`).then((response) => response.json());
      setZones(body.data ?? []);
    }
  }

  async function changeZone(id: string) {
    setZoneId(id);
    setDistrictId("");
    setDistricts([]);
    if (id && cityId) {
      const body = await fetch(`/api/bosta/districts?cityId=${encodeURIComponent(cityId)}&zoneId=${encodeURIComponent(id)}`).then((response) => response.json());
      setDistricts(body.data ?? []);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const city = cities.find((option) => option.id === cityId)?.name ?? "";
    const zone = zones.find((option) => option.id === zoneId)?.name ?? "";
    const district = districts.find((option) => option.id === districtId)?.name ?? "";
    if (!cityId || !districtId) {
      setBusy(false);
      setError(t("errors.selectAddressFields"));
      return;
    }
    const payload = {
      email: form.get("email"),
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      phone: form.get("phone"),
      country: "Egypt",
      governorate: city,
      city: zone || district,
      area: district,
      street: form.get("street"),
      buildingNo: form.get("buildingNo") || undefined,
      apartment: form.get("apartment") || undefined,
      postalCode: form.get("postalCode") || undefined,
      bostaCityId: cityId,
      bostaDistrictId: districtId,
      items: cart(),
      couponCode: form.get("couponCode") || undefined,
      paymentMethod: form.get("paymentMethod"),
      customerNote: form.get("customerNote") || undefined,
      checkoutKey: checkoutKeyRef.current,
      guestAccessToken: guestAccessTokenRef.current,
    };
    const response = await fetch("/api/guest-checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? t("errors.checkoutFailed"));
      return;
    }
    if (body.guestToken) {
      localStorage.setItem(`guestOrderToken:${body.data.id}`, body.guestToken);
      localStorage.removeItem("guestCart");
    }
    if (body.checkoutUrl) {
      window.location.href = body.checkoutUrl;
      return;
    }
    router.push(`/guest-orders/${body.data.id}?token=${encodeURIComponent(body.guestToken ?? localStorage.getItem(`guestOrderToken:${body.data.id}`) ?? "")}`);
  }

  if (rows.length === 0) {
    return (
      <div className="surface-card mt-9 flex min-h-64 flex-col items-center justify-center text-center">
        <p className="font-display text-xl font-semibold text-ink">{tCart("empty")}</p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-steel">{store("emptyCartDescription")}</p>
        <Link href="/" className="button-primary mt-6">{tCart("browseProducts")}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-9 grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
      <div className="space-y-5">
        <section className="surface-card">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{t("shippingAddress")}</h2>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-ink"><span className="mb-2 block">{t("firstName")}</span><input name="firstName" autoComplete="given-name" required className="field-input min-w-0 w-full" /></label>
            <label className="block text-sm font-medium text-ink"><span className="mb-2 block">{t("lastName")}</span><input name="lastName" autoComplete="family-name" required className="field-input min-w-0 w-full" /></label>
            <label className="col-span-2 block text-sm font-medium text-ink"><span className="mb-2 block">{auth("email")}</span><input name="email" type="email" autoComplete="email" required className="field-input w-full" /></label>
            <label className="col-span-2 block text-sm font-medium text-ink"><span className="mb-2 block">{t("phone")}</span><input name="phone" type="tel" autoComplete="tel" required className="field-input w-full" /></label>
            <label className="block text-sm font-medium text-ink"><span className="mb-2 block">{t("selectGovernorate")}</span><select value={cityId} onChange={(event) => void changeCity(event.target.value)} required className="field-input min-w-0 w-full"><option value="">{t("selectGovernorate")}</option>{cities.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
            <label className="block text-sm font-medium text-ink"><span className="mb-2 block">{t("selectArea")}</span><select value={zoneId} onChange={(event) => void changeZone(event.target.value)} required className="field-input min-w-0 w-full"><option value="">{t("selectArea")}</option>{zones.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
            <label className="col-span-2 block text-sm font-medium text-ink"><span className="mb-2 block">{t("selectDistrict")}</span><select value={districtId} onChange={(event) => setDistrictId(event.target.value)} required className="field-input w-full"><option value="">{t("selectDistrict")}</option>{districts.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
            <label className="col-span-2 block text-sm font-medium text-ink"><span className="mb-2 block">{t("street")}</span><input name="street" autoComplete="street-address" required className="field-input w-full" /></label>
            <label className="block text-sm font-medium text-ink"><span className="mb-2 block">{t("buildingNo")}</span><input name="buildingNo" className="field-input min-w-0 w-full" /></label>
            <label className="block text-sm font-medium text-ink"><span className="mb-2 block">{t("apartment")}</span><input name="apartment" className="field-input min-w-0 w-full" /></label>
            <label className="col-span-2 block text-sm font-medium text-ink"><span className="mb-2 block">Postal code</span><input name="postalCode" autoComplete="postal-code" className="field-input w-full" /></label>
          </div>
        </section>
        <section className="surface-card space-y-5">
          <label className="block text-sm font-medium text-ink"><span className="mb-2 block">{t("coupon")}</span><input name="couponCode" placeholder={t("couponPlaceholder")} className="field-input w-full" /></label>
          <label className="block text-sm font-medium text-ink"><span className="mb-2 block">Order note</span><textarea name="customerNote" rows={3} className="field-input w-full resize-y" /></label>
          <label className="block text-sm font-medium text-ink"><span className="mb-2 block">{t("paymentMethod")}</span><select name="paymentMethod" defaultValue="CASH_ON_DELIVERY" className="field-input w-full"><option value="CASH_ON_DELIVERY">{t("cashOnDelivery")}</option><option value="CARD">{t("card")}</option><option value="WALLET">{t("wallet")}</option></select></label>
          {error && <p role="alert" className="rounded-xl bg-alert/5 p-3 text-sm text-alert">{error}</p>}
        </section>
      </div>
      <aside className="surface-card lg:sticky lg:top-28">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{t("orderSummary")}</h2>
        <ul className="mt-5 space-y-3 text-sm">{rows.map((row) => <li key={row.variantId} className="flex justify-between gap-4"><span className="text-steel">{row.product?.nameEn ?? row.variantId} × {row.quantity}</span><span className="shrink-0 font-medium tabular-nums text-ink">EGP {((row.price ?? 0) * row.quantity).toLocaleString()}</span></li>)}</ul>
        <div className="mt-6 flex justify-between gap-4 border-t border-line pt-5"><span className="text-sm text-steel">{t("subtotal")}</span><strong className="font-semibold tabular-nums text-ink">EGP {subtotal.toLocaleString()}</strong></div>
        <p className="mt-3 text-xs leading-5 text-steel">Final shipping and discounts are calculated when you place your order.</p>
        <button disabled={busy || rows.some((row) => row.unavailable)} className="button-primary mt-6 w-full disabled:opacity-50">{busy ? t("placingOrder") : t("placeOrder")}</button>
        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-steel"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>{store("secureCheckout")}</p>
      </aside>
    </form>
  );
}
