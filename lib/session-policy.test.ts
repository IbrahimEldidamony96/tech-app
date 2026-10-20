import assert from "node:assert/strict";
import test from "node:test";
import { hasRecentGoogleAuthentication, mayUseSession, sanitizeSessionAuthClaims, sessionVersionMatches, RECENT_GOOGLE_AUTH_MS } from "./session-policy";

test("previous-generation JWT is rejected following staff role change/reset", () => {
  assert.equal(sessionVersionMatches(3, 4), false);
  assert.equal(sessionVersionMatches(4, 4), true);
  assert.equal(sessionVersionMatches(5, 4), false);
});
test("legacy JWT without claim is denied instead of trusted", () => {
  assert.equal(sessionVersionMatches(undefined, 0), false);
  assert.equal(sessionVersionMatches("0", 0), false);
  assert.equal(sessionVersionMatches(-1, 0), false);
});
test("only a recent Google login satisfies first-password step-up", () => {
  const now = 1750000000000;
  assert.equal(hasRecentGoogleAuthentication("google", now - 1000, now), true);
  assert.equal(hasRecentGoogleAuthentication("google", now - RECENT_GOOGLE_AUTH_MS - 1, now), false);
  assert.equal(hasRecentGoogleAuthentication("credentials", now, now), false);
  assert.equal(hasRecentGoogleAuthentication("google", now + 100, now), false);
  assert.equal(hasRecentGoogleAuthentication("google", undefined, now), false);
});

test("deleted users lose sessions even for a matching version", () => {
  assert.equal(mayUseSession({ deletedAt: new Date(), sessionVersion: 0 }, 0, false), false);
  assert.equal(mayUseSession(null, 0, false), false);
});
test("role/password version bump immediately invalidates the old token", () => {
  const row = { deletedAt: null, sessionVersion: 8 };
  assert.equal(mayUseSession(row, 7, false), false);
  assert.equal(mayUseSession(row, 8, false), true);
  assert.equal(mayUseSession(row, undefined, true), true);
});

test("session callback exposes only correctly typed authenticated metadata", () => {
  assert.deepEqual(
    sanitizeSessionAuthClaims(1792520000000, "google"),
    { authenticatedAt: 1792520000000, authProvider: "google" },
  );
  assert.deepEqual(
    sanitizeSessionAuthClaims(undefined, null),
    { authenticatedAt: undefined, authProvider: null },
  );
  for (const invalid of ["1792520000000", null, {}, NaN, Infinity, -1, 1.5]) {
    assert.equal(sanitizeSessionAuthClaims(invalid, "credentials").authenticatedAt, undefined);
  }
  for (const invalid of [{}, [], true, 123, ""]) {
    assert.equal(sanitizeSessionAuthClaims(Date.now(), invalid).authProvider, null);
  }
});
