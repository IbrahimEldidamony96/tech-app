import assert from "node:assert/strict";
import test from "node:test";
import { hasAuthSessionCookie, mayLinkGoogleEmail } from "./google-link-policy";

test("Google linking requires a verified provider email and a matching verified local identity", () => {
  const profile = { email: "owner@example.invalid", email_verified: true };
  assert.equal(mayLinkGoogleEmail(profile, null), true);
  assert.equal(mayLinkGoogleEmail({ ...profile, email_verified: false }, null), false);
  assert.equal(mayLinkGoogleEmail({ ...profile, email_verified: "true" }, null), false);
  assert.equal(mayLinkGoogleEmail(profile, { email: profile.email, emailVerified: null }), false);
  assert.equal(mayLinkGoogleEmail(profile, { email: "attacker@example.invalid", emailVerified: new Date() }), false);
  assert.equal(mayLinkGoogleEmail(profile, { email: "OWNER@example.invalid", emailVerified: new Date() }), true);
});

test("revoked sessions cannot link OAuth through any cookie accepted by Auth.js", () => {
  const profile = { email: "owner@example.invalid", email_verified: true };
  for (const name of ["authjs.session-token", "__Secure-authjs.session-token", "authjs.session-token.0", "authjs.session-token.extra"]) {
    const hasSession = hasAuthSessionCookie([{ name, value: "revoked-jwt" }]);
    assert.equal(hasSession, true);
    assert.equal(mayLinkGoogleEmail(profile, null, hasSession), false);
  }
  assert.equal(hasAuthSessionCookie([{ name: "theme", value: "dark" }]), false);
  assert.equal(mayLinkGoogleEmail(profile, null, false), true);
});
