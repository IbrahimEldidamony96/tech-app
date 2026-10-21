"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { localized } from "@/lib/locale";
import type { AppLocale } from "@/i18n/request";
import type { OptionWithValues } from "./options-manager";

export type VariantWithSummary = {
  id: string; sku: string; price: number; stock: number; isActive: boolean; optionSummary: string;
  salePrice: number | null; saleStartsAt: string | null; saleEndsAt: string | null;
};
const emptyNew = { sku: "", price: "", stock: "" };
const localDateTime = (iso: string | null) => iso ? new Date(iso).toISOString().slice(0,16) : "";

export function VariantsManager({ productId, options, variants, setVariants, locale }: {
  productId: string; options: OptionWithValues[]; variants: VariantWithSummary[];
  setVariants: React.Dispatch<React.SetStateAction<VariantWithSummary[]>>; locale: AppLocale;
}) {
  const t = useTranslations("AdminVariants");
  const [newVariant, setNewVariant] = useState(emptyNew);
  const [selectedValues, setSelectedValues] = useState<Record<string,string>>({});
  const [error, setError] = useState(""); const [savingId, setSavingId] = useState<string|null>(null);

  async function updateVariant(id: string, data: Record<string, unknown>) {
    setSavingId(id); setError("");
    try {
    const res = await fetch(`/api/products/${productId}/variants/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data) });
    if (res.ok) {
      const body = await res.json(); const d = body.data;
      setVariants(prev=>prev.map(v=>v.id===id?{...v,...d,price:Number(d.price),salePrice:d.salePrice==null?null:Number(d.salePrice),saleStartsAt:d.saleStartsAt??null,saleEndsAt:d.saleEndsAt??null}:v));
    } else setError((await res.json().catch(()=>({}))).error ?? "Update failed");
    } catch {
      setError("Could not contact the server. Try again.");
    } finally {
      setSavingId(null);
    }
  }

  async function addVariant(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (options.length>0 && !options.every(o=>!!selectedValues[o.id])) { setError(t("selectValueForEveryOption")); return; }
    try {
    const res=await fetch(`/api/products/${productId}/variants`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sku:newVariant.sku,price:Number(newVariant.price),stock:Number(newVariant.stock),optionValueIds:Object.values(selectedValues)})});
    if(!res.ok){setError((await res.json().catch(()=>({}))).error??t("addFailed"));return;}
    const body=await res.json();
    const optionSummary=options.map(o=>{const value=o.values.find(v=>v.id===selectedValues[o.id]);return value?localized(locale,value.valueEn,value.valueAr):undefined;}).filter(Boolean).join(" / ");
    setVariants(prev=>[...prev,{id:body.data.id,sku:body.data.sku,price:Number(body.data.price),stock:body.data.stock,isActive:body.data.isActive,optionSummary,salePrice:null,saleStartsAt:null,saleEndsAt:null}]);
    setNewVariant(emptyNew);setSelectedValues({});
    } catch {
      setError(t("addFailed"));
    }
  }

  return <div className="mt-8 rounded-lg border border-steel/15 p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-steel">{t("title")}</p>
    {variants.length===0?<p className="mt-3 text-sm text-alert">{t("noVariants")}</p>:<div className="mt-3 space-y-3">
      {variants.map(v=><div key={v.id} className="rounded border border-steel/10 p-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <input defaultValue={v.sku} dir="ltr" onBlur={e=>e.target.value!==v.sku&&updateVariant(v.id,{sku:e.target.value})} disabled={savingId===v.id} className="rounded border border-steel/25 px-2 py-1 font-mono text-xs" />
          <input type="number" step="0.01" defaultValue={v.price} onBlur={e=>updateVariant(v.id,{price:Number(e.target.value)})} disabled={savingId===v.id} className="rounded border border-steel/25 px-2 py-1 text-xs" />
          <input type="number" defaultValue={v.stock} onBlur={e=>{if(Number(e.target.value)!==v.stock)void updateVariant(v.id,{stock:Number(e.target.value),expectedStock:v.stock});}} disabled={savingId===v.id} className="rounded border border-steel/25 px-2 py-1 text-xs" />
          <span className="self-center text-xs text-steel">{v.optionSummary||"—"}</span>
        </div>
        <div className="mt-2 grid gap-2 border-t border-steel/10 pt-2 sm:grid-cols-3">
          <label className="text-[11px] text-steel">Sale price<input type="number" min="0" step="0.01" defaultValue={v.salePrice??""} onBlur={e=>updateVariant(v.id,{salePrice:e.target.value?Number(e.target.value):null})} className="mt-1 w-full rounded border border-steel/25 px-2 py-1 text-xs" /></label>
          <label className="text-[11px] text-steel">Sale starts<input type="datetime-local" defaultValue={localDateTime(v.saleStartsAt)} onBlur={e=>updateVariant(v.id,{saleStartsAt:e.target.value?new Date(e.target.value).toISOString():null})} className="mt-1 w-full rounded border border-steel/25 px-2 py-1 text-xs" /></label>
          <label className="text-[11px] text-steel">Sale ends<input type="datetime-local" defaultValue={localDateTime(v.saleEndsAt)} onBlur={e=>updateVariant(v.id,{saleEndsAt:e.target.value?new Date(e.target.value).toISOString():null})} className="mt-1 w-full rounded border border-steel/25 px-2 py-1 text-xs" /></label>
        </div>
      </div>)}
    </div>}
    <form onSubmit={addVariant} className="mt-4 space-y-2 border-t border-steel/10 pt-4">
      {options.length>0&&<div className="flex flex-wrap gap-2">{options.map(option=><select key={option.id} value={selectedValues[option.id]??""} onChange={e=>setSelectedValues(prev=>({...prev,[option.id]:e.target.value}))} className="rounded-md border border-steel/25 px-2 py-1 text-xs"><option value="">{localized(locale,option.nameEn,option.nameAr)}…</option>{option.values.map(v=><option key={v.id} value={v.id}>{localized(locale,v.valueEn,v.valueAr)}</option>)}</select>)}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <input required placeholder={t("sku")} dir="ltr" value={newVariant.sku} onChange={e=>setNewVariant(p=>({...p,sku:e.target.value}))} className="w-28 rounded-md border border-steel/25 px-2 py-1 font-mono text-xs" />
        <input required type="number" step="0.01" placeholder={t("price")} value={newVariant.price} onChange={e=>setNewVariant(p=>({...p,price:e.target.value}))} className="w-24 rounded-md border border-steel/25 px-2 py-1 text-xs" />
        <input required type="number" placeholder={t("stock")} value={newVariant.stock} onChange={e=>setNewVariant(p=>({...p,stock:e.target.value}))} className="w-20 rounded-md border border-steel/25 px-2 py-1 text-xs" />
        <button type="submit" className="rounded-md bg-ink px-3 py-1 text-xs font-semibold text-paper">{t("addVariant")}</button>
      </div>
    </form>
    {error&&<p className="mt-2 text-xs text-alert">{error}</p>}
  </div>;
}
