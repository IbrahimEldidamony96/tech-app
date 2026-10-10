import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ data: [] });
  const data = await prisma.product.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      OR: [
        { nameEn: { contains: q, mode: "insensitive" } },
        { nameAr: { contains: q, mode: "insensitive" } },
        { brand: { name: { contains: q, mode: "insensitive" } } },
        { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
      ],
    },
    orderBy: [{ averageRating: "desc" }, { createdAt: "desc" }],
    take: 8,
    select: { id: true, slug: true, nameEn: true, nameAr: true, brand: { select: { name: true } }, images: { where: { isPrimary: true }, take: 1, select: { url: true } } },
  });
  return NextResponse.json({ data });
}
