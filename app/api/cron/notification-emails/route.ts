import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deliverEmail } from "@/lib/email-delivery";
import { getAppOrigin } from "@/lib/app-url";
import { escapeHtml } from "@/lib/html";
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const candidates = await prisma.$queryRaw<{ id: string }[]>`SELECT n.id FROM "Notification" n JOIN "User" u ON u.id = n."userId" LEFT JOIN "EmailDelivery" e ON e.key = 'notification/' || n.id WHERE n."emailSentAt" IS NULL AND u."deletedAt" IS NULL AND (e.status IS NULL OR e.status <> 'NEEDS_REVIEW') ORDER BY n."createdAt" ASC LIMIT 100`;
  const rows = await prisma.notification.findMany({ where: { id: { in: candidates.map(row => row.id) }, emailSentAt: null, user: { deletedAt: null } },
    include: { user: { select: { email: true, name: true } } }, orderBy: { createdAt: "asc" }, take: 100 });
  let sent = 0, failed = 0, needsReview = 0;
  const origin = getAppOrigin(request);
  for (const n of rows) {
    try {
      const link = n.link ? `${origin}${n.link.startsWith("/") ? n.link : "/" + n.link}` : origin;
      const status = await deliverEmail("notification/" + n.id, {
        to: n.user.email, subject: `Tech Store — ${n.title}`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><p>Hello ${escapeHtml(n.user.name)},</p><h2>${escapeHtml(n.title)}</h2><p>${escapeHtml(n.message)}</p><p><a href="${escapeHtml(link)}">Open Tech Store</a></p></div>`,
      }, tx => tx.notification.updateMany({ where: { id: n.id, emailSentAt: null }, data: { emailSentAt: new Date() } }));
      if (status === "sent") sent++;
      if (status === "review") needsReview++;
    } catch { failed++; }
  }
  return NextResponse.json({ processed: rows.length, sent, failed, needsReview, emailEnabled: !!process.env.RESEND_API_KEY });
}
