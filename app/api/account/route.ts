import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { updateProfileSchema } from "@/lib/validations/profile";

// بيانات اليوزر الحالي — الفورم بيحتاجها عشان يعرف يعرض حقل "current
// password" من عدمه (يوزر داخل بجوجل ومالوش باسورد أصلاً هيشوف فورم مختلف)
export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { id: true, name: true, email: true, image: true, password: true },
  });

  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      hasPassword: !!user.password,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const { session, error } = await requireUser();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session!.user.id },
    data: parsed.data,
    select: { id: true, name: true, image: true },
  });

  return NextResponse.json({ data: user });
}
