# Project audit — 20 October 2026

Historical findings. The follow-up implementation and verification are tracked in
[AUDIT_FIXES_2026-10-21.md](AUDIT_FIXES_2026-10-21.md).

Reviewed the local workspace at commit `28c0366`, including the uncommitted TSX/lint fixes from the preceding task. This is an analysis report; no application behavior, environment settings, database schema, customer data, or provider settings were changed by this review.

## Evidence and coverage

| Check | Result |
| --- | --- |
| Production build, TypeScript, ESLint | Passed on this source state during the preceding task; ESLint had zero warnings |
| Complete discovered test suite | **60 passed, 0 failed**, across `lib` and `prisma` |
| Prisma schema validation | Passed |
| Configured database migration status | **Two pending migrations** |
| Read-only database schema inspection | Confirmed all three expected schema additions below are absent |
| Production dependency audit | **0 vulnerabilities** reported |
| Full dependency audit | 5 high-severity affected package entries in one development dependency chain |
| Translation files | 541 keys in each language; no key differences |
| Literal translation call scan | 524 calls checked across 267 source files; no missing keys found |
| Local production HTTP checks | Storefront, login, and product list returned 200; protected APIs returned 401; admin redirected to login |
| Session endpoint with existing local configuration | **500, `UntrustedHost`** |
| Session endpoint with temporary process-only host-trust setting | 200, unauthenticated session `null` |

The review mapped API authorization checks and examined authentication, checkout, inventory, coupons, payments, shipments, returns/refunds, pricing, carts, notifications, uploads, schema/migrations, localization, and CI configuration. The literal translation scan does not establish that all visible content has been translated.

Controlled reproductions ran the current route/service code with synthetic data and mocked persistence/provider boundaries. They confirmed payment reference substitution, skipped delivery callbacks, coupon scope bypass, cancellation/confirmation races, stale inventory writes, and concurrent initial cart creation. These are application-logic checks, not live payment or shipping transactions.

Browser rendering, signed-in customer journeys, provider callbacks from real accounts, and migrations on an isolated staging database remain unverified. Local configuration findings describe this workspace; hosted environment settings were not inspected. Temporary local HTTP servers were stopped after testing.

## High priority

### R01 — The configured database is behind the application

**Evidence:** `prisma migrate status` lists these pending migrations:

- `20261020120000_refund_ledger`
- `20261020170000_user_session_version`

A transaction using `BEGIN READ ONLY` confirmed that `User.sessionVersion`, the `Refund` table, and `LoyaltyTransaction.idempotencyKey` are absent. The current authentication callback selects `sessionVersion`, while dashboard/refund queries use the new ledger.

**Impact:** Authentication and financial workflows can fail at runtime even though compilation succeeds. Existing user reads that select all model fields can also encounter the missing column.

**Locations:** `auth.ts:95`, `prisma/schema.prisma:125`, `prisma/schema.prisma:892`, `prisma/schema.prisma:943`, `lib/queries/admin-stats.ts:24`.

**Remediation:** Verify the intended database/environment, configure its direct migration connection, test the two migrations on an isolated staging database, then deploy them before running the updated application against that database. No migration was applied during this audit.

### R02 — A valid payment HMAC does not authenticate the local order reference

**Evidence:** HMAC verification includes `obj.order.id`, but the handler locates the local order using `obj.order.merchant_order_id`, which is outside the signed fields. The application does not bind that signed provider order ID to the selected local payment. A synthetic callback retained its valid HMAC after changing only `merchant_order_id`; the actual handler marked the substituted, same-amount order paid and returned 200.

**Impact:** Someone possessing a valid transaction callback can substitute another matching-amount order reference. Amount and currency checks do not establish ownership of that payment.

**Locations:** `lib/paymob.ts:122`, `lib/paymob.ts:136`, `app/api/webhooks/paymob/route.ts:46`, `app/api/webhooks/paymob/route.ts:137`.

**Remediation:** Persist and verify the provider order/intention association, or obtain it through an authenticated provider inquiry, before crediting a local payment. Verify the expected payment method and provider integration as well. Add a regression test that changes only the unsigned reference.

### R03 — Blurring an unchanged stock field can undo a checkout reservation

**Evidence:** The admin stock input sends its absolute value on every blur. The endpoint reads stock before its transaction and later writes the submitted absolute value without a version/current-stock condition. In a controlled interleaving, stock was read as 10, checkout reserved two units, and an unchanged `{stock:10}` request restored stock from 8 to 10. No inventory movement was recorded because the submitted value equaled the stale initial read.

