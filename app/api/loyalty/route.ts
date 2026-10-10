import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

export async function GET() {
  const { session, error } = await requireUser(); if (error) return error;
  const [user, transactions] = await Promise.all([
    prisma.user.findUnique({ where: { id: session!.user.id }, select: { loyaltyPoints: true } }),
    prisma.loyaltyTransaction.findMany({ where: { userId: session!.user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return NextResponse.json({ points: user?.loyaltyPoints ?? 0, transactions });
}
