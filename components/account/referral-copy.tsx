"use client";
import { useState } from "react";
export function ReferralCopy({ code }: { code: string }) {
  const [copied,setCopied]=useState(false);
  return <button className="rounded bg-ink px-3 py-2 text-sm text-white" onClick={async()=>{const url=`${window.location.origin}/register?ref=${encodeURIComponent(code)}`;await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),1500);}}>{copied?"Copied":"Copy referral link"}</button>;
}
