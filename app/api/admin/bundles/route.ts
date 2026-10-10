import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  nameEn: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(140).regex(/^[a-z0-9-]+$/),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.number().positive(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(100) })).min(2),
}).superRefine((value, ctx) => {
  if (value.discountType === "PERCENTAGE" && value.discountValue > 100) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Percentage cannot exceed 100" });
  if (value.startsAt && value.endsAt && new Date(value.startsAt) >= new Date(value.endsAt)) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End date must be after start date" });
  if (new Set(value.items.map((i) => i.productId)).size !== value.items.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Duplicate products are not allowed" });
});

export async function GET() {
  const guard = await requirePermission("marketing:read");
  if (guard.error) return guard.error;
  const bundles = await prisma.bundle.findMany({ include: { items: { include: { product: { select: { id: true, nameEn: true, nameAr: true, slug: true } } } } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ bundles });
}

export async function POST(request: Request) {
  const guard = await requirePermission("marketing:write");
  if (guard.error) return guard.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid bundle", issues: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const bundle = await prisma.$transaction(async (tx) => {
    const products = await tx.product.count({ where: { id: { in: data.items.map((i) => i.productId) }, deletedAt: null } });
    if (products !== data.items.length) throw new Error("INVALID_PRODUCTS");
    const created = await tx.bundle.create({
      data: {
        nameEn: data.nameEn, nameAr: data.nameAr, slug: data.slug,
        discountType: data.discountType, discountValue: data.discountValue,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        isActive: data.isActive,
        items: { create: data.items },
      },
      include: { items: true },
    });
    await writeAuditLog(tx, { actorId: guard.user!.id, action: "CREATE", entityType: "Bundle", entityId: created.id, summary: `Created bundle ${created.nameEn}` });
    return created;
  }).catch((error) => {
    if (error instanceof Error && error.message === "INVALID_PRODUCTS") return null;
    throw error;
  });
  if (!bundle) return NextResponse.json({ error: "One or more products are invalid" }, { status: 400 });
  return NextResponse.json({ bundle }, { status: 201 });
}
