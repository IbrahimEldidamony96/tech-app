import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const carts = await prisma.cart.findMany({
    where: { updatedAt: { lte: cutoff }, abandonedReminderSentAt: null, items: { some: {} }, user: { deletedAt: null } },
    take: 100,
    include: { user: { select: { email: true, name: true } }, items: { include: { variant: { select: { product: { select: { nameEn: true } } } } } } },
  });
  let sent = 0;
  for (const cart of carts) {
    try {
      await sendEmail({ to: cart.user.email, subject: "You left items in your Tech Store cart", html: `<p>Hi ${cart.user.name},</p><p>You still have ${cart.items.length} item(s) waiting in your cart.</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/cart">Return to your cart</a></p>` });
      await prisma.cart.update({ where: { id: cart.id }, data: { abandonedReminderSentAt: new Date() } });
      sent++;
    } catch (error) {
      console.error(`Abandoned cart reminder failed for ${cart.id}`, error);
    }
  }
  return NextResponse.json({ checked: carts.length, sent });
}
