import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean).slice(0, 4) ?? [];
  if (!ids.length) return NextResponse.json({ data: [] });
  const data = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true, deletedAt: null },
    select: {
      id: true, slug: true, nameEn: true, nameAr: true, averageRating: true, reviewCount: true,
      brand: { select: { name: true } }, category: { select: { nameEn: true, nameAr: true } },
      images: { where: { isPrimary: true }, take: 1, select: { url: true, alt: true } },
      specifications: { orderBy: { sortOrder: "asc" }, select: { keyEn: true, keyAr: true, valueEn: true, valueAr: true } },
      variants: { where: { isActive: true }, orderBy: { price: "asc" }, take: 1, select: { price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true, stock: true } },
    },
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  data.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  return NextResponse.json({ data });
}