**Impact:** Reserved units become available again, allowing overselling and making the inventory ledger disagree with stock.

**Locations:** `components/admin/variants-manager.tsx:53`, `app/api/products/[id]/variants/[variantId]/route.ts:32`, `app/api/products/[id]/variants/[variantId]/route.ts:50`.

**Remediation:** Avoid unchanged writes, use the existing atomic delta-adjustment workflow, and require a current stock/version match for absolute corrections. Compute movement deltas from state read under the same lock/transaction.

### R04 — An early delivered callback permanently strands order and COD state

**Evidence:** The webhook accepts any higher-ranked shipment state, but the order update requires a direct state-machine transition to `DELIVERED`. A delivery callback arriving while the order is `PROCESSING` changes the shipment to `DELIVERED` and leaves the order `PROCESSING` and COD payment `PENDING`. Subsequent shipped/delivered callbacks are ignored because the shipment rank is already terminal. This sequence was reproduced through `applyBostaWebhookStatus`.

**Impact:** Real deliveries can remain unpaid/unfulfilled in application records; notifications, revenue, loyalty, reviews, and return eligibility are affected.

**Locations:** `lib/shipment-service.ts:83`, `lib/shipment-service.ts:104`, `lib/shipment-service.ts:111`, `lib/order-state-machine.ts:12`.

**Remediation:** Reconcile authoritative delivery events across missing intermediate states under the order lock. Repeated callbacks must also repair inconsistent order/payment state rather than returning solely on shipment rank.

### R05 — COD confirmation can revive an already-cancelled order

**Evidence:** The confirmation handler validates a snapshot, then performs an unconditional update using only the order ID. A controlled cancellation committed between those operations; confirmation returned 200 and changed the cancelled order back to `CONFIRMED`, after cancellation had restored its stock.

**Impact:** The revived order can enter fulfillment without reserving inventory again.

**Locations:** `app/api/admin/orders/[id]/confirm/route.ts:19`, `app/api/admin/orders/[id]/confirm/route.ts:47`.

**Remediation:** Serialize confirmation with cancellation using the same parent-order lock, or use a conditional update requiring the original `PENDING` state and valid payment conditions.

### R06 — A brand restriction overwrites a coupon's category restriction

**Evidence:** Coupon validation permits both `categoryId` and `brandId`. Checkout first calculates eligible category merchandise, then replaces that amount with all merchandise from the brand. The current handler granted a 100 EGP discount on a 1,000 EGP item from the required brand but a different category.

**Impact:** Customers receive discounts on merchandise outside the coupon's configured category; scoped minimum amounts can also be satisfied incorrectly.

**Locations:** `lib/validations/coupon.ts:24`, `app/api/checkout/route.ts:232`.

**Remediation:** Apply all configured restrictions to the same eligible-line filter, then calculate the minimum and discount from that intersection.

### R07 — Cancelling a dispatched COD order restocks goods before carrier cancellation succeeds

**Evidence:** The state machine permits `SHIPPED -> CANCELLED`. Admin cancellation commits local cancellation and inventory restoration first, then calls Bosta. A carrier rejection leaves the order cancelled and stock restored; the endpoint still returns success with a warning. The admin client ignores successful-response warnings.

**Impact:** Goods still in transit can be sold again. A later delivered callback also encounters an already-cancelled order and cannot perform normal delivery/COD settlement.

**Locations:** `lib/order-state-machine.ts:23`, `lib/order-cancellation.ts:73`, `app/api/admin/orders/[id]/cancel/route.ts:27`, `app/api/admin/orders/[id]/cancel/route.ts:54`, `components/admin/order-actions.tsx:63`.

**Remediation:** Separate cancellation requests from confirmed carrier cancellation/physical return. Restore inventory only when it is available again, and surface carrier failures to operators with a recoverable reconciliation state.

## Medium priority

### R08 — Paid returned shipments have no supported refund-ledger entry path

Shipment return changes the order to `CANCELLED` and logs that manual reconciliation is required. Customer return creation requires `DELIVERED`; receiving a return rejects a cancelled order; refund creation requires an existing `RECEIVED` return. Therefore an undelivered, paid shipment returned by the carrier cannot enter the supported refund ledger workflow. Issuing a refund externally does not fix this: refund/void callbacks are acknowledged without recording it.

**Locations:** `lib/shipment-service.ts:202`, `app/api/returns/route.ts:44`, `app/api/admin/returns/[id]/route.ts:62`, `app/api/admin/returns/[id]/refund/route.ts:69`, `app/api/webhooks/paymob/route.ts:78`.

