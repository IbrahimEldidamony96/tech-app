"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Product = { id: string; nameEn: string };
type Item = { productId: string; quantity: number };

export function BundleManager({ products }: { products: Product[] }) {
  const router=useRouter();
  const [open,setOpen]=useState(false); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({nameEn:"",nameAr:"",slug:"",discountType:"PERCENTAGE" as "PERCENTAGE"|"FIXED",discountValue:"",startsAt:"",endsAt:""});
  const [items,setItems]=useState<Item[]>([{productId:"",quantity:1},{productId:"",quantity:1}]);
  const updateItem=(i:number,patch:Partial<Item>)=>setItems(p=>p.map((x,idx)=>idx===i?{...x,...patch}:x));
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");
    const res=await fetch("/api/admin/bundles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,discountValue:Number(form.discountValue),startsAt:form.startsAt?new Date(form.startsAt).toISOString():null,endsAt:form.endsAt?new Date(form.endsAt).toISOString():null,items})});
    setBusy(false); if(!res.ok){const b=await res.json().catch(()=>({}));setError(b.error??"Could not create bundle");return;}
    setOpen(false);setForm({nameEn:"",nameAr:"",slug:"",discountType:"PERCENTAGE",discountValue:"",startsAt:"",endsAt:""});setItems([{productId:"",quantity:1},{productId:"",quantity:1}]);router.refresh();
  }
  if(!open)return <button onClick={()=>setOpen(true)} className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper">New bundle</button>;
  return <form onSubmit={submit} className="mt-4 grid gap-3 rounded-lg border border-steel/15 p-4 sm:grid-cols-2">
    <input required placeholder="Name (English)" value={form.nameEn} onChange={e=>setForm(p=>({...p,nameEn:e.target.value}))} className="rounded border border-steel/25 px-3 py-2 text-sm"/>
    <input required placeholder="الاسم (عربي)" dir="rtl" value={form.nameAr} onChange={e=>setForm(p=>({...p,nameAr:e.target.value}))} className="rounded border border-steel/25 px-3 py-2 text-sm"/>
    <input required placeholder="bundle-slug" value={form.slug} onChange={e=>setForm(p=>({...p,slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-")}))} className="rounded border border-steel/25 px-3 py-2 font-mono text-sm"/>
    <div className="flex gap-2"><select value={form.discountType} onChange={e=>setForm(p=>({...p,discountType:e.target.value as "PERCENTAGE"|"FIXED"}))} className="flex-1 rounded border border-steel/25 px-2 py-2 text-sm"><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed EGP</option></select><input required type="number" min="0.01" step="0.01" value={form.discountValue} onChange={e=>setForm(p=>({...p,discountValue:e.target.value}))} placeholder="Discount" className="w-28 rounded border border-steel/25 px-2 py-2 text-sm"/></div>
    <label className="text-xs text-steel">Starts<input type="datetime-local" value={form.startsAt} onChange={e=>setForm(p=>({...p,startsAt:e.target.value}))} className="mt-1 w-full rounded border border-steel/25 px-2 py-2 text-sm"/></label>
    <label className="text-xs text-steel">Ends<input type="datetime-local" value={form.endsAt} onChange={e=>setForm(p=>({...p,endsAt:e.target.value}))} className="mt-1 w-full rounded border border-steel/25 px-2 py-2 text-sm"/></label>
    <div className="col-span-full space-y-2"><p className="text-xs font-medium text-steel">Products (minimum 2)</p>{items.map((item,i)=><div key={i} className="flex gap-2"><select required value={item.productId} onChange={e=>updateItem(i,{productId:e.target.value})} className="min-w-0 flex-1 rounded border border-steel/25 px-2 py-2 text-sm"><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.nameEn}</option>)}</select><input type="number" min="1" max="100" value={item.quantity} onChange={e=>updateItem(i,{quantity:Number(e.target.value)})} className="w-20 rounded border border-steel/25 px-2 py-2 text-sm"/>{items.length>2&&<button type="button" onClick={()=>setItems(p=>p.filter((_,idx)=>idx!==i))} className="text-xs text-alert">Remove</button>}</div>)}<button type="button" onClick={()=>setItems(p=>[...p,{productId:"",quantity:1}])} className="text-xs font-medium text-ink underline">+ Add product</button></div>
    {error&&<p className="col-span-full text-sm text-alert">{error}</p>}
    <div className="col-span-full flex gap-2"><button disabled={busy} className="rounded bg-signal px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{busy?"Saving…":"Create bundle"}</button><button type="button" onClick={()=>setOpen(false)} className="rounded border border-steel/25 px-4 py-2 text-sm">Cancel</button></div>
  </form>;
}
