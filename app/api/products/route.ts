import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productListQuerySchema, productCreateSchema } from "@/lib/validations/product";
import { getProductList } from "@/lib/queries/products";
import { requirePermission } from "@/lib/require-permission";
import { Prisma } from "@/app/generated/prisma/client";

export async function GET(request: NextRequest) {
  const rawParams = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = productListQuerySchema.safeParse(rawParams);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { page, limit, category, brand, minPrice, maxPrice, minRating, inStock, search, specification, specificationValue, sort } = parsed.data;
  const result = await getProductList({ page, limit, category, brand, minPrice, maxPrice, minRating, inStock: inStock === undefined ? undefined : inStock === "true", search, specification, specificationValue, sort });

  return NextResponse.json({
    data: result.items,
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission("catalog:write");
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = productCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const product = await prisma.product.create({
      data: parsed.data,
      select: { id: true, nameEn: true, nameAr: true, slug: true },
    });
    return NextResponse.json({ data: product }, { status: 201 });
  } catch (err) {
    // P2002 = unique constraint violation (الـ slug مكرر غالبًا)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    throw err;
  }
}
