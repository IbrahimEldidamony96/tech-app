# Integration readiness — combined PRs #1–#12

## Scope
This branch combines the draft fixes in PRs **#1 to #12**. It is based on
main at commit `94ad3a9376002ecdc06bba3d3f91378e75eb882a`.
**It is not a verified production release. Do not merge or promote to prod.**

## Resolved cross-PR conflicts
- `prisma/schema.prisma`: preserved both the refund ledger + partial payment
  status from PR #7 and User.sessionVersion from PR #8.
- `app/admin/page.tsx`: kept PR #11 payment-time financial metrics while
  restoring PR #3's database-backed `requireAdminPagePermission` guard.
- `app/admin/returns/page.tsx`: kept PR #7's refund actions while restoring
  the same DB-backed `returns:read` page guard.
- `lib/order-cancellation.ts`: used PR #10 Order-first row locking and
  transaction-state rechecks, with explicit exclusion of all captured or
  (partially) refunded payment statuses from cancellation.
- `package.json`: retained every independent test command. Lockfile was
  unchanged across PRs (script-only edits).
- Stacked PRs were applied as changes relative to their respective bases:
  PR #7 on #2, PR #8 on #3, PR #11 on #7.

## Required quality gate
Run from the **integration branch**, with Node 22 and a disposable staging
PostgreSQL/Neon database:

```sh
npm ci
npx prisma validate
npm run typecheck
npm run lint
find lib prisma -type f -name '*.test.ts' -print0 | xargs -0 npx tsx --test
npm run build
```

Do not put real production payment credentials in the CI environment.
No tests above have yet run on this assembled tree. GitHub Actions jobs
previously failed before assigning any runner (`runner_id = 0`,
`steps = []`).

## Migration staging order
Use a staging database snapshot (with sensitive fields sanitized if
necessary). The new migrations have timestamps:

1. `prisma/migrations/20261020120000_refund_ledger/migration.sql`
2. `prisma/migrations/20261020170000_user_session_version/migration.sql`

On staging only:
```sh
npx prisma migrate deploy
npx prisma migrate status
```
Verify migration rollback strategy, newly required enum values, ledger
constraints and Prisma generated client. Deploy migrations **before** app
runtime code. Old signed JWTs must sign in again after sessionVersion
deployment, by design.

## Integration test matrix
| Area | High-risk cases |
| --- | --- |
| Checkout | Mixed bundle/expensive unrelated products, parallel checkout |
| Returns | Concurrent requests exceeding purchased quantity, double restock |
| Refunds | Paid vs COD, external Paymob inquiry, partial settlements, retries, loyalty compensation |
| Auth | JWT revocation on role demotion/password change, Google step-up |
| Payments | Paymob success racing expiry, late capture on cancelled order, manual fail/paid |
| Upload | Forged folder, public ID, unsupported format, rate limit, quotas |
| Guest | Old token URL, exchange to HttpOnly cookie, cross-order token replay |
| Reporting | PaidAt vs createdAt, confirmed refunds, negative net days, Cairo DST |
| Operations | Vercel daily fallback / GitHub scheduled 15-minute invocation |

For money flows, inspect both transaction rows AND inventory/loyalty
side-effects. Verify repeatedly with concurrent requests. Paymob refunds
require actual provider confirmation; never pretend an internal status
change moves customer funds.

## Platform access blocker
The connected Vercel deployment listing for project `tech-app` under
`ibrahim-eldidamonys-projects` returned **403 forbidden**. Build/preview
status could not be inspected through the current connection. Re-authorize
the right Vercel scope before attempting preview/staging validation.
The provider was not asked to deploy or promote to production.

## Merge and release
- Keep all source PRs and this integration PR in DRAFT until tests pass.
- Review the consolidated diff instead of independently merging conflicting
  feature branches onto main in arbitrary order.
- Manually review the full schema, refund ledger, payments and SQL lock-order.
- Before release, confirm financial history/backfills and provider secrets
  (Paymob staging, Bosta staging, Cloudinary sandbox).
- Production release should be separately authorized after staging signoff.
