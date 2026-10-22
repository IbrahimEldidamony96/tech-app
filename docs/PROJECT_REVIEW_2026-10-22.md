# Project review — 22 October 2026

The current working tree has **six reproduced issues** that are not covered by the existing passing tests. All six are P2: actionable security, correctness, or recovery defects. No application code was changed during this review. Existing uncommitted work was preserved.

Implementation follow-up: [step-by-step fixes and verification](PROJECT_REVIEW_FIXES_2026-10-22.md).

## Scope and verification

Reviewed the project structure, 85 API route files, authentication and permissions, catalog administration, cart and checkout, payment/refund accounting, shipment booking and recovery, email jobs, database schema/migrations, deployment configuration, and English/Arabic translations. Manual inspection concentrated on application flows and failure paths; this is not a claim that every possible execution path is verified.

| Check | Result |
| --- | --- |
| `npm test` | 80 passed; zero failures |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, including TypeScript and 71 page-generation steps |
| `npm run test:db` | Full run: 22 passed, 1 failed with `ECONNRESET`; focused invoice + cron rerun: 2 passed, zero failures |
| `prisma validate` | Passed |
| `npm audit --json` | Zero reported vulnerabilities, including development dependencies |
| Isolated database migrations | 13 applied; all stored migration checksums match local files |
| Translation checks | EN/AR key sets match; 555 statically resolved translation calls have existing keys |
| Source secret-pattern scan | No matches for the checked private-key, AWS-key, database-URL, or Stripe-key patterns; this is a limited pattern scan |
| `git diff --check` | Passed; Git emitted Windows line-ending conversion notices |

Database and HTTP reproductions used the separate endpoint in `.env.audit`, with synthetic records cleaned up by their exact IDs. Providers were mocked or disabled. No real payment, refund, shipment, or email was initiated, and no application-database records or migrations were changed. React handler checks used a hook harness rather than an interactive browser.

The full database run's last test failed while fetching the local server, without reaching a failing HTTP/SQL assertion. Running `npm run test:db -- --test-name-pattern="production invoice|email cron queues"` then passed both selected tests, including the preceding invoice step. The connection reset did not repeat; its root cause is undetermined. This is recorded as a test-transport exception, not a confirmed additional application defect.

## F01 — P2: Password changes leave earlier password-reset links usable

Locations: [password change](../app/api/account/password/route.ts), lines 62–73; [password reset](../app/api/auth/reset-password/route.ts), lines 34–51; [token lifecycle](../lib/verification-tokens.ts), lines 11–28 and 34–52.

An authenticated password change increments `sessionVersion` but does not invalidate unused `PASSWORD_RESET` tokens. Token consumption does not bind the token to the password/session version that existed when it was issued. Someone holding an earlier reset link can therefore replace the newly changed password until that link expires, even though existing login sessions were revoked.

**Reproduction:** issued a reset token for a synthetic customer; changed the password through `PATCH /api/account/password` (200); submitted the earlier token to `POST /api/auth/reset-password` (200). Both operations succeeded in that order.

**Fix:** change the password and revoke outstanding reset tokens in one transaction. Bind token issuance/consumption to the current credential version, or serialize all password/token operations on the same user row so concurrent issuance cannot escape revocation. Add a regression proving that a token issued before a completed password change is rejected.

## F02 — P2: Control characters bypass the local-redirect guard

Locations: [locale redirect](../app/api/locale/route.ts), lines 23–28; [shared path helper](../lib/safe-next-path.ts), lines 1–2. The shared helper is used by registration/login, including [credential-login navigation](../components/login-form.tsx), lines 14 and 50.

The regular expression rejects a literal `//host`, but accepts a slash, tab/newline, and another slash. URL parsing removes those control characters, turning the accepted path into an external URL. The locale handler then issues a redirect to that external origin.

**Reproduction:** called the actual locale handler with `redirect=%2F%09%2Foutside.example`. It returned HTTP 307 with `Location: https://outside.example/`. `%2F%0A%2Foutside.example` produced the same result. The ordinary `//outside.example` case was correctly rejected. `safeNextPath()` also returned both control-character inputs unchanged.

**Fix:** reject control characters before accepting a path, parse against a known local origin, and require the parsed origin to match. Reuse that validation for the locale endpoint and post-login navigation. Cover tabs, newlines, carriage returns, backslashes, and encoded inputs.

## F03 — P2: Delivery callbacks are discarded while a booking awaits recovery

Locations: [Bosta callback](../app/api/webhooks/bosta/route.ts), lines 47–58; [booking attachment](../lib/shipment-booking.ts), lines 66–75 and 79–102.

