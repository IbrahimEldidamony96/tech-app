"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type HandoffState = "checking" | "ready" | "error";

export function GuestCartHandoff({
  children,
  hasServerItems,
}: {
  children: ReactNode;
  hasServerItems: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("Checkout");
  const cart = useTranslations("Cart");
  const store = useTranslations("Storefront");
  const [state, setState] = useState<HandoffState>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function handoff() {
      let items: unknown[] = [];
      try {
        const stored = JSON.parse(localStorage.getItem("guestCart") ?? "[]");
        if (Array.isArray(stored)) items = stored;
      } catch {
        localStorage.removeItem("guestCart");
      }

      if (items.length === 0) {
        if (hasServerItems) {
          setState("ready");
        } else {
          router.replace("/cart");
        }
        return;
      }

      const response = await fetch("/api/cart/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (response.status === 401) {
        window.location.replace("/login?next=/checkout");
        return;
      }

      if (!response.ok) {
        if (!cancelled) setState("error");
        return;
      }

      localStorage.removeItem("guestCart");
      window.dispatchEvent(new Event("guest-cart-changed"));
      window.location.replace("/checkout");
    }

    void handoff().catch(() => {
      if (!cancelled) setState("error");
    });

    return () => {
      cancelled = true;
    };
  }, [attempt, hasServerItems, router]);

  if (state === "ready") return children;

  return (
    <div className="surface-card mt-9 flex min-h-64 flex-col items-center justify-center text-center">
      {state === "checking" ? (
        <>
          <span aria-hidden="true" className="mb-4 h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent" />
          <p role="status" className="text-sm text-steel">{t("restoringCart")}</p>
        </>
      ) : (
        <>
          <p role="alert" className="max-w-md text-sm leading-6 text-alert">{t("restoringCartError")}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                setState("checking");
                setAttempt((value) => value + 1);
              }}
            >
              {store("tryAgain")}
            </button>
            <Link href="/cart" className="button-secondary">{cart("title")}</Link>
          </div>
        </>
      )}
    </div>
  );
}
