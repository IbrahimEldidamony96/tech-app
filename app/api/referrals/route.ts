import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

export async function GET() {
  const { session, error } = await requireUser(); if (error) return error;
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { referralCode: true, referrals: { select: { id: true, name: true, createdAt: true, orders: { where: { status: "DELIVERED" }, take: 1, select: { id: true } } } } },
  });
  return NextResponse.json({ referralCode: user?.referralCode, referrals: user?.referrals ?? [] });
}