**Remediation:** Support an order-level refund reason for carrier returns/late captures and reconcile it with actual provider settlement.

### R09 — Returns funded entirely by loyalty points cannot restore those points normally

Checkout allows points to cover the merchandise subtotal. For that order, the maximum cash merchandise refund is zero. Refund creation rejects every zero amount, and receiving the customer return does not itself restore points. Point compensation is called only during confirmed cash refunds or the separate whole-shipment return path.

**Locations:** `app/api/checkout/route.ts:298`, `lib/refund-accounting.ts:34`, `app/api/admin/returns/[id]/refund/route.ts:31`, `app/api/admin/returns/[id]/refund/route.ts:228`.

**Remediation:** Reconcile returned points independently of positive cash settlement, with idempotency and returned-quantity accounting. Include the all-points and mixed cash/points cases in tests.

### R10 — Catalog filtering, sorting, and wishlists still use regular prices during sales

Catalog price predicates and variant ordering use `price`; product sorting uses regular `startingPrice`. A product regularly priced at 1,000 EGP and currently on sale for 700 EGP is excluded by a maximum-price filter of 800. Selecting the variant with the lowest regular price can also miss the cheapest sale variant. Wishlist queries omit sale fields and display the regular price.

**Locations:** `lib/queries/products.ts:63`, `lib/queries/products.ts:84`, `lib/queries/products.ts:102`, `lib/queries/wishlist.ts:20`, `app/wishlist/page.tsx:27`, `app/api/products/compare/route.ts:15`.

**Remediation:** Define a consistent effective-price query/selection policy for all catalog consumers, including sorting and filtering, and test multiple variants with different sale schedules.

### R11 — A mistaken pending refund can block later refunds indefinitely

The ledger permits one refund per return request, creation rejects any existing refund for that request, and it also rejects another pending refund on the order. The only confirmation path requires exact external settlement. There is no supported correction/cancellation state for an unexecuted mistaken intent.

**Locations:** `prisma/schema.prisma:896`, `app/api/admin/returns/[id]/refund/route.ts:69`, `app/api/admin/returns/[id]/refund/route.ts:90`, `app/api/admin/returns/[id]/refund/route.ts:171`.

**Remediation:** Add an audited resolution/cancellation workflow for unexecuted intents, preserving ledger history and confirming the provider has not already settled them.

### R12 — Concurrent first cart or wishlist access can return an unhandled unique error

Both helpers implement `findUnique`, followed by `create`. Two concurrent first accesses can both observe no container and race on the unique `userId`. The cart helper reproduced one success and one `P2002` failure.

**Locations:** `lib/cart.ts:5`, `lib/wishlist.ts:3`.

**Remediation:** Use an atomic creation strategy with handling/retry for the unique-conflict case. Also serialize cart mutations consistently with checkout's parent-cart lock.

### R13 — Normal admin restocking does not send subscribed stock alerts

`notifyStockAvailable` is called by cancellations and returns, but neither the inventory-adjustment endpoint nor the variant stock-edit endpoint calls it. Customers waiting for stock therefore receive no notification when staff perform an ordinary restock.

**Locations:** `app/api/admin/inventory/adjust/route.ts:23`, `app/api/products/[id]/variants/[variantId]/route.ts:49`, `lib/stock-alerts.ts:6`.

**Remediation:** Trigger availability notification from a shared inventory operation, with transactional claiming to avoid duplicates.

### R14 — Standalone production authentication fails with the current local configuration

Running the built application locally returned 500 from `/api/auth/session` with `UntrustedHost`. Repeating that endpoint with `AUTH_TRUST_HOST=true` supplied only to the temporary server process returned 200 and `null`. The source/example configuration does not explain standalone host trust. Supported hosted environments can infer trust automatically, so this finding does not establish a hosted production failure.

**Locations:** `auth.config.ts:9`, `env.example:8`.

