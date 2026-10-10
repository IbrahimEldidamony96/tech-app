"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const roles = ["CUSTOMER", "SUPPORT", "PRODUCT_MANAGER", "ORDER_MANAGER", "ADMIN", "SUPER_ADMIN"] as const;

export function StaffRoleSelect({ userId, value }: { userId: string; value: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div>
      <select
        value={value}
        disabled={busy}
        className="rounded border border-steel/20 px-2 py-1 text-sm"
        onChange={async (e) => {
          setBusy(true); setError("");
          const res = await fetch(`/api/admin/staff/${userId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: e.target.value }) });
          const body = await res.json().catch(() => ({}));
          setBusy(false);
          if (!res.ok) { setError(body.error ?? "Update failed"); router.refresh(); return; }
          router.refresh();
        }}
      >
        {roles.map((role) => <option key={role} value={role}>{role}</option>)}
      </select>
      {error ? <p className="mt-1 text-xs text-alert">{error}</p> : null}
    </div>
  );
}
