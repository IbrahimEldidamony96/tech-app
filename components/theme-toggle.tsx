"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getThemeSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerThemeSnapshot() {
  return false;
}

export function ThemeToggle() {
  const t = useTranslations("Storefront");
  const dark = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // The visible theme can still change when browser storage is unavailable.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? t("lightMode") : t("darkMode")}
      aria-pressed={dark}
      title={dark ? t("lightMode") : t("darkMode")}
      className="flex size-8 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4">
        {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" strokeLinecap="round" /></> : <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </button>
  );
}
