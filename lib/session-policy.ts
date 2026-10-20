/**
 * JWTs are only signed identity assertions. Revocation is enforced by
 * a fresh database read on EVERY Node-runtime auth() evaluation.
 * The version is never sourced from session.update() client data.
 */
export function sessionVersionMatches(
  claimed: unknown,
  current: number,
): boolean {
  return typeof claimed === "number" &&
    Number.isSafeInteger(claimed) && claimed >= 0 && claimed === current;
}

export function mayUseSession(
  row: { deletedAt: Date | null; sessionVersion: number } | null,
  versionClaim: unknown,
  isNewSignIn: boolean,
): boolean {
  return row !== null &&
    row.deletedAt === null &&
    (isNewSignIn || sessionVersionMatches(versionClaim, row.sessionVersion));
}

export const RECENT_GOOGLE_AUTH_MS = 5 * 60 * 1000;

/** A long-lived Google session is NOT a recent reauthentication. */
export function hasRecentGoogleAuthentication(
  provider: unknown,
  authenticatedAt: unknown,
  now = Date.now(),
): boolean {
  return provider === "google" &&
    typeof authenticatedAt === "number" &&
    Number.isFinite(authenticatedAt) &&
    authenticatedAt <= now &&
    now - authenticatedAt <= RECENT_GOOGLE_AUTH_MS;
}


/**
 * Auth.js treats custom JWT properties as untrusted values until narrowed.
 * Never cast browser-facing Session fields from arbitrary token payloads.
 * Keep this helper pure: auth.config.ts is imported by the Edge proxy.
 */
export function sanitizeSessionAuthClaims(
  authenticatedAt: unknown,
  authProvider: unknown,
): { authenticatedAt: number | undefined; authProvider: string | null } {
  return {
    authenticatedAt:
      typeof authenticatedAt === "number" &&
      Number.isSafeInteger(authenticatedAt) &&
      authenticatedAt > 0
        ? authenticatedAt
        : undefined,
    authProvider: typeof authProvider === "string" && authProvider.length > 0
      ? authProvider
      : null,
  };
}
