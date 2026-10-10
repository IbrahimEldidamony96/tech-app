"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type BostaOption = { id: string; name: string };

// String حقول Prisma الاختيارية بترجع null مش undefined — النوع هنا
// بيطابق ده عمدًا عشان نقدر نمرر نتيجة Prisma مباشرة من غير تحويل
export type AddressData = {
  id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  governorate: string;
  city: string;
  area?: string | null;
  street: string;
  buildingNo?: string | null;
  apartment?: string | null;
  postalCode?: string | null;
  isDefault: boolean;
};

const emptyForm: AddressData = {
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
  isDefault: false,
};

export function AddressForm({
  initialAddress,
  onSaved,
  onCancel,
}: {
  initialAddress?: AddressData;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  // نفس مفاتيح "Checkout" بتاعة العنوان اتنقلت هنا كمان — الحقول ونصوص
  // الـ dropdown (محافظة/منطقة) هي بالظبط نفس اللي في صفحة الدفع، فمفيش
  // داعي نكررها في namespace جديد
  const t = useTranslations("Checkout");
  const tForm = useTranslations("AddressForm");
  const [form, setForm] = useState<AddressData>(initialAddress ?? emptyForm);
  const [cities, setCities] = useState<BostaOption[]>([]);
  const [citiesLoaded, setCitiesLoaded] = useState(false);
  const [zones, setZones] = useState<BostaOption[]>([]);
  const [selectedCityId, setSelectedCityId] = useState("");
  const [loadingZones, setLoadingZones] = useState(false);
  // مفيش عنوان قديم نظبطه = مفيش داعي نستنى أي تحميل مبدئي للمناطق
  const [zonesInitialized, setZonesInitialized] = useState(!initialAddress);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadingCities = !citiesLoaded;

  // بنجيب المحافظات مرة واحدة لما الفورم يظهر
  useEffect(() => {
    fetch("/api/bosta/cities")
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? t("errors.loadGovernoratesFailed"));
        setCities(body.data ?? []);
      })
      .catch((err) => setError(err.message ?? t("errors.loadGovernoratesNetwork")))
      .finally(() => setCitiesLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // بنعدّل عنوان موجود بالفعل: مخزّنين بس أسماء نصية (مش IDs)، فأول ما
  // قايمة المحافظات توصل لازم نلاقي الـ id المطابق عشان نجيب مناطقه
  // ونحدد المنطقة المحفوظة تلقائيًا. كل الجسم هنا جوه Promise.resolve().then()
  // عشان ولا استدعاء setState واحد يتنفذ sync مباشرة جوه جسم الـ effect
  // نفسه (react-hooks/set-state-in-effect) — أي كود جوه .then() بيتفادى القاعدة
  useEffect(() => {
    if (!initialAddress || !citiesLoaded || zonesInitialized) return;

    Promise.resolve().then(async () => {
      const match = cities.find((c) => c.name === initialAddress.governorate);

      if (!match) {
        setZonesInitialized(true); // اسم قديم مش موجود في قايمة Bosta الحالية — سيب اليوزر يختار من جديد
        return;
      }

      setSelectedCityId(match.id);
      setLoadingZones(true);

      try {
        const res = await fetch(`/api/bosta/zones?cityId=${match.id}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? t("errors.loadAreasFailed"));
        setZones(body.data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.loadAreasNetwork"));
      } finally {
        setLoadingZones(false);
        setZonesInitialized(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAddress, citiesLoaded, cities, zonesInitialized]);

  // ده event handler، مش effect — setState هنا مباشرة عادي
  function handleGovernorateChange(cityId: string) {
    const city = cities.find((c) => c.id === cityId);
    setSelectedCityId(cityId);
    setZones([]);
    setForm((prev) => ({ ...prev, governorate: city?.name ?? "", city: "" }));

    if (!cityId) return;

    setLoadingZones(true);
    setError("");
    fetch(`/api/bosta/zones?cityId=${cityId}`)
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error ?? t("errors.loadAreasFailed"));
        setZones(body.data ?? []);
      })
      .catch((err) => setError(err.message ?? t("errors.loadAreasNetwork")))
      .finally(() => setLoadingZones(false));
  }

  function field(key: keyof AddressData) {
    return {
      value: (form[key] as string | null | undefined) ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.governorate || !form.city) {
      setError(tForm("selectGovernorateAndArea"));
      return;
    }

    setSubmitting(true);

    const payload = {
      ...form,
      area: form.area || undefined,
      buildingNo: form.buildingNo || undefined,
      apartment: form.apartment || undefined,
      postalCode: form.postalCode || undefined,
    };

    const res = await fetch(
      initialAddress?.id
        ? `/api/addresses/${initialAddress.id}`
        : "/api/addresses",
      {
        method: initialAddress?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(body.error ?? t("errors.saveAddressFailed"));
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onSaved();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-2 gap-3 rounded-lg border border-steel/15 p-4"
    >
      <input
        placeholder={t("firstName")}
        {...field("firstName")}
        required
        className="rounded-md border border-steel/25 px-3 py-2 text-sm"
      />
      <input
        placeholder={t("lastName")}
        {...field("lastName")}
        required
        className="rounded-md border border-steel/25 px-3 py-2 text-sm"
      />
      <input
        placeholder={t("phone")}
        {...field("phone")}
        required
        className="col-span-2 rounded-md border border-steel/25 px-3 py-2 text-sm"
      />

      <select
        value={selectedCityId}
        onChange={(e) => handleGovernorateChange(e.target.value)}
        disabled={loadingCities}
        className="rounded-md border border-steel/25 px-3 py-2 text-sm text-ink disabled:opacity-50"
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
        value={zones.find((z) => z.name === form.city)?.id ?? ""}
        onChange={(e) => {
          const zone = zones.find((z) => z.id === e.target.value);
          setForm((prev) => ({ ...prev, city: zone?.name ?? "" }));
        }}
        disabled={!selectedCityId || loadingZones}
        className="rounded-md border border-steel/25 px-3 py-2 text-sm text-ink disabled:opacity-50"
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

      <input
        placeholder={t("street")}
        {...field("street")}
        required
        className="col-span-2 rounded-md border border-steel/25 px-3 py-2 text-sm"
      />
      <input
        placeholder={t("buildingNo")}
        {...field("buildingNo")}
        className="rounded-md border border-steel/25 px-3 py-2 text-sm"
      />
      <input
        placeholder={t("apartment")}
        {...field("apartment")}
        className="rounded-md border border-steel/25 px-3 py-2 text-sm"
      />

      <label className="col-span-2 flex items-center gap-2 text-sm text-steel">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, isDefault: e.target.checked }))
          }
        />
        {tForm("setAsDefault")}
      </label>

      {error && <p className="col-span-2 text-sm text-alert">{error}</p>}

      <div className="col-span-2 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink/90 disabled:opacity-40"
        >
          {submitting ? tForm("saving") : tForm("saveAddress")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-steel/25 px-4 py-2 text-sm text-steel hover:text-ink"
          >
            {tForm("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
