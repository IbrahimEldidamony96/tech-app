import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { optionUpdateSchema } from "@/lib/validations/option";
import { Prisma } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ id: string; optionId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("catalog:write");
  if (error) return error;

  const { id: productId, optionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = optionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.productOption.findFirst({
    where: { id: optionId, productId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Option not found" }, { status: 404 });
  }

  try {
    const option = await prisma.productOption.update({
      where: { id: optionId },
      data: parsed.data,
      select: { id: true, nameEn: true, nameAr: true },
    });
    return NextResponse.json({ data: option });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json(
          { error: "Option not found" },
          { status: 404 },
        );
      }
      if (err.code === "P2002") {
        return NextResponse.json(
          { error: "An option with this name already exists" },
          { status: 409 },
        );
      }
    }
    throw err;
  }
}
