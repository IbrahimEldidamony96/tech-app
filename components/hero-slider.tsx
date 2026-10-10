"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

export type SlideItem = {
  id: string;
  url: string;
  alt: string | null;
  link: string | null;
};

const AUTO_ADVANCE_MS = 5000;

function isExternalLink(link: string) {
  return /^https?:\/\//i.test(link);
}

function subscribeToMotionPreference(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getMotionPreference() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerMotionPreference() {
  return false;
}

export function HeroSlider({ slides }: { slides: SlideItem[] }) {
  const t = useTranslations("HeroSlider");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, getMotionPreference, getServerMotionPreference);

  const goTo = useCallback(
    (i: number) =>
      setIndex(((i % slides.length) + slides.length) % slides.length),
    [slides.length],
  );
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Auto-advance, paused on hover/focus so nobody loses their place mid-read.
  useEffect(() => {
    if (slides.length < 2 || paused || manuallyPaused || reducedMotion) return;
    const id = setInterval(next, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [slides.length, paused, manuallyPaused, reducedMotion, next]);

  if (slides.length === 0) return null;

  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-line bg-mist sm:aspect-[21/7]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      {slides.map((slide, i) => {
        const isCurrent = i === index;
        const image = (
          <Image
            src={slide.url}
            alt={slide.alt ?? ""}
            fill
            loading={i === 0 ? "eager" : "lazy"}
            className="object-cover"
            sizes="100vw"
          />
        );

        return (
          <div
            key={slide.id}
            aria-hidden={!isCurrent}
            className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${
              isCurrent ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {slide.link ? (
              isExternalLink(slide.link) ? (
                <a
                  href={slide.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={isCurrent ? 0 : -1}
                  className="block h-full w-full"
                >
                  {image}
                </a>
              ) : (
                <Link
                  href={slide.link}
                  tabIndex={isCurrent ? 0 : -1}
                  className="block h-full w-full"
                >
                  {image}
                </Link>
              )
            ) : (
              image
            )}
          </div>
        );
      })}

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label={t("previousSlide")}
            className="absolute start-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/60 sm:start-5 rtl:scale-x-[-1]"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m14 6-6 6 6 6" /></svg>
          </button>
          <button
            type="button"
            onClick={next}
            aria-label={t("nextSlide")}
            className="absolute end-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/60 sm:end-5 rtl:scale-x-[-1]"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m10 6 6 6-6 6" /></svg>
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center rounded-full border border-white/15 bg-black/25 px-2 backdrop-blur-md sm:bottom-5">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={t("goToSlide", { number: i + 1 })}
                aria-current={i === index}
                className="flex h-11 min-w-8 items-center justify-center px-1"
              >
                <span className={`h-1.5 rounded-full transition-[width,background-color] motion-reduce:transition-none ${i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`} />
              </button>
            ))}
          </div>
          {!reducedMotion && (
            <button type="button" onClick={() => setManuallyPaused((value) => !value)} aria-label={manuallyPaused ? t("playSlides") : t("pauseSlides")} aria-pressed={manuallyPaused} className="absolute bottom-3 end-3 flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/60 sm:bottom-5 sm:end-5">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">{manuallyPaused ? <path d="m8 5 11 7-11 7V5Z" /> : <path d="M6 5h4v14H6zm8 0h4v14h-4z" />}</svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}
