# Final project audit — 21 October 2026

> Follow-up, 22 October 2026: all 11 findings have been fixed and verified. See [the fix report](AUDIT_FIXES_2026-10-22.md) for changes, test results and remaining provider setup.

Reviewed commit: `aa6bb44ef999aea7dd48ccfaa61256e40cce0d67`.

Result: **11 actionable findings: four P1 (high priority) and seven P2 (medium priority).** The previous audit fixes are present, but passing the existing checks did not cover the scenarios below. This review changes documentation only.

## Verification

| Check | Fresh result |
| --- | --- |
| Production build | Passed; all 68 static pages generated |
| TypeScript | Passed as part of the production build |
| ESLint | Passed |
| Unit tests | 65 passed, zero failures |
| Isolated database and production HTTP regressions | 13 passed, zero failures |
| npm dependency audit, including development dependencies | Zero reported vulnerabilities |
| Configured application database migration status | All 11 migrations up to date |
| Configuration readiness | Email settings detected; Paymob inquiry unavailable; COD is the only enabled payment method |

The database suite used the separate endpoint in `.env.audit`, synthetic fixtures, and mocked providers; it cleaned up its records and application process. Additional in-memory reproductions invoked the actual handlers, helpers, Auth.js linking implementation, and client event handlers with mocked dependencies. They did not send real emails, create real shipments, move money, or change application database records. The configuration check detects values, not whether provider credentials work. No browser automation or live provider transaction was performed.

## Findings

### F01 — P1: Automatic Google linking preserves an unverified account's password and sessions

Locations: [auth.ts](../auth.ts), lines 51–53, 78, 94–110 and 126–132; [registration](../app/api/auth/register/route.ts), lines 49–65.

Registration creates a usable password account before email verification. `allowDangerousEmailAccountLinking: true` then links a real Google owner to any existing row with the same email. Neither linking nor the create-user event removes the preexisting password or increments `sessionVersion`. Someone who registered the victim's email first retains password access and existing sessions after the victim signs in with Google.

Reproduction: the installed Auth.js linking function linked the verified Google identity to an unverified local fixture while keeping its original password and session version. The application's event also marked that row verified. The credentials authorizer continues accepting its password.

Fix direction: require an authenticated, deliberate linking flow; or securely recover unverified local registrations before linking, replacing unproven credentials and revoking prior sessions. Google verification alone does not prove ownership of the old local password.

### F02 — P1: Carrier failure states incorrectly restore sellable inventory

Locations: [Bosta mapping](../lib/bosta.ts), lines 433–450; [shipment service](../lib/shipment-service.ts), lines 165–216.

