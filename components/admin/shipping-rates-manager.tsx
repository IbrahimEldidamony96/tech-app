"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { localized } from "@/lib/locale";
import type { AppLocale } from "@/i18n/request";
import type { AdminShippingRateRow } from "@/lib/queries/admin-shipping-rates";

type RowState = { fee: string; isActive: boolean };

function rowStateFor(rate: AdminShippingRateRow): RowState {
  return {
    fee: rate.fee !== null ? String(rate.fee) : "",
    isActive: rate.isActive,
  };
}

export function ShippingRatesManager({
  initialRates,
  locale,
}: {
  initialRates: AdminShippingRateRow[];
  locale: AppLocale;
}) {
  const router = useRouter();
  const t = useTranslations("AdminShippingRates");
  const [rows, setRows] = useState(
    () => new Map(initialRates.map((r) => [r.bostaCityId, rowStateFor(r)])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function updateRow(bostaCityId: string, patch: Partial<RowState>) {
    setRows((prev) => {
      const next = new Map(prev);
      next.set(bostaCityId, { ...next.get(bostaCityId)!, ...patch });
      return next;
    });
  }

  // Bosta بترجع أسماء المحافظات كـ nameEn/nameAr مباشرة (مش fallback زي
  // منتجاتنا إحنا)، فمفيش ضمان إن cityNameAr موجودة دايمًا — لو مش
  // موجودة نرجع للإنجليزي في الحالتين، أساسي وثانوي
  function cityLabel(rate: AdminShippingRateRow) {
    const primary = localized(locale, rate.cityNameEn, rate.cityNameAr ?? rate.cityNameEn);
    const secondary = locale === "ar" ? rate.cityNameEn : rate.cityNameAr;
    return { primary, secondary: secondary && secondary !== primary ? secondary : null };
  }

  async function handleSave(rate: AdminShippingRateRow) {
    try {
      const row = rows.get(rate.bostaCityId)!;
      const fee = Number(row.fee);
      const { primary } = cityLabel(rate);
      if (!row.fee || Number.isNaN(fee) || fee < 0) {
        setError(t("enterValidFee", { city: primary }));
        return;
      }

      setError("");
      setSavingId(rate.bostaCityId);

      const res = await fetch("/api/admin/shipping-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bostaCityId: rate.bostaCityId,
          cityNameEn: rate.cityNameEn,
          cityNameAr: rate.cityNameAr ?? undefined,
          fee,
          isActive: row.isActive,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("saveFailed", { city: primary }));
        setSavingId(null);
        return;
      }

      setSavingId(null);
      router.refresh();

    } catch { setError(requestFailureMessage()); }
    finally { setSavingId(null); }
  }

  async function handleReset(rate: AdminShippingRateRow) {
    try {
      if (!rate.rateId) return;
      const { primary } = cityLabel(rate);
      setError("");
      setSavingId(rate.bostaCityId);

      const res = await fetch(`/api/admin/shipping-rates/${rate.rateId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("resetFailed", { city: primary }));
        setSavingId(null);
        return;
      }

      updateRow(rate.bostaCityId, { fee: "", isActive: true });
      setSavingId(null);
      router.refresh();

    } catch { setError(requestFailureMessage()); }
    finally { setSavingId(null); }
  }

  return (
    <div className="mt-6 space-y-4">
      {error && <p className="text-sm text-alert">{error}</p>}

      <table className="w-full text-sm">
        <thead className="text-start text-xs uppercase tracking-wide text-steel">
          <tr>
            <th className="py-2 text-start">{t("governorate")}</th>
            <th className="py-2 text-start">{t("feeEgp")}</th>
            <th className="py-2 text-start">{t("active")}</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-steel/10">
          {initialRates.map((rate) => {
            const row = rows.get(rate.bostaCityId)!;
            const isConfigured = rate.rateId !== null;
            const { primary, secondary } = cityLabel(rate);
            return (
              <tr key={rate.bostaCityId}>
                <td className="py-2 text-ink">
                  {primary}
                  {secondary && (
                    <span className="ms-2 text-xs text-steel">
                      {secondary}
                    </span>
                  )}
                  {!isConfigured && (
                    <span className="ms-2 rounded bg-steel/10 px-1.5 py-0.5 text-[10px] uppercase text-steel">
                      {t("usingDefault")}
                    </span>
                  )}
                </td>
                <td className="py-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="—"
                    dir="ltr"
                    value={row.fee}
                    onChange={(e) =>
                      updateRow(rate.bostaCityId, { fee: e.target.value })
                    }
                    className="w-24 rounded-md border border-steel/25 px-2 py-1 text-sm"
                  />
                </td>
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={row.isActive}
                    onChange={(e) =>
                      updateRow(rate.bostaCityId, {
                        isActive: e.target.checked,
                      })
                    }
                  />
                </td>
                <td className="py-2 space-x-3 text-end rtl:space-x-reverse">
                  <button
                    onClick={() => handleSave(rate)}
                    disabled={savingId === rate.bostaCityId}
                    className="text-xs font-semibold text-ink hover:underline disabled:opacity-40"
                  >
                    {t("save")}
                  </button>
                  {isConfigured && (
                    <button
                      onClick={() => handleReset(rate)}
                      disabled={savingId === rate.bostaCityId}
                      className="text-xs text-steel hover:text-alert disabled:opacity-40"
                    >
                      {t("reset")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
