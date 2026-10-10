"use client";

import { useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import styles from "./chrome.module.css";

type Suggestion = {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  brand: { name: string } | null;
};

export function SearchBar({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("Header");
  const store = useTranslations("Storefront");
  const locale = useLocale();
  const id = useId();
  const [value, setValue] = useState(searchParams.get("search") ?? "");
  const [result, setResult] = useState<{ query: string; items: Suggestion[] }>({ query: "", items: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim();
  const items = query.length >= 2 && result.query === query ? result.items : [];
  const expanded = open && items.length > 0;

  useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const body = response.ok ? await response.json() : { data: [] };
        if (!controller.signal.aborted) setResult({ query, items: body.data ?? [] });
      } catch {
        // Search submission remains available when suggestions cannot load.
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function choose(item: Suggestion) {
    setOpen(false);
    setActive(-1);
    router.push(`/products/${item.slug}`);
  }

  return (
    <form action="/" method="GET" role="search" aria-label={store("search")} className={`relative ${className ?? ""}`} onSubmit={() => setOpen(false)} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className={`${styles.searchSurface} flex h-12 items-center rounded-full ps-4 pe-1.5`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-[18px] shrink-0 text-steel">
          <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" strokeLinecap="round" />
        </svg>
        <input type="search" name="search" value={value} aria-label={store("search")} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? id : undefined} aria-activedescendant={expanded && active >= 0 ? `${id}-${active}` : undefined} onChange={(event) => {
          setValue(event.target.value);
          setActive(-1);
          setOpen(true);
        }} onFocus={() => setOpen(true)} onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setActive(-1);
          } else if (items.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setOpen(true);
            setActive((current) => event.key === "ArrowDown" ? (current + 1) % items.length : (current <= 0 ? items.length - 1 : current - 1));
          } else if (event.key === "Enter" && expanded && active >= 0) {
            event.preventDefault();
            choose(items[active]);
          }
        }} placeholder={t("searchPlaceholder")} autoComplete="off" className="min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-steel/80" />
        <button type="submit" aria-label={store("search")} className={`${styles.searchSubmit} flex size-9 shrink-0 items-center justify-center rounded-full`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4 rtl:rotate-180">
            <path d="M5 12h14m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div id={id} role="listbox" aria-label={store("search")} className={`${styles.suggestions} absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-line p-2`}>
          {items.map((item, index) => (
            <button type="button" role="option" id={`${id}-${index}`} aria-selected={active === index} tabIndex={-1} key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-start text-sm transition-colors hover:bg-mist ${active === index ? "bg-mist" : ""}`}>
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{locale === "ar" ? item.nameAr || item.nameEn : item.nameEn}</span>
                <span className="mt-0.5 block truncate text-xs text-steel">{locale === "ar" ? item.nameEn : item.nameAr}</span>
              </span>
              {item.brand && <span className="max-w-[32%] shrink-0 truncate rounded-full bg-paper px-2.5 py-1 text-[10px] text-steel">{item.brand.name}</span>}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
