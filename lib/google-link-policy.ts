export function mayLinkGoogleEmail(
  profile: { email?: unknown; email_verified?: unknown } | undefined,
  local: { email: string; emailVerified: Date | null } | null,
  hasSessionCookie = false,
) {
  if (profile?.email_verified !== true || typeof profile.email !== "string" || !profile.email) return false;
  if (hasSessionCookie && !local) return false;
  return !local || (!!local.emailVerified && local.email.toLowerCase() === profile.email.toLowerCase());
}

export function hasAuthSessionCookie(values: readonly { name: string; value: string }[]) {
  // Match Auth.js SessionStore's prefix matching, including chunked cookies.
  return values.some(cookie => !!cookie.value && ["authjs.session-token", "__Secure-authjs.session-token"].some(prefix => cookie.name.startsWith(prefix)));
}
