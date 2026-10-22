"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function ProductActiveToggle({
  productId,
  initialActive,
}: {
  productId: string;
  initialActive: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("AdminProducts");
  const [active, setActive] = useState(initialActive);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    try {
      setLoading(true);
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !active }),
      });

      if (!res.ok) throw new Error("Product update failed");
      setActive((prev) => !prev);
      router.refresh();
      setLoading(false);

    } catch { window.alert(requestFailureMessage()); }
    finally { setLoading(false); }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`rounded px-2 py-1 text-xs font-medium disabled:opacity-40 ${
        active ? "bg-signal/20 text-ink hover:bg-alert/20 hover:text-alert" : "bg-steel/10 text-steel hover:bg-signal/20 hover:text-ink"
      }`}
    >
      {active ? t("active") : t("inactive")}
    </button>
  );
}
