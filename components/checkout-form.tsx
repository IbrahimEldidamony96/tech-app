"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { StorePaymentMethod } from "@/lib/payment-configuration";

type Address = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  governorate: string;
  street: string;
  isDefault: boolean;
};

type Item = { id: string; quantity: number; name: string; price: number };
type BostaOption = { id: string; name: string };

type ShippingPreview = {
  shippingCost: number;
  freeShippingApplied: boolean;
  freeShippingThreshold: number;
};

const emptyAddressForm = {
  firstName: "",
  lastName: "",
  phone: "",
  country: "Egypt",
  governorate: "",
  city: "",
  area: "",
  street: "",
  buildingNo: "",
  apartment: "",
  postalCode: "",
};

export function CheckoutForm({
  items,
  subtotal,
  addresses,
  loyaltyPoints,
  paymentMethods,
}: {
  items: Item[];
  subtotal: number;
  addresses: Address[];
  loyaltyPoints: number;
  paymentMethods: StorePaymentMethod[];
}) {
  const router = useRouter();
  const t = useTranslations("Checkout");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null,
  );
  const [addingNew, setAddingNew] = useState(addresses.length === 0);
  const [newAddress, setNewAddress] = useState(emptyAddressForm);
  const [couponCode, setCouponCode] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);
  const checkoutKeyRef = useRef<string>(crypto.randomUUID());
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH_ON_DELIVERY" | "CARD" | "WALLET"
  >("CASH_ON_DELIVERY");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ثلاث مستويات متسلسلة، كلهم متغذّيين من Bosta نفسها بدل كتابة حرة:
  // محافظة (city عند Bosta) → منطقة (zone) → حي (district). Bosta فعليًا
  // بتطلب districtId (مش zoneId) وقت إنشاء الشحنة — شايف lib/bosta.ts
  // للتفاصيل الكاملة عن الفرق بين المستويين، اتأكد بباج حقيقي (Error 3003).
  const [cities, setCities] = useState<BostaOption[]>([]);
  const [citiesLoaded, setCitiesLoaded] = useState(false);
  const [zones, setZones] = useState<BostaOption[]>([]);
  const [selectedCityId, setSelectedCityId] = useState("");
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [loadingZones, setLoadingZones] = useState(false);
  const [districts, setDistricts] = useState<BostaOption[]>([]);
  const [selectedDistrictId, setSelectedDistrictId] = useState("");
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [addressError, setAddressError] = useState("");

  // *** معاينة سعر شحن Bosta الحقيقي قبل ما الأوردر يتعمل ***
  // Bosta هي شركة الشحن الوحيدة/الافتراضية هنا، وسعرها بيتحسب من جدول
  // أسعار لكل محافظة (مربوط بـ cityId حقيقي عندها) — نفس المنطق بالظبط
  // اللي بيتطبق تاني وقت إنشاء الأوردر فعليًا في /api/checkout. سعر
  // الشحن بيتحدد على مستوى المحافظة بس، فمش محتاج ننتظر اختيار الحي.
  const [previewResult, setPreviewResult] = useState<{ key: string; data: ShippingPreview | null; error: string } | null>(null);
  const previewQuery = addingNew
    ? selectedCityId ? `cityId=${encodeURIComponent(selectedCityId)}` : ""
    : selectedAddressId ? `addressId=${encodeURIComponent(selectedAddressId)}` : "";
  const shippingPreview = previewResult?.key === previewQuery ? previewResult.data : null;
  const previewError = previewResult?.key === previewQuery ? previewResult.error : "";
  const previewLoading = !!previewQuery && previewResult?.key !== previewQuery;
  const zonesRequest = useRef<AbortController | null>(null);
  const districtsRequest = useRef<AbortController | null>(null);

  // مشتقة وقت الـ render نفسه، مش state منفصلة — بتتفادى استدعاء
  // setState بشكل sync جوه الـ effect (react-hooks/set-state-in-effect)
  const loadingCities = addingNew && !citiesLoaded;

  // بنجيب قايمة المحافظات أول ما فورم "عنوان جديد" يظهر، مش قبل كده —
  // عشان اليوزر اللي عنده عناوين محفوظة بالفعل مايستناش نداء مش لازمه.
  // كل تحديثات الـ state هنا جوه .then()/.catch()/.finally() مش مباشرة
  // في جسم الـ effect، عشان كده الـ lint rule متتفعّلش
  useEffect(() => {
    if (!addingNew || citiesLoaded) return;
    const controller = new AbortController();

    fetch("/api/bosta/cities", { signal: controller.signal })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? t("errors.loadGovernoratesFailed"));
        if (!controller.signal.aborted) setCities(body.data ?? []);
      })
      .catch((err) =>
        !controller.signal.aborted && setAddressError(err.message ?? t("errors.loadGovernoratesNetwork")),
      )
      .finally(() => { if (!controller.signal.aborted) setCitiesLoaded(true); });
    return () => controller.abort();
  }, [addingNew, citiesLoaded, t]);

  // بنعيد حساب سعر الشحن الحقيقي كل ما مصدر العنوان يتغيّر: عنوان محفوظ
  // اتختار، أو محافظة جديدة اتختارت وإحنا بنضيف عنوان جديد. subtotal
  // بيتحسب على السيرفر من الكارت نفسه (مش بنبعته إحنا)، فمفيش خطر إن حد
  // يلاعب فيه من الفرونت إند.
  useEffect(() => {
    // Ignore responses for addresses that are no longer selected.
    if (!previewQuery) return;
    const controller = new AbortController();
      fetch(`/api/checkout/shipping-cost?${previewQuery}`, { signal: controller.signal })
        .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
        .then(({ ok, body }) => {
          if (!ok) throw new Error(body.error ?? t("errors.shippingCostFailed"));
          if (!controller.signal.aborted) setPreviewResult({ key: previewQuery, data: body.data, error: "" });
        })
        .catch((err) => {
          if (!controller.signal.aborted) setPreviewResult({ key: previewQuery, data: null, error: err.message ?? t("errors.shippingCostNetwork") });
        });
    return () => controller.abort();
  }, [previewQuery, t]);

  useEffect(() => () => { zonesRequest.current?.abort(); districtsRequest.current?.abort(); }, []);

  // ده event handler (بينده من onChange)، مش effect — فمفيش مشكلة إن
  // setState هنا يتنادى مباشرة وsync
  function handleGovernorateChange(cityId: string) {
    zonesRequest.current?.abort();
    districtsRequest.current?.abort();
    setLoadingZones(false);
    setLoadingDistricts(false);
    const city = cities.find((c) => c.id === cityId);
    setSelectedCityId(cityId);
    setSelectedZoneId("");
    setZones([]);
    setSelectedDistrictId("");
    setDistricts([]);
    setNewAddress((prev) => ({
      ...prev,
      governorate: city?.name ?? "",
      city: "",
      area: "",
    }));

    if (!cityId) return;
    const controller = new AbortController();
    zonesRequest.current = controller;

    setLoadingZones(true);
    setAddressError("");
    fetch(`/api/bosta/zones?cityId=${encodeURIComponent(cityId)}`, { signal: controller.signal })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? t("errors.loadAreasFailed"));
        if (!controller.signal.aborted) setZones(body.data ?? []);
      })
      .catch((err) =>
        !controller.signal.aborted && setAddressError(err.message ?? t("errors.loadAreasNetwork")),
      )
      .finally(() => { if (!controller.signal.aborted) setLoadingZones(false); });
  }

  function handleZoneChange(zoneId: string) {
    districtsRequest.current?.abort();
    setLoadingDistricts(false);
    const zone = zones.find((z) => z.id === zoneId);
    setSelectedZoneId(zoneId);
    setSelectedDistrictId("");
    setDistricts([]);
    setNewAddress((prev) => ({ ...prev, city: zone?.name ?? "", area: "" }));

    if (!zoneId || !selectedCityId) return;
    const controller = new AbortController();
    districtsRequest.current = controller;

    setLoadingDistricts(true);
    setAddressError("");
    fetch(`/api/bosta/districts?cityId=${encodeURIComponent(selectedCityId)}&zoneId=${encodeURIComponent(zoneId)}`, { signal: controller.signal })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? t("errors.loadDistrictsFailed"));
        if (!controller.signal.aborted) setDistricts(body.data ?? []);
      })
      .catch((err) =>
        !controller.signal.aborted && setAddressError(err.message ?? t("errors.loadDistrictsNetwork")),
      )
      .finally(() => { if (!controller.signal.aborted) setLoadingDistricts(false); });
  }

  function handleDistrictChange(districtId: string) {
    const district = districts.find((d) => d.id === districtId);
    setSelectedDistrictId(districtId);
    setNewAddress((prev) => ({ ...prev, area: district?.name ?? "" }));
  }

  function field(key: keyof typeof emptyAddressForm) {
    return {
      value: newAddress[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setNewAddress((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {

    let addressId = selectedAddressId;

    // لو اليوزر بيضيف عنوان جديد، لازم نحفظه ونستنى الـ id بتاعه الأول
    // قبل ما ننادي /api/checkout — مفيش نداء واحد يعمل الاتنين سوا
    if (addingNew) {
      if (!newAddress.governorate || !newAddress.city || !selectedDistrictId) {
        setError(t("errors.selectAddressFields"));
        setSubmitting(false);
        return;
      }

      const optionalFieldsCleaned = {
        ...newAddress,
        area: newAddress.area || undefined,
        buildingNo: newAddress.buildingNo || undefined,
        apartment: newAddress.apartment || undefined,
        postalCode: newAddress.postalCode || undefined,
        // الـ id الحقيقي عند Bosta بتاع المحافظة والحي (district — مش
        // المنطقة/zone) اللي اليوزر اختارهم من الـ dropdowns — بيتحفظ
        // على العنوان عشان محتاجينه تاني في خطوة "Ship with Bosta"
        // بعدين، من غير ما نضطر نرجع نطابق الاسم النصي بـ id تاني وقتها.
        // *** ده الإصلاح الأساسي لباج "District Not Found" *** —
        // قبل كده كنا بنحفظ zoneId هنا بالغلط بدل districtId الحقيقي
        bostaCityId: selectedCityId || undefined,
        bostaDistrictId: selectedDistrictId || undefined,
      };

      const addrRes = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(optionalFieldsCleaned),
      });

      if (!addrRes.ok) {
        const responseBody = await addrRes.json().catch(() => ({}));
        setError(responseBody.error ?? t("errors.saveAddressFailed"));
        setSubmitting(false);
        return;
      }
      const addrBody = await addrRes.json();
      addressId = addrBody.data.id;
    }

    if (!addressId) {
      setError(t("errors.selectOrAddAddress"));
      setSubmitting(false);
      return;
    }

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addressId,
        couponCode: couponCode || undefined,
        paymentMethod,
        customerNote: customerNote || undefined,
        loyaltyPointsToRedeem,
        checkoutKey: checkoutKeyRef.current,
      }),
    });

    if (!res.ok) {
      const responseBody = await res.json().catch(() => ({}));
      setError(responseBody.error ?? t("errors.checkoutFailed"));
      setSubmitting(false);
      return;
    }

    const responseBody = await res.json();

    // CARD/WALLET: Paymob رجّعت رابط دفع — نوديه هناك مباشرة. COD (أو لو
    // فشل بدء الدفع لأي سبب) بيروح لصفحة الأوردر زي ما كان، وهيلاقي
    // زرار "Complete Payment" هناك لو لسه محتاج يدفع
    if (responseBody.checkoutUrl) {
      window.location.href = responseBody.checkoutUrl;
      return;
    }

    router.push(`/orders/${responseBody.data.id}`);
    } catch {
      setError(t("errors.checkoutFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-9 grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
      <div className="space-y-5">
        <section className="surface-card">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            {t("shippingAddress")}
          </h2>

          {addresses.length > 0 && !addingNew && (
            <div className="mt-5 space-y-3">
              {addresses.map((addr) => (
                <label
                  key={addr.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm transition-colors ${
                    selectedAddressId === addr.id
                      ? "border-accent bg-mist"
                      : "border-line hover:border-accent/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={selectedAddressId === addr.id}
                    onChange={() => setSelectedAddressId(addr.id)}
                    className="mt-1 accent-accent"
                  />
                  <span>
                    <span className="block font-medium text-ink">
                      {addr.firstName} {addr.lastName} · {addr.phone}
                    </span>
                    <span className="block text-steel">
                      {addr.street}, {addr.city}, {addr.governorate}
                    </span>
                  </span>
                </label>
              ))}
              <button
                type="button"
                onClick={() => setAddingNew(true)}
                className="mt-2 inline-flex text-sm font-semibold text-accent hover:underline"
              >
                {t("addNewAddress")}
              </button>
            </div>
          )}

          {addingNew && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <input
                placeholder={t("firstName")}
                aria-label={t("firstName")}
                {...field("firstName")}
                className="field-input min-w-0 w-full"
              />
              <input
                placeholder={t("lastName")}
                aria-label={t("lastName")}
                {...field("lastName")}
                className="field-input min-w-0 w-full"
              />
              <input
                placeholder={t("phone")}
                aria-label={t("phone")}
                {...field("phone")}
                className="col-span-2 field-input min-w-0 w-full"
              />

              <select
                aria-label={t("selectGovernorate")}
                value={selectedCityId}
                onChange={(e) => handleGovernorateChange(e.target.value)}
                disabled={loadingCities}
                className="field-input min-w-0 w-full text-ink disabled:opacity-50"
              >
                <option value="">
                  {loadingCities ? t("loadingGovernorates") : t("selectGovernorate")}
                </option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                aria-label={t("selectArea")}
                value={selectedZoneId}
                onChange={(e) => handleZoneChange(e.target.value)}
                disabled={!selectedCityId || loadingZones}
                className="field-input min-w-0 w-full text-ink disabled:opacity-50"
              >
                <option value="">
                  {!selectedCityId
                    ? t("selectGovernorateFirst")
                    : loadingZones
                      ? t("loadingAreas")
                      : t("selectArea")}
                </option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>

              <select
                aria-label={t("selectDistrict")}
                value={selectedDistrictId}
                onChange={(e) => handleDistrictChange(e.target.value)}
                disabled={!selectedZoneId || loadingDistricts}
                className="col-span-2 field-input min-w-0 w-full text-ink disabled:opacity-50"
              >
                <option value="">
                  {!selectedZoneId
                    ? t("selectAreaFirst")
                    : loadingDistricts
                      ? t("loadingDistricts")
                      : t("selectDistrict")}
                </option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              {addressError && (
                <p className="col-span-2 text-xs text-alert">{addressError}</p>
              )}

              <input
                placeholder={t("street")}
                aria-label={t("street")}
                {...field("street")}
                className="col-span-2 field-input min-w-0 w-full"
              />
              <input
                placeholder={t("buildingNo")}
                aria-label={t("buildingNo")}
                {...field("buildingNo")}
                className="field-input min-w-0 w-full"
              />
              <input
                placeholder={t("apartment")}
                aria-label={t("apartment")}
                {...field("apartment")}
                className="field-input min-w-0 w-full"
              />
              {addresses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAddingNew(false)}
                  className="col-span-2 text-left text-sm text-steel hover:text-ink"
                >
                  {t("useSavedAddress")}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="surface-card">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            {t("coupon")}
          </h2>
          <input
            placeholder={t("couponPlaceholder")}
            aria-label={t("couponPlaceholder")}
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            className="field-input mt-5 w-full font-mono"
          />
        </section>

        <section className="surface-card">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            {t("paymentMethod")}
          </h2>
          <div className="mt-5 space-y-3">
            {([
              ["CASH_ON_DELIVERY", t("cashOnDelivery")],
              ["CARD", t("card")],
              ["WALLET", t("wallet")],
            ] as const).filter(([method]) => paymentMethods.includes(method)).map(([method, label]) => (
              <label
                key={method}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm transition-colors ${paymentMethod === method ? "border-accent bg-mist" : "border-line hover:border-accent/30"}`}
              >
                <input
                  type="radio"
                  name="payment"
                  className="accent-accent"
                  checked={paymentMethod === method}
                  onChange={() => setPaymentMethod(method)}
                />
                {label}
              </label>
            ))}
          </div>
        </section>
      </div>

      <aside className="surface-card lg:sticky lg:top-28">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
          {t("orderSummary")}
        </h2>
        <ul className="mt-5 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 text-sm">
              <span className="text-steel">
                {item.name} × {item.quantity}
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-ink">
                EGP {(item.price * item.quantity).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-line pt-4 text-sm">
          <span className="text-ink">{t("subtotal")}</span>
          <span className="shrink-0 text-sm font-medium tabular-nums text-ink">
            EGP {subtotal.toLocaleString()}
          </span>
        </div>

        <div className="mt-2 flex justify-between gap-4 text-sm">
          <span className="text-ink">{t("shippingBosta")}</span>
          <span className="shrink-0 text-sm font-medium tabular-nums text-ink">
            {previewLoading
              ? t("calculating")
              : shippingPreview
                ? shippingPreview.freeShippingApplied
                  ? t("free")
                  : `EGP ${shippingPreview.shippingCost.toLocaleString()}`
                : t("selectAnAddress")}
          </span>
        </div>
        {previewError && (
          <p className="mt-1 text-xs text-alert">{previewError}</p>
        )}
        {shippingPreview && (
          <p
            className={`mt-1 text-xs ${
              shippingPreview.freeShippingApplied
                ? "font-medium text-accent"
                : "text-steel"
            }`}
          >
            {shippingPreview.freeShippingApplied
              ? t("freeShippingQualified", {
                  threshold: shippingPreview.freeShippingThreshold.toLocaleString(),
                })
              : t("freeShippingRemaining", {
                  remaining: (shippingPreview.freeShippingThreshold - subtotal).toLocaleString(),
                  threshold: shippingPreview.freeShippingThreshold.toLocaleString(),
                })}
          </p>
        )}

        <div className="mt-5 flex justify-between gap-4 border-t border-line pt-5 text-base font-semibold">
          <span className="text-ink">{t("estimatedTotal")}</span>
          <span className="shrink-0 text-sm font-medium tabular-nums text-ink">
            EGP{" "}
            {(subtotal + (shippingPreview?.shippingCost ?? 0)).toLocaleString()}
          </span>
        </div>
        <p className="mt-1 text-xs text-steel">
          {t("couponNote")}
        </p>

        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <label className="block text-xs text-steel">
            <span className="mb-1 block font-medium text-ink">Order note</span>
            <textarea value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} maxLength={500} rows={2} placeholder="Delivery instructions (optional)" className="field-input min-w-0 w-full text-ink" />
          </label>
          <label className="block text-xs text-steel">
            <span className="mb-1 block font-medium text-ink">Use loyalty points ({loyaltyPoints} available)</span>
            <input type="number" min={0} max={Math.min(loyaltyPoints, Math.floor(subtotal))} value={loyaltyPointsToRedeem} onChange={(e) => setLoyaltyPointsToRedeem(Math.max(0, Math.min(Number(e.target.value) || 0, loyaltyPoints, Math.floor(subtotal))))} className="field-input min-w-0 w-full text-ink" />
            <span className="mt-1 block">1 point = EGP 1.</span>
          </label>
        </div>

        {error && <p role="alert" className="mt-3 rounded-xl bg-alert/5 p-3 text-sm text-alert">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="button-primary mt-6 w-full disabled:opacity-50"
        >
          {submitting ? t("placingOrder") : t("placeOrder")}
        </button>
      </aside>
    </div>
  );
}