Codes 100 (lost) and 101 (damaged), as well as cancellation/termination, map to `RETURNED`. That transition immediately increments inventory, releases coupon usage, compensates loyalty, and cancels the order. A lost parcel has not physically returned to the store. The mapper also ignores code 46, which Bosta identifies as returned to business. [Bosta's official state definitions](https://docs.bosta.co/docs/how-to/get-delivery-status-via-webhook/) distinguish these states and their shipment types.

Reproduction: separately passing codes 100 and 101 through the real mapping and shipment service increased a fixture's stock from 5 to 7 and cancelled its order. Code 46 mapped to `null`.

Fix direction: track lost, damaged, cancelled, and physically returned shipments separately. Restore sellable stock only after a confirmed receipt and condition check, respecting the provider's shipment type.

### F03 — P1: Manual online-payment confirmation blocks verified callbacks and refund reconciliation

Locations: [mark-paid API](../app/api/admin/orders/[id]/payment/mark-paid/route.ts), lines 9–38; [Paymob webhook](../app/api/webhooks/paymob/route.ts), lines 33–38; [refund service](../lib/refund-service.ts), lines 41–46.

The mark-paid action is exposed for online orders and requires only `orders:write`. It marks the payment and order paid without provider verification, evidence, or a transaction ID. A subsequent genuine callback reaches the different-settled-payment guard and receives 409, so the transaction ID never attaches. Online refunds then fail because their authenticated inquiry requires that ID. This also allows shipment and revenue recognition before payment has been verified.

Reproduction: manual confirmation returned 200; the subsequent verified-capture callback returned 409; the payment transaction ID remained null.

Fix direction: reconcile online payments through an authenticated provider inquiry and persist the validated transaction ID before marking them paid. Handle callbacks for an already recorded capture idempotently.

### F04 — P1: A successful carrier booking can be lost when local persistence fails

Location: [shipment creation](../app/api/admin/orders/[id]/shipment/route.ts), lines 65–68 and 116–190.

Shipment creation first reserves `PROCESSING`, then creates the external delivery, then records the shipment in a separate database transaction. If that final transaction throws, the compensation branch is never reached. The live booking has no local shipment row and the order remains processing. Retrying cannot reserve the confirmed state and returns 409. Compensating cancellation failures in the changed-state branch are also only logged, leaving no durable booking recovery record.

Reproduction: provider booking succeeded, an injected local transaction failure escaped, no provider cancellation occurred, no shipment was recorded, and retry returned 409 with the order still processing.

Fix direction: persist booking attempts and carrier references durably, reconcile ambiguous outcomes, and provide retryable compensation/recovery. Keep the reservation recoverable after local failures.

### F05 — P2: Saved-address actions retain stale carrier IDs or send invalid null values

Locations: [address form](../components/account/address-form.tsx), lines 10–24, 55, 116–133 and 155–171; [address manager](../components/account/address-manager.tsx), lines 45–52; [address schema](../lib/validations/address.ts), lines 10–20; [address update](../app/api/addresses/[id]/route.ts), line 46; [Bosta validation](../lib/bosta.ts), lines 287–327.

The form changes governorate/zone names without updating or clearing cached Bosta IDs. Its TypeScript model omits those IDs, but raw server objects still contain them and object spreads preserve them at runtime. The API saves the stale values; checkout later rejects the mismatch. The form has no district selector. Separately, raw stored addresses contain nullable optional fields, while the request schema accepts only strings or omission. Editing null carrier IDs, or setting an address with null optional fields as default, can therefore return 400.

Reproduction: changing a cached address to a new governorate and zone submitted both original carrier IDs. Schema checks also rejected representative edit/default payloads containing database nulls.

Fix direction: use the same city/zone/district selection and ID model in account and checkout forms. Normalize optional fields consistently, validate relationships, and explicitly clear stale IDs when their parent location changes.

### F06 — P2: Referral links are discarded during registration

Locations: [referral link](../components/account/referral-copy.tsx), line 5; [registration form](../app/register/page.tsx), lines 13–14 and 31–35; [registration API](../app/api/auth/register/route.ts), lines 38–56.

Shared links contain `?ref=CODE`, and the API supports `referralCode`, but the signup form reads only `next` and submits only name, email, and password. Normal signup through the shared link never sets the referrer and cannot award its referral reward.

Reproduction: submitting the real registration form with `ref=AUDITREF123` in its URL sent no `referralCode` field.

Fix direction: validate and retain the referral parameter through registration and include it in the signup request.

### F07 — P2: Overlapping email jobs send duplicates

Locations: [notification emails](../app/api/cron/notification-emails/route.ts), lines 11–17; [cart reminders](../app/api/cron/abandoned-carts/route.ts), lines 13–22.

Both jobs select unsent rows, send the email, and mark completion afterward. Two requests can select the same row and both send it. The conditional notification update occurs after delivery, so it cannot prevent the duplicate. A crash after provider acceptance and before the database update creates the same retry problem.

Reproduction: two concurrent invocations of the real notification handler sent two emails for one pending notification.

Fix direction: introduce durable, expiring delivery claims and stable per-message provider idempotency, with retry handling for partial failures.

### F08 — P2: Remaining product lists still select/display regular prices

Locations: [recently viewed page](../app/account/recently-viewed/page.tsx), line 8; [recently viewed API](../app/api/recently-viewed/route.ts), line 18; [wishlist API](../app/api/wishlist/route.ts), lines 26–30; [product card](../components/product-card.tsx), lines 51–68.

The catalog and server-rendered wishlist were corrected, but these remaining queries still choose variants by regular price. The recently viewed page drops all sale fields before rendering, and the wishlist API does not return them. These paths also lack the active/non-archived product filtering used by the main catalog, so saved history can link to an archived product's 404 page.

Reproduction: a product with variants priced 100 and 200, with the second on an active sale at 50, reached the recently viewed card as 100. The correct cheapest current price was 50.

Fix direction: reuse effective-price variant selection and conversion across every product list, and apply an explicit policy for unavailable saved products.

### F09 — P2: Network failures still leave several customer forms disabled

Locations: [payment retry](../components/complete-payment-button.tsx), lines 11–24; [address form](../components/account/address-form.tsx), lines 144–183; [registration](../app/register/page.tsx), lines 26–57; [forgot password](../app/forgot-password/page.tsx), lines 16–37; [password reset](../components/reset-password-form.tsx), lines 20–43.

These handlers set loading/submitting before a request but do not catch rejected fetches and reset state in `finally`. An offline request or dropped connection rejects before the reset and leaves the button disabled until a page reload. Similar unhandled request patterns remain in several administration forms and optimistic cart actions.

Reproduction: rejecting fetch from the actual address submit and payment retry handlers left their submitting/loading state true and the payment button disabled.

Fix direction: catch transport/response errors, restore pending state in `finally`, show a retryable error, and reconcile optimistic state after failed writes.

### F10 — P2: Concurrent reviews can overwrite current rating totals with an older snapshot

Locations: [rating synchronization](../lib/product-maintenance.ts), lines 12–20; [review creation](../app/api/reviews/route.ts), lines 76–81; [review edits/deletion](../app/api/reviews/[id]/route.ts), lines 40–46 and 72–73.

The review mutation, aggregate read, and Product rating update are separate operations. A slower older aggregate can write after a newer one. The stored review count and average then disagree with actual reviews until a future mutation recomputes them, affecting ratings displayed and filtered in the catalog.

Reproduction: interleaving two calls to the real synchronization helper left `reviewCount=1` and average 5 after a newer aggregate had already reported two reviews with average 3.

Fix direction: serialize review mutations and aggregate updates using the same parent product lock within a transaction, or derive the aggregate through a consistent database mechanism.

### F11 — P2: Invoice PDFs lose Arabic text and silently truncate large orders

Location: [invoice generator](../app/api/orders/[id]/invoice/route.ts), lines 6–18 and 49–67.

`pdfEscape` replaces every non-ASCII character with `?`, including Arabic customer/address text. The generator also keeps only the first 55 lines on one page. Orders with enough distinct items lose later items, totals, and the shipping address without any error.

Reproduction: a 60-item fixture with an Arabic customer name produced question marks and a PDF containing no `TOTAL:` line.

Fix direction: use a PDF renderer with Unicode font support, Arabic shaping/direction, wrapping, and pagination; ensure totals and required invoice content always render.

## Recommended order

Resolve F01–F04 before enabling live online payments or relying on automatic shipment accounting. Then repair saved-address and referral flows, email delivery idempotency, and remaining customer error handling. Add regressions for each reproduced case; the current 78 tests do not cover them. Preserve the existing verified concurrency, refund-ledger, role, and sale-price checks.

Paymob credentials remain a separate setup task: `PAYMOB_API_KEY` is not detected and no online payment method is enabled. Email configuration is present, but live delivery has not been tested by this audit.

