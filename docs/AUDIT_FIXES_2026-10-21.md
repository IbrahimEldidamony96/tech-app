# Audit fixes — 21 October 2026

This follows the findings in [the original audit](PROJECT_AUDIT_2026-10-20.md).
Changes remain local and uncommitted.

| Finding | Resolution |
| --- | --- |
| R01: schema behind application | Added direct migration configuration; tested the four pending/new migrations on an isolated Neon child branch, then applied them to the configured application database. All eleven migrations are up to date. |
| R02: unsigned Paymob merchant reference | Callback HMAC is followed by authenticated transaction inquiry, provider-order binding, exact amount/currency/integration checks, and an order lock. Late captures retain cancellation and expose refund reconciliation. |
| R03: stale absolute stock edits | Unchanged stock fields skip submission; changes require `expectedStock` and compare against locked current stock. Inventory movements use that current state. |
| R04: skipped delivery callbacks | Authoritative delivery reconciles confirmed/processing orders and pending COD. Duplicate/stale events preserve forward state and reward idempotency. |
| R05: cancellation/confirmation race | COD confirmation now reads, validates, and writes under the same Order lock as cancellation. |
| R06: coupon scope overwrite | Eligible merchandise must satisfy both category and brand restrictions. |
| R07: premature carrier restocking | Dispatched cancellation is rejected. Predispatch carrier cancellation must succeed before local cancellation/restocking, with state rechecked under lock. |
| R08: returned-shipment refund gap | Cancelled captured orders support a full remaining order-level refund with manual or provider settlement verification. |
| R09: all-points returns | Receiving merchandise compensates loyalty using returned quantities, independent of positive cash refunds. Zero-cash returns complete with no invented money movement. The receive transaction allows 15 seconds for the full stock/loyalty/audit operation. |
| R10: inconsistent sale prices | Catalog SQL sorts/filters/selects variants by active effective prices. Wishlist and compare use the same selection policy. |
| R11: stuck mistaken refund intent | Administrators may cancel an unexecuted intent with reason and no-transfer attestation. Paymob cumulative totals must remain unchanged. Cancelled ledger rows remain; partial unique indexes permit replacements. |
| R12: concurrent initial cart/wishlist | Atomic inserts skip existing rows and preserve activity timestamps without a duplicate-error retry. All cart mutations also take checkout's Cart lock to prevent lost additions and checkout/edit races. |
| R13: restock alerts | Both inventory adjustment and variant edit trigger transactional, conditional notification claims. |
| R14: standalone auth host trust | Local host trust configured and documented; production HTTP suite checks the session endpoint and authenticated routes. |
| R15: local provider configuration | Readiness script prints booleans only. Incomplete online payment methods are disabled before reservation; external credentials remain user supplied. |
| R16: abandoned email links/HTML | Uses shared application origin and escapes interpolated names/URLs. |
| R17: SUPPORT dashboard entry | Staff without analytics access enter through their permitted orders page. |
| R18: incomplete CI | CI now uses isolated PostgreSQL, applies migrations, typechecks, lints, builds production, and runs unit plus database/HTTP regressions. |
| R19: checkout races/network failures | Address/preview requests cancel stale work and key results by selection. Checkout, order actions, and variant updates recover after network failure. |
| R20: vulnerable development glob dependency | Scoped compatible `tinyglobby` replacement; actual Next ESLint glob behavior regression-tested. Full npm audit reports zero vulnerabilities. |

## Verification

- Unit suite: 65 passed, zero failures.
- ESLint: passed with zero warnings.
- Production build (including TypeScript): passed; final rebuild includes shared cart locking.
- Isolated database migrations: all four applied successfully.
- Database/HTTP regressions: 13 passed, zero failures (78 tests total).
- Application database: all four pending/new migrations applied; migration status confirms all eleven are up to date.
- Full dependency audit: zero vulnerabilities.

The database regressions also exposed Prisma's two-second transaction-start
limit during concurrent remote connections. The shared client now allows ten
seconds to acquire a transaction connection and fifteen seconds to execute by
default. Execution limits explicitly set by individual operations still apply.

The database suite starts a built Next.js server and a local provider mock. It
uses signed test sessions and synthetic records on an explicitly isolated
database, then removes only its own rows. It verifies persistence, concurrent
requests, refund history/provider checks, points compensation, sale-price SQL,
and support access. It does not execute real payments, refunds, shipping actions,
or outbound emails. No automated browser was available; client interaction and
real provider delivery remain separate from HTTP/server verification.

Local configuration currently enables COD, uploads, and shipping configuration.
Paymob inquiry/online checkout and email await the user's missing settings.
`npm run check:config` rechecks readiness without revealing secret values.

The remaining settings are `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID_CARD`,
`PAYMOB_INTEGRATION_ID_WALLET`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL`.

Sessions issued before session-version support require a fresh login.