The callback handler searches only `Shipment`. A successfully booked delivery can instead exist solely in `ShipmentBooking` while local persistence is being recovered. Callbacks arriving during that interval receive 200 without being stored. Recovery subsequently attaches a shipment with status `PENDING` and cannot replay the discarded event. A final delivered event can be lost permanently, leaving a delivered COD order unpaid locally. Bosta documents callbacks as [events triggered by shipment state changes](https://docs.bosta.co/docs/how-to/get-delivery-status-via-webhook/).

**Reproduction:** created a processing COD order with an expired `UNKNOWN` booking containing carrier/tracking IDs but no shipment; submitted its delivered callback (200); attached the recorded booking through the recovery endpoint (200). The resulting state was `Order=PROCESSING`, `Shipment=PENDING`, `Payment=PENDING`.

**Fix:** durably retain authenticated events for recognized booking attempts and process them after attachment, or reconcile carrier state during attachment. Preserve identity checks, order-row locking, and idempotent financial/stock effects.

## F04 — P2: A second variant-creation endpoint bypasses integrity checks and inventory accounting

Locations: [secondary variant endpoint](../app/api/admin/products/[id]/options/variants/route.ts), lines 56–98; compare [primary endpoint](../app/api/products/[id]/variants/route.ts), lines 75–109 and 133–154. The related [secondary option-value endpoint](../app/api/admin/products/[id]/options/[optionId]/values/route.ts), lines 13 and 30–33, also ignores the product ID when creating a value.

The secondary endpoint remains reachable with catalog-write permission. It does not check that submitted option values belong to the target product or that only one value is selected per option. It also skips the opening inventory movement, audit entry, and starting-price maintenance implemented in the primary endpoint. Invalid variant combinations can be persisted and cannot be selected correctly on the storefront.

**Reproduction:** sent an existing option value from product B while creating a variant for product A. The primary endpoint returned 400; the secondary endpoint returned 201. The new variant had stock 3 and zero inventory movements.

**Fix:** remove/delegate the secondary implementation and share one validated creation service. Validate product/option relationships in both option-value routes, and keep variant creation, inventory opening balance, audit entry, and price maintenance consistent.

## F05 — P2: Blurring a sale-date field changes the stored time without an edit

Locations: [variant date formatting](../components/admin/variants-manager.tsx), line 14; [date-field handlers](../components/admin/variants-manager.tsx), lines 67–68.

The formatter uses `toISOString()` to populate `datetime-local`, displaying UTC digits as if they were local time. The blur handler then interprets those digits as local time through `new Date(value)`. Merely focusing and leaving a field shifts the sale boundary by the administrator's UTC offset. Reloading and repeating can shift it again.

**Reproduction:** ran the real component and blur handler with `TZ=Africa/Cairo`. An original timestamp of `2026-10-22T09:00:00.000Z` displayed as `2026-10-22T09:00` and submitted `2026-10-22T06:00:00.000Z` without an edit: three hours earlier.

**Fix:** format local calendar/time components for `datetime-local`, convert to UTC on submission, and skip saves when the value has not changed. Verify round trips in Cairo and around daylight-saving transitions.

## F06 — P2: Insufficient loyalty points produce an HTTP 500 at checkout

Locations: [balance claim](../lib/loyalty.ts), lines 31–36; [checkout redemption](../app/api/checkout/route.ts), lines 300–306; [checkout error handling](../app/api/checkout/route.ts), lines 444–451.

Insufficient points throw a plain `Error("INSUFFICIENT_LOYALTY_POINTS")`, while checkout handles only `CheckoutError`. A stale checkout tab can encounter this after the customer's balance changes elsewhere. It receives an unhandled server error rather than an actionable validation response. The transaction correctly rolls back; no stock or points loss was observed.

**Reproduction:** submitted a valid COD checkout requesting 10 points for a synthetic user with balance 0. The endpoint returned 500, and the cart line remained intact.

**Fix:** map this expected balance conflict to a stable 400/409 response and a translatable message; refresh the displayed balance so the customer can retry. Preserve the atomic balance check.

## Configuration and lower-priority observations

- **Online payments are currently unavailable.** `check:config` enabled only COD. `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID_CARD`, and `PAYMOB_INTEGRATION_ID_WALLET` were absent. Other service checks establish configuration presence only; provider credentials were not validated live.
- **Daily email scheduling misses the automatic retry window.** [Deployment schedules](../vercel.json) run both email jobs once daily, while [delivery claims](../lib/email-delivery.ts), lines 35–37, send failed attempts aged 23 hours to manual review. Without another scheduler, a failed first attempt has no scheduled automatic retry before that cutoff. Consider an additional, more frequent scheduler if automatic transient-failure recovery is intended. Each job also processes at most 100 candidates per invocation.
- **Arabic localization remains incomplete despite matching translation keys.** Examples include the order-note/loyalty labels in [checkout](../components/checkout-form.tsx), lines 592–598, and most of the [returns page](../app/account/returns/page.tsx), line 6. Stored order timeline text and checkout product-name snapshots also use English.
- **Some concurrency concerns remain unproven.** Concurrent first-image creation was inspected and exercised with six HTTP requests, but that run retained exactly one primary image. It is not counted as a reproduced defect in this report.
- **The suspected persistent cart mismatch is mitigated.** Although the cart handler ignores a stock-clamped response quantity, [the cart page](../app/cart/page.tsx) keys `CartItems` with `JSON.stringify(items)`, remounting it when refreshed server data changes. An isolated component-harness result did not account for that parent behavior, so the persistent mismatch is excluded from the findings.

Prioritize the two security fixes, shipment event recovery, and unifying variant creation, followed by sale-date correctness and checkout error handling. Interactive browser flows, live OAuth, and real provider transactions remain outside this review's verification limits.
