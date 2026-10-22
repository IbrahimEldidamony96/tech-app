import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

test("Auth.js refuses to merge a signed-out Google owner with a precreated password account", async () => {
  const { handleLoginOrRegister } = await import(pathToFileURL(resolve("node_modules/@auth/core/lib/actions/callback/handle-login.js")).href);
  const { default: Google } = await import("next-auth/providers/google");
  const provider = Google({ allowDangerousEmailAccountLinking: false });
  const pending = { id: "precreated", email: "owner@example.invalid", emailVerified: null, password: "attacker-password", sessionVersion: 0 };
  let linked = false, updated = false;
  await assert.rejects(() => handleLoginOrRegister(null, { email: pending.email }, { provider: "google", providerAccountId: "verified-owner", type: "oidc" }, {
    adapter: { getUserByAccount: async () => null, getUserByEmail: async () => pending, linkAccount: async () => { linked = true; }, updateUser: async () => { updated = true; } },
    jwt: {}, events: {}, session: { strategy: "jwt" }, provider: { ...provider.options, account: () => ({}) },
  }), error => error.name === "OAuthAccountNotLinked");
  assert.equal(linked, false);
  assert.equal(updated, false);
  assert.equal(pending.emailVerified, null);
});
