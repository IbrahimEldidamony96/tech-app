import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  GUEST_ACCESS_TTL_SECONDS, guestOrderCookieName,
  issueGuestAccessProof, verifyGuestAccessProof, verifyGuestBearer,
} from "@/lib/guest-order-access";

type Context = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const notFound = () => NextResponse.json({ error: "Order not found" }, { status: 404, headers: noStore });

/**
 * Existing guest orders remain readable, but raw bearer tokens are NEVER
 * accepted by GET URLs. A POST exchanges the existing token in its JSON
 * body for an HttpOnly, SameSite=Strict, 15-minute, per-order cookie.
 */
export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  let cookieName: string;
  try { cookieName = guestOrderCookieName(id); }
  catch { return notFound(); }

  if (request.nextUrl.searchParams.has("token")) return notFound();
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403, headers: noStore });
  }
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > 512) return NextResponse.json({ error: "Request too large" }, { status: 413, headers: noStore });

  const ip = getClientIp(request);
  const [ipLimit, orderLimit] = await Promise.all([
    rateLimit(`guest-order:ip:${ip}`, 20, 15 * 60 * 1000),
    rateLimit(`guest-order:order:${id}`, 10, 15 * 60 * 1000),
  ]);
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit);
  if (!orderLimit.allowed) return rateLimitResponse(orderLimit);

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !("token" in body)) return notFound();
  const token = (body as { token: unknown }).token;

  const order = await prisma.order.findUnique({
    where: { id }, select: { userId: true, guestAccessTokenHash: true },
  });
  if (!order || order.userId !== null || !order.guestAccessTokenHash ||
      !verifyGuestBearer(token, order.guestAccessTokenHash)) return notFound();

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    console.error("Guest order access requires AUTH_SECRET");
    return NextResponse.json({ error: "Access temporarily unavailable" }, { status: 503, headers: noStore });
  }
  const proof = issueGuestAccessProof(id, order.guestAccessTokenHash, secret);
  const response = new NextResponse(null, { status: 204, headers: noStore });
  response.cookies.set(cookieName, proof, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || request.nextUrl.protocol === "https:",
    sameSite: "strict",
    path: `/api/guest-orders/${id}`,
    maxAge: GUEST_ACCESS_TTL_SECONDS,
  });
  return response;
}

export async function GET(request: NextRequest, { params }: Context) {
  const { id } = await params;
  let cookieName: string;
  try { cookieName = guestOrderCookieName(id); }
  catch { return notFound(); }

  // Never accept a URL bearer even for legacy clients. Links from old
  // clients are migrated by the guest page to a short-lived cookie via POST.
  if (request.nextUrl.searchParams.has("token")) return notFound();

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "Access temporarily unavailable" }, { status: 503, headers: noStore });
  }
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      userId: true,
      guestAccessTokenHash: true,
      id: true, status: true, paymentStatus: true, total: true, createdAt: true,
      items: { select: { id: true, productName: true, quantity: true, totalPrice: true } },
      events: { select: { id: true, title: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!order || order.userId !== null || !order.guestAccessTokenHash ||
      !verifyGuestAccessProof(
        request.cookies.get(cookieName)?.value,
        id, order.guestAccessTokenHash, secret,
      )) return notFound();

  // Explicitly omit guestAccessTokenHash, userId, shipping PII, payment
  // provider IDs, coupons and staff-only event descriptions.
  return NextResponse.json({
    data: {
      id: order.id, status: order.status, paymentStatus: order.paymentStatus,
      total: order.total, createdAt: order.createdAt,
      items: order.items, events: order.events,
    },
  }, { headers: noStore });
}
