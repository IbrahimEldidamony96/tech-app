import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deliverEmail } from "@/lib/email-delivery";
import { getAppOrigin } from "@/lib/app-url";
import { escapeHtml } from "@/lib/html";
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const candidates = await prisma.$queryRaw<{ id: string }[]>`SELECT c.id FROM "Cart" c JOIN "User" u ON u.id = c."userId" LEFT JOIN "EmailDelivery" e ON e.key = 'cart/' || c.id || '/' || to_char(c."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE c."updatedAt" <= ${new Date(Date.now() - 86400000)} AND c."abandonedReminderSentAt" IS NULL AND u."deletedAt" IS NULL AND (e.status IS NULL OR e.status <> 'NEEDS_REVIEW') AND EXISTS (SELECT 1 FROM "CartItem" ci WHERE ci."cartId" = c.id) ORDER BY c."updatedAt" ASC LIMIT 100`;
  const carts = await prisma.cart.findMany({ where: { id: { in: candidates.map(row => row.id) }, updatedAt: { lte: new Date(Date.now() - 86400000) }, abandonedReminderSentAt: null,
    items: { some: {} }, user: { deletedAt: null } }, take: 100,
    include: { user: { select: { email: true, name: true } }, _count: { select: { items: true } } } });
  let sent = 0, failed = 0, needsReview = 0;
  for (const cart of carts) {
    try {
      const status = await deliverEmail(`cart/${cart.id}/${cart.updatedAt.toISOString()}`, {
        to: cart.user.email, subject: "You left items in your Tech Store cart",
        html: `<p>Hi ${escapeHtml(cart.user.name)},</p><p>You still have ${cart._count.items} item(s) waiting in your cart.</p><p><a href="${escapeHtml(getAppOrigin(request))}/cart">Return to your cart</a></p>`,
      }, tx => tx.cart.updateMany({ where: { id: cart.id, updatedAt: cart.updatedAt, abandonedReminderSentAt: null }, data: { abandonedReminderSentAt: new Date() } }));
      if (status === "sent") sent++;
      if (status === "review") needsReview++;
    } catch { failed++; }
  }
  return NextResponse.json({ checked: carts.length, sent, failed, needsReview, emailEnabled: !!process.env.RESEND_API_KEY });
}
