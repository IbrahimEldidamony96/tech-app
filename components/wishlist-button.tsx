"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function WishlistButton({ productId, initialSaved }: { productId: string; initialSaved: boolean }) {
  const router = useRouter();
  const t = useTranslations("Wishlist");
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/wishlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, saved: !saved }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (!res.ok) throw new Error();
    const body = await res.json();
    setSaved(body.data.saved);
      setLoading(false);

    } catch { setError(requestFailureMessage()); }
    finally { setLoading(false); }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      aria-pressed={saved}
      aria-label={saved ? t("remove") : t("add")}
      className={`icon-button shrink-0 border disabled:opacity-50 ${
        saved ? "!border-accent/30 !bg-mist !text-accent" : "border-line text-steel hover:border-accent hover:text-accent"
      }`}
    >
      <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7">
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </button>
    {error && <span role="alert" className="max-w-52 text-xs text-alert">{error}</span>}
    </span>
  );
}
