"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function DeleteBundleButton({id}:{id:string}){const r=useRouter();const[busy,setBusy]=useState(false);return <button disabled={busy} onClick={async()=>{if(!confirm("Delete this bundle?"))return;setBusy(true);const res=await fetch(`/api/admin/bundles/${id}`,{method:"DELETE"});setBusy(false);if(res.ok)r.refresh();else alert("Delete failed");}} className="text-xs text-alert disabled:opacity-50">{busy?"…":"Delete"}</button>}
