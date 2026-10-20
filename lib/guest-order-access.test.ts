import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  GUEST_ACCESS_TTL_SECONDS, guestOrderCookieName,
  issueGuestAccessProof, verifyGuestAccessProof, verifyGuestBearer,
} from "./guest-order-access";

const orderId = "clx000guestorder1234";
const raw = "k".repeat(42);
const hash = createHash("sha256").update(raw).digest("hex");
const secret = "test-secret-that-is-longer-than-32-bytes-and-random";
const t = 1792483200;

test("compares original guest token against one-way DB hash", () => {
  assert.equal(verifyGuestBearer(raw, hash), true);
  assert.equal(verifyGuestBearer("wrong", hash), false);
  assert.equal(verifyGuestBearer("", hash), false);
  assert.equal(verifyGuestBearer(raw, "x"), false);
});

test("existing base64 and hex access tokens still verify", () => {
  const encoded = "a".repeat(40) + "+/==";
  const stored = createHash("sha256").update(encoded).digest("hex");
  assert.equal(verifyGuestBearer(encoded, stored), true);
  assert.equal(verifyGuestBearer(encoded + "x", stored), false);
});

test("cookie authenticates only one order, one credential hash, one expiry", () => {
  const proof = issueGuestAccessProof(orderId, hash, secret, t);
  assert.equal(verifyGuestAccessProof(proof, orderId, hash, secret, t), true);
  assert.equal(verifyGuestAccessProof(proof, orderId, hash, secret, t + GUEST_ACCESS_TTL_SECONDS), false);
  assert.equal(verifyGuestAccessProof(proof, "clx000anotherorder12", hash, secret, t), false);
  assert.equal(verifyGuestAccessProof(proof, orderId, "0".repeat(64), secret, t), false);
  assert.equal(verifyGuestAccessProof(proof, orderId, hash, secret + "x", t), false);
  assert.equal(verifyGuestAccessProof(proof + "x", orderId, hash, secret, t), false);
});

test("proofs cannot be extended by altering the timestamp or nonce", () => {
  const proof = issueGuestAccessProof(orderId, hash, secret, t);
  const segments = proof.split(".");
  segments[1] = String(Number(segments[1]) + 1000);
  assert.equal(verifyGuestAccessProof(segments.join("."), orderId, hash, secret, t), false);
});

test("cookie name accepts only safe order IDs", () => {
  assert.equal(guestOrderCookieName(orderId), "guest-access-" + orderId);
  assert.throws(() => guestOrderCookieName("../api"));
});
