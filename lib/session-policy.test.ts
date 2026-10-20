import assert from "node:assert/strict";
import test from "node:test";
import { hasRecentGoogleAuthentication, sessionVersionMatches, RECENT_GOOGLE_AUTH_MS } from "./session-policy";

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
