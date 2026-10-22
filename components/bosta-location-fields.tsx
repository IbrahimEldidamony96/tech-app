"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Option = { id: string; name: string };
export type ShippingLocation = {
  governorate: string; city: string; area?: string | null;
  bostaCityId?: string | null; bostaDistrictId?: string | null;
};
function useOptions(url: string) {
  const [result, setResult] = useState<{url: string; options: Option[]; error: string} | null>(null);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).then(async res => {
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load shipping locations");
      if (!controller.signal.aborted) setResult({ url, options: body.data ?? [], error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ url, options: [], error: error instanceof Error ? error.message : "Could not load shipping locations" });
    });
    return () => controller.abort();
  }, [url]);
  return { options: result?.url === url ? result.options : [], loading: !!url && result?.url !== url, error: result?.url === url ? result.error : "" };
}
export function BostaLocationFields({ value, onChange }: { value: ShippingLocation; onChange: (location: ShippingLocation) => void }) {
  const t = useTranslations("Checkout");
  const [retry, setRetry] = useState(0);
  const cities = useOptions("/api/bosta/cities?retry=" + retry);
  const cityId = value.bostaCityId ?? cities.options.find(c => c.name === value.governorate)?.id ?? "";
  const zones = useOptions(cityId ? "/api/bosta/zones?cityId=" + encodeURIComponent(cityId) + "&retry=" + retry : "");
  const zoneId = zones.options.find(z => z.name === value.city)?.id ?? "";
  const districts = useOptions(cityId && zoneId ? "/api/bosta/districts?cityId=" + encodeURIComponent(cityId) + "&zoneId=" + encodeURIComponent(zoneId) + "&retry=" + retry : "");
  const error = cities.error || zones.error || districts.error;
  return <>
    <select aria-label={t("selectGovernorate")} value={cityId} disabled={cities.loading} className="field-input" onChange={event => {
      const city = cities.options.find(c => c.id === event.target.value);
      onChange({ governorate: city?.name ?? "", city: "", area: "", bostaCityId: city?.id ?? null, bostaDistrictId: null });
    }}>
      <option value="">{cities.loading ? t("loadingGovernorates") : t("selectGovernorate")}</option>
      {cities.options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
    <select aria-label={t("selectArea")} value={zoneId} disabled={!cityId || zones.loading} className="field-input" onChange={event => {
      const zone = zones.options.find(z => z.id === event.target.value);
      onChange({ ...value, bostaCityId: cityId, city: zone?.name ?? "", area: "", bostaDistrictId: null });
    }}>
      <option value="">{zones.loading ? t("loadingAreas") : t("selectArea")}</option>
      {zones.options.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
    </select>
    <select aria-label={t("selectDistrict")} value={value.bostaDistrictId ?? ""} disabled={!zoneId || districts.loading} className="field-input col-span-2" onChange={event => {
      const district = districts.options.find(d => d.id === event.target.value);
      onChange({ ...value, bostaCityId: cityId, area: district?.name ?? "", bostaDistrictId: district?.id ?? null });
    }}>
      <option value="">{districts.loading ? t("loadingDistricts") : t("selectDistrict")}</option>
      {districts.options.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
    {error && <div className="col-span-2 text-sm text-alert" role="alert">{error} <button type="button" className="underline" onClick={() => setRetry(n => n + 1)}>{t("retryLocations")}</button></div>}
  </>;
}
