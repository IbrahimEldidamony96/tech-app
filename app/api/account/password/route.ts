import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { changePasswordSchema } from "@/lib/validations/profile";

export async function PATCH(request: NextRequest) {
  const { session, error } = await requireUser();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { password: true },
  });

  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  // يوزر عنده باسورد بالفعل (سواء اتسجل بالكريدنشيالز أو حط واحد قبل
  // كده) لازم يثبت إنه هو صاحب الحساب فعلًا بالباسورد الحالي. يوزر
  // داخل بجوجل بس (password === null) بيحط أول باسورد له من غير شرط ده.
  if (user.password) {
    if (!parsed.data.currentPassword) {
      return NextResponse.json(
        { error: "Current password is required" },
        { status: 400 },
      );
    }
    const matches = await bcrypt.compare(
      parsed.data.currentPassword,
      user.password,
    );
    if (!matches) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 },
      );
    }
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: session!.user.id },
    data: { password: newHash },
  });

  return NextResponse.json({ data: { success: true } });
}
