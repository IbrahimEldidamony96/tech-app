# Auth.js JWT revocation and password safety

## Rollout order

1. Merge RBAC PR #3 first. The session implementation in this branch extends
   `fix/p1-fresh-admin-rbac` and increments the version on staff role updates.
2. Apply the new migration **before deploying the application code**:
   `npx prisma migrate deploy` adds `User.sessionVersion Int NOT NULL DEFAULT 0`.
   The app depends on this column for every authenticated session.
3. Deploy the Node-runtime Auth.js code and password endpoints together.
   **All sessions created before this release will be signed out**, because
   their JWTs do not have the `sessionVersion` claim. Announce a re-login
   requirement to customers and staff.
4. Run `npm run typecheck && npm run lint && npm run test:sessions` and verify
   login in staging with both Google and email/password. Run two concurrent
   password-change requests with the same old password to confirm exactly
   one succeeds (one CAS update; the other returns 409).
5. Re-test RBAC from PR #3: log in as a staff member, demote them using a
   SUPER_ADMIN session, then confirm every existing staff tab/API is denied
   without waiting for JWT expiry.

## Security model

- Auth.js keeps JWT cookies so the Edge proxy can cheaply prefilter admin
  navigation. The Edge check is NOT authoritative and intentionally makes
  no DB queries.
- `auth.ts` is used by Next.js server components, API routes, and Auth.js
  session handlers. Its **Node-only JWT callback queries the current User row
  on every auth() call**. It rejects deleted accounts and any JWT whose
  `sessionVersion` differs from the current database integer, and updates
  the role claim from the database.
- Password change uses a compare-and-set `updateMany` matching the old
  password hash and session version. Password hash and revocation are a
  single atomic database update.
- Password reset atomically consumes the single-use reset token, replaces
  the password hash and increments the session version in one transaction.
- Staff role edits increment the affected employee's version. Revocation
  cannot be undone by `useSession().update()` because the browser cannot
  rewrite server-verified JWT claims.
- Google-only accounts must **sign in again via Google within five minutes**
  to establish an initial password. The provider/time claims are created
  only on a real sign-in and never refreshed by profile updates.
- Sensitive cross-account order and invoice reads revalidate current
  permissions from Postgres, independent of the JWT role.

## Operational limitations

- This design adds one User lookup per validated Node session. Monitor
  PostgreSQL/Neon connection usage and request latency. Do not cache
  revocation checks across requests without a strict invalidation design.
- In-flight requests that passed auth before a revocation commit may still
  complete; transactions performing privilege-sensitive writes must retain
  their existing database-backed permission rechecks / row locks.
- A role demotion may leave the Edge proxy briefly believing the browser has
  a staff role, but the destination Node handler checks the live DB and
  rejects it. Removing /api/admin from Edge proxy (PR #4) remains necessary
  for JSON 401/403 instead of HTML redirects.
- Verify email-only and Google sign-ins, user deletion, password changes,
  password resets, and two-device revocation before deploying.
- Requires staging PostgreSQL/Prisma + Auth.js integration tests. GitHub
  Actions at baseline failed before runner provisioning; this draft has
  NOT been built or tested in CI.