**Remediation:** Configure host trust for the intended standalone deployment/proxy and document it. See the official [Auth.js deployment guidance](https://authjs.dev/getting-started/deployment#auth_trust_host).

### R15 — Required settings for several local workflows are absent

Only variable names/presence were inspected; secret values are omitted.

| Missing local setting | Resulting limitation |
| --- | --- |
| `DATABASE_URL_UNPOOLED` | Prisma CLI falls back to the pooled application connection |
| `PAYMOB_INTEGRATION_ID_CARD`, `PAYMOB_INTEGRATION_ID_WALLET` | Card/wallet checkout cannot create its payment checkout URL |
| `PAYMOB_API_KEY` | Online refund inquiry/reconciliation is unavailable |
| `RESEND_API_KEY` | Local email is suppressed; standalone production email calls throw |
| `CRON_SECRET` | Protected scheduled-job endpoints reject calls |
| `APP_URL` | Request-derived origin is used; a stable deployment origin is not configured locally |

**Locations:** `prisma.config.ts:15`, `app/api/checkout/route.ts:391`, `lib/paymob.ts:201`, `lib/email.ts:18`, `app/api/cron/expire-unpaid-orders/route.ts:19`, `lib/app-url.ts:14`.

**Remediation:** Configure the required values for each enabled environment and validate feature readiness before offering the corresponding UI options. Hosted configuration was not checked.

### R16 — Abandoned-cart emails use a different origin setting and fall back to localhost

This job builds links from `NEXT_PUBLIC_APP_URL`, while the application's documented origin helper uses `APP_URL`. The former is absent from the local environment and example. Even correctly configuring `APP_URL` leaves this job's links pointing to `http://localhost:3000/cart`.

**Locations:** `app/api/cron/abandoned-carts/route.ts:19`, `lib/app-url.ts:14`, `env.example:65`.

**Remediation:** Use the common origin helper. Escape the interpolated customer name before inserting it into the email HTML, as the notification-email job already does.

### R17 — Support staff cannot enter the dashboard linked by the header

`SUPPORT` is a staff role and has order/return read permission, but lacks `analytics:read`. The header sends all staff to `/admin`, which requires analytics access and redirects support users to the storefront. Their allowed order pages are not reachable through that dashboard entry.

**Locations:** `lib/permissions.ts:37`, `components/header.tsx:114`, `app/admin/page.tsx:11`, `lib/require-admin-page-permission.ts:19`.

**Remediation:** Provide a permission-aware staff landing page or redirect each role to an accessible section.

### R18 — CI omits production compilation and database workflow checks

The workflow installs dependencies, type-checks, lints, and runs unit tests. It does not run `npm run build`, exercise migrations on disposable PostgreSQL, or run route-level concurrency/integration tests. The successful 60-test suite did not expose the reproduced route/service failures in this report.

**Locations:** `.github/workflows/ci.yml:24`, `package.json:8`.

**Remediation:** Add a production-build job and isolated PostgreSQL migration/integration tests, prioritizing payment binding, fulfillment ordering, stock reservations, coupon scopes, and refunds.

### R19 — Shipping preview responses can overwrite a newer address selection

The checkout effect starts a new shipping-preview request when the address changes, but does not cancel old requests or check that a response belongs to the current selection. If address A's slower response arrives after address B's, the UI displays A's fee while checkout uses B. Governorate/zone/district dropdown requests have the same stale-response pattern.

**Locations:** `components/checkout-form.tsx:121`, `components/checkout-form.tsx:145`, `components/checkout-form.tsx:179`, `components/checkout-form.tsx:202`.

**Remediation:** Abort obsolete requests or attach selection/request identities before updating state. Ensure network failures always clear submitting/loading states.

## Development dependency advisory

### R20 — One vulnerable lint-tooling dependency chain

`npm audit` reports five high-severity package entries along this chain:

`eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces`

The underlying issue is a stack-exhaustion denial of service in deeply nested brace patterns: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The advisory lists affected versions through 3.0.3 and no patched release at review time. These are development dependencies; `npm audit --omit=dev` reports zero vulnerabilities. This does not establish an exploitable storefront endpoint.

**Locations:** `package.json:47`, `package-lock.json`.

**Remediation:** Track an upstream compatible fix and keep untrusted glob patterns away from affected tooling. The audit tool's suggested Next.js ESLint downgrade is not a verified compatible remediation and was not applied.

## Recommended order of work

1. Align the configured database with the application using staged, verified migrations; complete the intended environment configuration.
2. Fix payment-to-order binding and inventory reservation integrity.
3. Make confirmation, cancellation, delivery, and return events converge under consistent transaction rules.
4. Correct coupon eligibility and support both cash and loyalty return reconciliation.
5. Add regression/integration coverage for the reproduced failures and a production-build CI gate.
6. Address catalog prices, staff navigation, notifications, email origins, and stale client requests.

Re-run the targeted reproductions after each relevant fix. A release signoff additionally needs authenticated browser flows and sandbox payment/shipping checks against an isolated database.
