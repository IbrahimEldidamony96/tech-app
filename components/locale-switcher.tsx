"use client";

import { usePathname } from "next/navigation";
import type { AppLocale } from "@/i18n/request";

export function LocaleSwitcher({ locale }: { locale: AppLocale }) {
  const pathname = usePathname();
  const next: AppLocale = locale === "ar" ? "en" : "ar";
  const label = next === "ar" ? "العربية" : "EN";

  return (
    <a
      href={`/api/locale?locale=${next}&redirect=${encodeURIComponent(pathname)}`}
      lang={next}
      aria-label={next === "ar" ? "التبديل إلى العربية" : "Switch to English"}
      className="flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-3.5">
        <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" />
      </svg>
      {label}
    </a>
  );
}
