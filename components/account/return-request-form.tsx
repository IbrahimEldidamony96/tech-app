"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Item={id:string;productName:string;sku:string;quantity:number};
export function ReturnRequestForm({orderId,items}:{orderId:string;items:Item[]}){
 const router=useRouter();const [busy,setBusy]=useState(false);const [msg,setMsg]=useState("");
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const rows=items.map(i=>({orderItemId:i.id,quantity:Number(f.get(`qty:${i.id}`)??0)})).filter(i=>i.quantity>0);setBusy(true);setMsg("");const r=await fetch('/api/returns',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orderId,reason:String(f.get('reason')??''),customerNote:String(f.get('note')??''),items:rows})});const b=await r.json().catch(()=>({}));setBusy(false);if(!r.ok){setMsg(b.error??'Could not submit return');return;}setMsg('Return request submitted');router.refresh();}
 return <form onSubmit={submit} className="mt-3 space-y-3 rounded border border-steel/15 p-4"><div className="grid gap-2">{items.map(i=><label key={i.id} className="grid grid-cols-[1fr_90px] items-center gap-2 text-sm"><span>{i.productName} <span className="text-steel">({i.sku})</span></span><input name={`qty:${i.id}`} type="number" min={0} max={i.quantity} defaultValue={0} className="rounded border border-steel/20 px-2 py-1"/></label>)}</div><input name="reason" required minLength={3} placeholder="Reason for return" className="w-full rounded border border-steel/20 px-3 py-2 text-sm"/><textarea name="note" placeholder="Optional note" className="w-full rounded border border-steel/20 px-3 py-2 text-sm"/><button disabled={busy} className="rounded bg-ink px-3 py-2 text-sm text-white disabled:opacity-50">{busy?'Submitting…':'Request return'}</button>{msg?<p className="text-xs text-steel">{msg}</p>:null}</form>
}
