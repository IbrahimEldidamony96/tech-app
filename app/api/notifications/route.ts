import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

export async function GET() {
  const { session, error } = await requireUser(); if (error) return error;
  const data = await prisma.notification.findMany({ where: { userId: session!.user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ data, unread: data.filter((n) => !n.readAt).length });
}

export async function PATCH(request: Request) {
  const { session, error } = await requireUser(); if (error) return error;
  const parsed = z.object({ id: z.string().min(1).optional(), all: z.boolean().optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.id && !parsed.data.all)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await prisma.notification.updateMany({ where: { userId: session!.user.id, ...(parsed.data.id ? { id: parsed.data.id } : {}), readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
}
