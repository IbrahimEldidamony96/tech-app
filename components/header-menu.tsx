"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

export function HeaderMenu({ children }: { children: ReactNode }) {
  const t = useTranslations("Storefront");
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={container} className="relative md:hidden" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button ref={toggle} type="button" className="icon-button" aria-label={open ? t("closeMenu") : t("openMenu")} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5">
          {open ? <path d="m6 6 12 12M6 18 18 6" strokeLinecap="round" /> : <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />}
        </svg>
      </button>
      {open && (
        <nav id={id} aria-label={t("navigation")} className="absolute end-0 top-full z-50 mt-3 flex max-h-[calc(100dvh-120px)] w-72 max-w-[calc(100vw-40px)] flex-col overflow-y-auto rounded-2xl border border-line bg-surface p-3 shadow-[0_16px_50px_-16px_color-mix(in_srgb,var(--color-shadow)_25%,transparent)]" onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setOpen(false);
        }}>
          {children}
        </nav>
      )}
    </div>
  );
}
