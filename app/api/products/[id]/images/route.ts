import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { productImageCreateSchema } from "@/lib/validations/product-image";
import { Prisma } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

  const images = await prisma.productImage.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ data: images });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("catalog:write");
  if (error) return error;

  const { id: productId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = productImageCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const image = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.productImage.count({
        where: { productId },
      });
      const maxSortOrder = await tx.productImage.aggregate({
        where: { productId },
        _max: { sortOrder: true },
      });

      // Product cards, cart rows, and wishlist rows all query
      // `where: { isPrimary: true }, take: 1` — there's no fallback to
      // "just use the first image" if none is marked primary. So a
      // product's very first image MUST become primary immediately, or it
      // silently shows no image everywhere except its own detail page.
      return tx.productImage.create({
        data: {
          productId,
          url: parsed.data.url,
          alt: parsed.data.alt,
          isPrimary: existingCount === 0,
          sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
        },
      });
    });

    return NextResponse.json({ data: image }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    throw err;
  }
}
