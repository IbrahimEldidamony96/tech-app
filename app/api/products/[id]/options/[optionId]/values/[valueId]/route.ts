import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { optionValueUpdateSchema } from "@/lib/validations/option";
import { Prisma } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ id: string; optionId: string; valueId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("catalog:write");
  if (error) return error;

  const { id: productId, optionId, valueId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = optionValueUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.productOptionValue.findFirst({
    where: {
      id: valueId,
      optionId,
      option: { productId },
    },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Value not found" }, { status: 404 });
  }

  try {
    const value = await prisma.productOptionValue.update({
      where: { id: valueId },
      data: parsed.data,
      select: { id: true, valueEn: true, valueAr: true },
    });
    return NextResponse.json({ data: value });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Value not found" }, { status: 404 });
      }
      if (err.code === "P2002") {
        return NextResponse.json(
          { error: "This value already exists for this option" },
          { status: 409 },
        );
      }
    }
    throw err;
  }
}
