"use client";

import { useTranslations } from "next-intl";

// نفس فلسفة SearchBar (components/search-bar.tsx): <form method="GET">
// عادي بيعمل navigation طبيعي لـ "/admin?range=...". الحاجة الوحيدة
// المحتاجة JS هي onChange اللي بيعمل submit تلقائي للفورم لما تختار
// قيمة جديدة، بدل ما يستنى زرار submit منفصل.
export function RevenueRangeSelect({ currentRange }: { currentRange: string }) {
  const t = useTranslations("AdminHome");

  return (
    <form method="GET" action="/admin">
      <select
        key={currentRange}
        name="range"
        defaultValue={currentRange}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label={t("revenueRangeLabel")}
        className="rounded-md border border-steel/25 bg-paper px-2 py-1 text-xs text-ink focus:border-ink focus:outline-none"
      >
        <option value="today">{t("rangeToday")}</option>
        <option value="7d">{t("range7d")}</option>
        <option value="30d">{t("range30d")}</option>
      </select>
    </form>
  );
}