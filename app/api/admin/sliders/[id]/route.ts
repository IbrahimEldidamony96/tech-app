import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { sliderImageUpdateSchema } from "@/lib/validations/slider-image";
import { Prisma } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("marketing:write");
  if (error) return error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = sliderImageUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { link, ...rest } = parsed.data;

  try {
    const slide = await prisma.sliderImage.update({
      where: { id },
      data: {
        ...rest,
        // "" from the form means "remove the link", same normalization as
        // on create — never leave an empty string sitting in the column.
        ...(link !== undefined ? { link: link || null } : {}),
      },
    });
    return NextResponse.json({ data: slide });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Slide not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("marketing:write");
  if (error) return error;

  const { id } = await params;

  try {
    await prisma.sliderImage.delete({ where: { id } });
    return NextResponse.json({ data: { id } });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Slide not found" }, { status: 404 });
    }
    throw err;
  }
}
