import { requireAdminPagePermission } from "@/lib/require-admin-page-permission";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { InventoryAdjustForm } from "@/components/admin/inventory-adjust-form";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const guardedUser = await requireAdminPagePermission("inventory:read");

  const variants = await prisma.productVariant.findMany({
    include: { product: { select: { nameEn: true, nameAr: true } }, inventoryMovements: { orderBy: { createdAt: "desc" }, take: 3 } },
    orderBy: [{ stock: "asc" }, { updatedAt: "desc" }],
    take: 100,
  });

  return <main className="mx-auto max-w-6xl px-4 py-10">
    <h1 className="text-2xl font-bold text-ink">Inventory</h1>
    <p className="mt-1 text-sm text-steel">Live stock with the latest ledger entries. Manual changes are audited.</p>
    <div className="mt-6 space-y-4">
      {variants.map((v) => <section key={v.id} className="rounded-lg border border-steel/15 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="font-semibold text-ink">{v.product.nameEn}</p><p className="font-mono text-xs text-steel">{v.sku}</p></div>
          <div className={`font-mono text-lg font-semibold ${v.stock <= 5 ? "text-alert" : "text-ink"}`}>{v.stock} in stock</div>
        </div>
        {hasPermission(guardedUser.role, "inventory:write") ? <InventoryAdjustForm variantId={v.id} sku={v.sku} /> : null}
        {v.inventoryMovements.length ? <div className="mt-3 border-t border-steel/10 pt-2 text-xs text-steel">
          {v.inventoryMovements.map((m) => <div key={m.id} className="flex justify-between gap-3 py-1"><span>{m.type} · {m.note ?? m.referenceType ?? "—"}</span><span className="font-mono">{m.quantityDelta > 0 ? "+" : ""}{m.quantityDelta} → {m.stockAfter}</span></div>)}
        </div> : null}
      </section>)}
    </div>
  </main>;
}
