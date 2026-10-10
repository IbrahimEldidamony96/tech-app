import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { optionCreateSchema } from "@/lib/validations/option";
import { Prisma } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

  const options = await prisma.productOption.findMany({
    where: { productId },
    select: {
      id: true,
      nameEn: true,
      nameAr: true,
      values: { select: { id: true, valueEn: true, valueAr: true } },
    },
  });

  return NextResponse.json({ data: options });
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

  const parsed = optionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const option = await prisma.productOption.create({
      data: { productId, ...parsed.data },
      select: { id: true, nameEn: true, nameAr: true },
    });
    return NextResponse.json({ data: option }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json(
          { error: "This option already exists for this product" },
          { status: 409 },
        );
      }
      if (err.code === "P2003") {
        return NextResponse.json(
          { error: "Product not found" },
          { status: 404 },
        );
      }
    }
    throw err;
  }
}
