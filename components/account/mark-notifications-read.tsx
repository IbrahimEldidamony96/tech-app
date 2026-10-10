"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function MarkNotificationsRead() {
  const [busy,setBusy]=useState(false); const router=useRouter();
  return <button disabled={busy} onClick={async()=>{setBusy(true);await fetch('/api/notifications',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({all:true})});setBusy(false);router.refresh();}} className="rounded border border-steel/20 px-3 py-2 text-sm disabled:opacity-50">Mark all read</button>;
}
