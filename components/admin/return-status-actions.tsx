"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
const options=["APPROVED","REJECTED","RECEIVED","REFUNDED"] as const;
export function ReturnStatusActions({id,current}:{id:string;current:string}){const [busy,setBusy]=useState(false);const [error,setError]=useState("");const router=useRouter();return <div className="flex flex-wrap gap-2">{options.map(status=><button key={status} disabled={busy||status===current} onClick={async()=>{setBusy(true);setError("");const res=await fetch(`/api/admin/returns/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status})});const body=await res.json().catch(()=>({}));setBusy(false);if(!res.ok){setError(body.error??'Update failed');return;}router.refresh();}} className="rounded border border-steel/20 px-2 py-1 text-xs disabled:opacity-40">{status}</button>)}{error?<span className="w-full text-xs text-alert">{error}</span>:null}</div>}
