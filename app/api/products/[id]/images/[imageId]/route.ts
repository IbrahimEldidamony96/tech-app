import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { productImageUpdateSchema } from "@/lib/validations/product-image";
import { Prisma } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ id: string; imageId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("catalog:write");
  if (error) return error;

  const { id: productId, imageId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = productImageUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.productImage.findUnique({
    where: { id: imageId },
  });
  if (!existing || existing.productId !== productId) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  try {
    const image = await prisma.$transaction(async (tx) => {
      // Only one image per product may be primary. Flipping this one on
      // means flipping every other image for the same product off first —
      // otherwise the card/cart/wishlist queries (a plain `take: 1` on
      // isPrimary) could return whichever row Postgres happens to return
      // first.
      if (parsed.data.isPrimary === true) {
        await tx.productImage.updateMany({
          where: { productId, NOT: { id: imageId } },
          data: { isPrimary: false },
        });
      }

      return tx.productImage.update({
        where: { id: imageId },
        data: parsed.data,
      });
    });

    return NextResponse.json({ data: image });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("catalog:write");
  if (error) return error;

  const { id: productId, imageId } = await params;

  const image = await prisma.productImage.findUnique({
    where: { id: imageId },
  });
  if (!image || image.productId !== productId) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });

    // Deleting the primary image would otherwise leave the product with
    // zero primary images — invisible on every card/cart/wishlist view even
    // though other images still exist. Promote whichever image is now
    // first in sort order, if any are left.
    if (image.isPrimary) {
      const next = await tx.productImage.findFirst({
        where: { productId },
        orderBy: { sortOrder: "asc" },
      });
      if (next) {
        await tx.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
  });

  return NextResponse.json({ data: { id: imageId } });
}
