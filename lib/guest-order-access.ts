import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GUEST_ACCESS_TTL_SECONDS = 15 * 60;
const COOKIE_VERSION = "g1";

/**
 * Per-order scoped cookie. The cookie itself is an authenticated, short-lived
 * proof; the old raw guest bearer token never goes into a cookie or URL.
 */
export function guestOrderCookieName(orderId: string): string {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(orderId)) throw new Error("Invalid order ID");
  return `guest-access-${orderId}`;
}

export function verifyGuestBearer(rawToken: unknown, storedHash: string): boolean {
  if (typeof rawToken !== "string" || rawToken.length < 20 ||
      rawToken.length > 256 || !/^[A-Za-z0-9_-]+$/.test(rawToken) ||
      !/^[a-fA-F0-9]{64}$/.test(storedHash)) return false;
  const presented = createHash("sha256").update(rawToken).digest();
  const expected = Buffer.from(storedHash, "hex");
  return timingSafeEqual(presented, expected);
}

function computeMac(secret: string, orderId: string, hash: string, prefix: string): Buffer {
  if (secret.length < 32) throw new Error("AUTH_SECRET is required for guest sessions");
  return createHmac("sha256", secret)
    .update(`guest-order-v1:${orderId}:${hash}:${prefix}`)
    .digest();
}

export function issueGuestAccessProof(
  orderId: string,
  storedHash: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  guestOrderCookieName(orderId);
  const expires = nowSeconds + GUEST_ACCESS_TTL_SECONDS;
  const nonce = randomBytes(16).toString("base64url");
  const prefix = `${COOKIE_VERSION}.${expires}.${nonce}`;
  return `${prefix}.${computeMac(secret, orderId, storedHash, prefix).toString("base64url")}`;
}

export function verifyGuestAccessProof(
  proof: unknown,
  orderId: string,
  storedHash: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (typeof proof !== "string" || proof.length > 256 ||
      !/^[A-Za-z0-9_-]{10,128}$/.test(orderId)) return false;
  const match = /^g1\.([0-9]{10,11})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(proof);
  if (!match) return false;
  const expires = Number(match[1]);
  if (!Number.isSafeInteger(expires) || expires <= nowSeconds ||
      expires > nowSeconds + GUEST_ACCESS_TTL_SECONDS) return false;
  const prefix = `${COOKIE_VERSION}.${match[1]}.${match[2]}`;
  try {
    const expected = computeMac(secret, orderId, storedHash, prefix);
    const supplied = Buffer.from(match[3], "base64url");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}
