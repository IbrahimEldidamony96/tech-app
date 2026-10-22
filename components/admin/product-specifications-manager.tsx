"use client";
import { requestFailureMessage } from "@/lib/request-error";
import { useState } from "react";

type Spec = { id?: string; keyEn: string; keyAr: string; valueEn: string; valueAr: string; isFilterable: boolean; sortOrder: number };
const blank = (): Spec => ({ keyEn: "", keyAr: "", valueEn: "", valueAr: "", isFilterable: false, sortOrder: 0 });

export function ProductSpecificationsManager({ productId, initialSpecifications }: { productId: string; initialSpecifications: Spec[] }) {
  const [specs, setSpecs] = useState<Spec[]>(initialSpecifications);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  function update(i: number, patch: Partial<Spec>) { setSpecs((prev) => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s)); }
  async function save() {
    try {
      setSaving(true); setMessage("");
      const res = await fetch(`/api/products/${productId}/specifications`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ specifications: specs.map(({ keyEn, keyAr, valueEn, valueAr, isFilterable, sortOrder }) => ({ keyEn, keyAr, valueEn, valueAr, isFilterable, sortOrder })) }) });
      setSaving(false);
      if (!res.ok) { setMessage((await res.json().catch(() => ({}))).error ?? "Save failed"); return; }
      const body = await res.json(); setSpecs(body.data); setMessage("Specifications saved");

    } catch { setMessage(requestFailureMessage()); }
    finally { setSaving(false); }
  }
  return <section className="mt-8 rounded-lg border border-steel/15 p-4">
    <div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-ink">Dynamic specifications</p><p className="text-xs text-steel">Filterable specs are available to catalog filters.</p></div><button type="button" onClick={() => setSpecs((p) => [...p, blank()])} className="rounded bg-ink px-3 py-1 text-xs text-paper">Add specification</button></div>
    <div className="mt-4 space-y-3">{specs.map((s, i) => <div key={s.id ?? i} className="grid gap-2 rounded border border-steel/10 p-3 sm:grid-cols-2">
      <input value={s.keyEn} onChange={(e)=>update(i,{keyEn:e.target.value})} placeholder="Key (English)" className="rounded border border-steel/25 px-2 py-1 text-sm" />
      <input value={s.keyAr} onChange={(e)=>update(i,{keyAr:e.target.value})} placeholder="المفتاح (عربي)" dir="rtl" className="rounded border border-steel/25 px-2 py-1 text-sm" />
      <input value={s.valueEn} onChange={(e)=>update(i,{valueEn:e.target.value})} placeholder="Value (English)" className="rounded border border-steel/25 px-2 py-1 text-sm" />
      <input value={s.valueAr} onChange={(e)=>update(i,{valueAr:e.target.value})} placeholder="القيمة (عربي)" dir="rtl" className="rounded border border-steel/25 px-2 py-1 text-sm" />
      <label className="flex items-center gap-2 text-xs text-steel"><input type="checkbox" checked={s.isFilterable} onChange={(e)=>update(i,{isFilterable:e.target.checked})}/>Filterable</label>
      <div className="flex gap-2"><input type="number" min="0" value={s.sortOrder} onChange={(e)=>update(i,{sortOrder:Number(e.target.value)})} className="w-24 rounded border border-steel/25 px-2 py-1 text-sm"/><button type="button" onClick={()=>setSpecs((p)=>p.filter((_,idx)=>idx!==i))} className="text-xs text-alert">Remove</button></div>
    </div>)}</div>
    <div className="mt-4 flex items-center gap-3"><button type="button" disabled={saving} onClick={save} className="rounded bg-signal px-4 py-2 text-xs font-semibold text-ink disabled:opacity-50">{saving?"Saving…":"Save specifications"}</button>{message&&<span className="text-xs text-steel">{message}</span>}</div>
  </section>;
}
