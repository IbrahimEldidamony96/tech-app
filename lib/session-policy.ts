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
