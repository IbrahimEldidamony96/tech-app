"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

type GalleryImage = {
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
};

export function ProductGallery({
  images,
  productName,
}: {
  images: GalleryImage[];
  productName: string;
}) {
  const t = useTranslations("ProductGallery");

  // Start on whichever image is primary (falls back to the first image, or
  // -1 -> 0 -> undefined -> "No image" placeholder if the product has none).
  const primaryIndex = Math.max(
    images.findIndex((img) => img.isPrimary),
    0,
  );
  const [selectedIndex, setSelectedIndex] = useState(primaryIndex);

  const selected = images[selectedIndex];

  return (
    <div className="min-w-0">
      <div className="relative aspect-square overflow-hidden rounded-[28px] border border-line bg-surface">
        {selected ? (
          <Image
            src={selected.url}
            alt={selected.alt ?? productName}
            fill
            className="object-contain p-8 sm:p-12"
            sizes="(min-width: 1280px) 600px, (min-width: 1024px) 50vw, 90vw"
            loading="eager"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-steel">
            {t("noImage")}
          </div>
        )}
      </div>

      {/* Only worth a thumbnail row if there's more than one image to
          choose between. */}
      {images.length > 1 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setSelectedIndex(i)}
              aria-label={t("showImage", { index: i + 1, total: images.length })}
              aria-current={i === selectedIndex}
              className={`relative size-20 shrink-0 overflow-hidden rounded-2xl border bg-surface transition-colors ${
                i === selectedIndex
                  ? "border-accent ring-1 ring-accent"
                  : "border-line hover:border-accent/50"
              }`}
            >
              <Image
                src={img.url}
                alt={img.alt ?? `${productName} ${i + 1}`}
                fill
                className="object-contain p-2"
                sizes="80px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
