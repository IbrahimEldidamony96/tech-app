import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  description,
  eyebrow,
  backLabel,
  children,
}: {
  title: string;
  description: string;
  eyebrow: string;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="relative isolate overflow-hidden px-5 py-12 sm:px-8 sm:py-20">
      <div aria-hidden="true" className="pointer-events-none absolute -top-36 left-1/2 -z-10 h-[540px] w-[540px] -translate-x-1/2 rounded-full bg-mist blur-3xl" />
      <div className="mx-auto max-w-[460px]">
        <Link href="/" className="mb-7 inline-flex items-center gap-2 text-sm text-steel transition-colors hover:text-accent">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="rtl:rotate-180"><path d="m14 7-5 5 5 5M9 12h11" /></svg>
          {backLabel}
        </Link>
        <section className="surface-card shadow-[0_18px_70px_-35px_color-mix(in_srgb,var(--color-shadow)_22%,transparent)]">
          <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-mist text-accent" aria-hidden="true">
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M9 7h6M10 17h4" /></svg>
          </div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-steel">{description}</p>
          <div className="mt-7">{children}</div>
        </section>
      </div>
    </div>
  );
}
