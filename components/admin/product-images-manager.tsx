"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ImageUploader } from "@/components/image-uploader";

export type ProductImageItem = {
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

type ImagePatch = Partial<
  Pick<ProductImageItem, "alt" | "isPrimary" | "sortOrder">
>;

export function ProductImagesManager({
  productId,
  initialImages,
}: {
  productId: string;
  initialImages: ProductImageItem[];
}) {
  const t = useTranslations("AdminImages");
  const [images, setImages] = useState<ProductImageItem[]>(initialImages);
  const [error, setError] = useState("");

  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);

  async function addImage(url: string) {
    try {
      setError("");
      const res = await fetch(`/api/products/${productId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("addFailed"));
        return;
      }

      const body = await res.json();
      // A product's first image comes back already isPrimary — that's the
      // server's call (we didn't send isPrimary at all), so just trust it.
      setImages((prev) => [...prev, body.data]);

    } catch { setError(requestFailureMessage()); }

  }

  async function updateImage(imageId: string, patch: ImagePatch) {
    try {
      setError("");
      const res = await fetch(`/api/products/${productId}/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("updateFailed"));
        return;
      }

      const body = await res.json();
      setImages((prev) =>
        prev.map((img) => {
          if (img.id === imageId) return body.data;
          // Setting a new primary un-sets every other image server-side —
          // mirror that locally instead of refetching the whole list.
          if (patch.isPrimary && img.isPrimary)
            return { ...img, isPrimary: false };
          return img;
        }),
      );

    } catch { setError(requestFailureMessage()); }

  }

  async function deleteImage(imageId: string) {
    try {
      setError("");
      const target = images.find((img) => img.id === imageId);

      const res = await fetch(`/api/products/${productId}/images/${imageId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("deleteFailed"));
        return;
      }

      setImages((prev) => {
        const rest = prev.filter((img) => img.id !== imageId);
        // Mirror the server's auto-promotion: deleting the primary image
        // hands the crown to whichever image is now first in sort order.
        if (target?.isPrimary && rest.length > 0) {
          const bySortOrder = [...rest].sort((a, b) => a.sortOrder - b.sortOrder);
          return bySortOrder.map((img, i) =>
            i === 0 ? { ...img, isPrimary: true } : img,
          );
        }
        return rest;
      });

    } catch { setError(requestFailureMessage()); }

  }

  function move(imageId: string, direction: "up" | "down") {
    const index = sorted.findIndex((img) => img.id === imageId);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= sorted.length) return;

    const a = sorted[index];
    const b = sorted[swapWith];

    // Two independent PATCH calls swapping sortOrder — simple, and fine
    // for a single admin reordering images; not wrapped in one atomic
    // transaction since there's no concurrent-edit risk here in practice.
    updateImage(a.id, { sortOrder: b.sortOrder });
    updateImage(b.id, { sortOrder: a.sortOrder });
  }

  return (
    <div className="mt-8 rounded-lg border border-steel/15 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-steel">
        {t("title")}
      </p>
      <p className="mt-1 text-xs text-steel">
        {t("hint")}
      </p>

      {sorted.length === 0 && (
        <p className="mt-4 text-xs text-steel">{t("noImages")}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {sorted.map((img, i) => (
          <div key={img.id} className="rounded-lg border border-steel/15 p-2">
            <div className="relative aspect-square overflow-hidden rounded-md bg-steel/5">
              <Image
                src={img.url}
                alt={img.alt ?? ""}
                fill
                className="object-cover"
                sizes="200px"
              />
              {img.isPrimary && (
                <span className="absolute start-1 top-1 rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-paper">
                  {t("primary")}
                </span>
              )}
            </div>

            <input
              defaultValue={img.alt ?? ""}
              placeholder={t("altPlaceholder")}
              onBlur={(e) =>
                e.target.value !== (img.alt ?? "") &&
                updateImage(img.id, { alt: e.target.value })
              }
              className="mt-2 w-full rounded border border-steel/15 px-2 py-1 text-xs text-ink focus:border-ink"
            />

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {!img.isPrimary && (
                <button
                  type="button"
                  onClick={() => updateImage(img.id, { isPrimary: true })}
                  className="text-ink hover:underline"
                >
                  {t("setPrimary")}
                </button>
              )}
              <button
                type="button"
                onClick={() => move(img.id, "up")}
                disabled={i === 0}
                className="text-steel hover:text-ink disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(img.id, "down")}
                disabled={i === sorted.length - 1}
                className="text-steel hover:text-ink disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => deleteImage(img.id)}
                className="ms-auto text-alert hover:underline"
              >
                {t("delete")}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-steel/10 pt-4">
        <p className="text-xs font-medium text-steel">{t("addImage")}</p>
        <ImageUploader value="" onChange={addImage} folder="products" />
      </div>

      {error && <p className="mt-2 text-xs text-alert">{error}</p>}
    </div>
  );
}
