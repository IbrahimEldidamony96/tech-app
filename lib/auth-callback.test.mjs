import assert from "node:assert/strict";
import { after, test } from "node:test";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const original = Module._load;
let options, currentSession = null, cookieValues = [], local = null, clearOnRead = false;
const nextAuth = config => { options = config; return { auth: async () => { if (clearOnRead) cookieValues = []; return currentSession; }, handlers: {}, signIn() {}, signOut() {} }; };
const stubs = new Map([
  ["next-auth", { __esModule: true, default: nextAuth, CredentialsSignin: class extends Error {} }],
  ["next-auth/providers/google", { __esModule: true, default: config => ({ id: "google", ...config }) }],
  ["next-auth/providers/credentials", { __esModule: true, default: config => ({ id: "credentials", ...config }) }],
  ["@auth/prisma-adapter", { PrismaAdapter: () => ({}) }],
  ["@/lib/prisma", { prisma: { user: { findUnique: async () => local } } }],
  ["next/headers", { cookies: async () => ({ getAll: () => cookieValues }) }],
  ["@/lib/rate-limit", { rateLimit: async () => ({ allowed: true }), getClientIp: () => "fixture" }],
]);
Module._load = function(id, ...rest) { return stubs.has(id) ? stubs.get(id) : original.call(this, id, ...rest); };
require("../auth.ts");
after(() => { Module._load = original; });

test("the configured Google callback rejects a revoked raw cookie before Auth.js can link it", async () => {
  currentSession = null;
  clearOnRead = true;
  cookieValues = [{ name: "authjs.session-token.0", value: "revoked-jwt" }];
  const request = { account: { provider: "google" }, profile: { email: "attacker@example.invalid", email_verified: true } };
  assert.equal(await options.callbacks.signIn(request), false);
  clearOnRead = false;
  cookieValues = [];
  assert.equal(await options.callbacks.signIn(request), true);
  assert.equal(options.providers[0].allowDangerousEmailAccountLinking, false);
});

test("the configured Google callback permits only a verified session with the same mailbox", async () => {
  currentSession = { user: { id: "owner" } };
  cookieValues = [{ name: "__Secure-authjs.session-token", value: "valid-jwt" }];
  const request = { account: { provider: "google" }, profile: { email: "owner@example.invalid", email_verified: true } };
  local = { email: "owner@example.invalid", emailVerified: null };
  assert.equal(await options.callbacks.signIn(request), false);
  local = { email: "different@example.invalid", emailVerified: new Date() };
  assert.equal(await options.callbacks.signIn(request), false);
  local = { email: "owner@example.invalid", emailVerified: new Date() };
  assert.equal(await options.callbacks.signIn(request), true);
});
