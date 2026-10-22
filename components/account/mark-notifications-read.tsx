"use client";
import { requestFailureMessage } from "@/lib/request-error";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function MarkNotificationsRead() {
  const [busy,setBusy]=useState(false); const router=useRouter();
  return <button disabled={busy} onClick={async()=>{
    try { setBusy(true);const response=await fetch('/api/notifications',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({all:true})});if(!response.ok)throw new Error("Could not update notifications");router.refresh();
    } catch { window.alert(requestFailureMessage()); }
    finally { setBusy(false); }
  }} className="rounded border border-steel/20 px-3 py-2 text-sm disabled:opacity-50">Mark all read</button>;
}
