import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requirePermission("catalog:read");
  if (guard.error) return guard.error;
  const { id: productId } = await params;

  const variants = await prisma.productVariant.findMany({
    where: { productId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sku: true,
      price: true,
      stock: true,
      isActive: true,
      optionValues: { select: { optionValueId: true, optionValue: { select: { valueEn: true } } } },
    },
  });

  return NextResponse.json({ data: variants });
}

export { POST } from "@/app/api/products/[id]/variants/route";
