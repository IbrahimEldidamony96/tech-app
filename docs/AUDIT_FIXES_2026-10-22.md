# Audit fixes — 22 October 2026

All 11 findings in [the final audit](FINAL_PROJECT_AUDIT_2026-10-21.md) have code fixes and regression coverage. This is the follow-up to commit `aa6bb44ef999aea7dd48ccfaa61256e40cce0d67`; the changes remain local and uncommitted.

## Resolutions

| Finding | Result |
| --- | --- |
| F01: unsafe Google account linking | Disabled email-only account linking. Google must verify the mailbox; explicit linking requires a current, verified local session for the same mailbox. Revoked session cookies, including Auth.js cookie chunks, cannot bypass this check. Login retries can clear a rejected OAuth session. |
| F02: carrier exceptions restore unsellable inventory | Lost, damaged, cancelled and exceptional deliveries now have distinct states. Return callbacks wait for receipt and inspection. Only an explicit staff confirmation of physical receipt and sellable condition restores stock, once. Captured payments remain available for refund reconciliation. |
| F03: online payment marked paid without a provider reference | Staff supply a Paymob transaction ID. Authenticated inquiry checks the order, amount and integration. Manual verification and webhooks share one settlement routine. Legacy paid payments without an ID can be repaired; duplicate callbacks remain idempotent. |
| F04: carrier booking stranded after a database failure | A durable booking reservation precedes the carrier call. Unknown outcomes block repeat booking and cancellation. Staff can record an existing delivery, confirm its absence, or cancel the recorded booking. Recovery actions require evidence, are serialized, and are audited. |
| F05: saved addresses retain stale carrier IDs or reject null fields | The address form uses dependent city, zone and district selectors. Changing a parent clears its children. Server validation checks the carrier location. Optional database nulls are accepted, including when selecting a default address. |
| F06: referral signup drops its code | Registration submits the normalized `ref` query parameter. The registration API persists the associated referrer. |
| F07: overlapping email jobs send duplicates | A durable outbox claims deliveries with a lease, preserves the original payload and sender, and reuses a provider idempotency key. Ambiguous attempts stop before the provider window closes. Review entries do not block later queue items; administrators can reconcile delivered messages using provider evidence. |
| F08: history and wishlist show base prices or archived products | Both APIs and recently viewed cards select variants by effective sale price. Archived and inactive products are excluded. |
| F09: failed requests freeze forms or corrupt displayed state | Customer and administration mutations catch transport errors and release pending state. Cart writes are serialized and update displayed items after success. Wishlist add/remove operations are idempotent and preserve displayed items on failure. Guest cart resolution exposes a retry control. |
| F10: concurrent reviews leave stale aggregates | Review creation, edits, deletion and aggregate synchronization share a parent product lock and transaction. |
| F11: invoices lose Arabic or truncate items | Invoices embed local Arabic and Latin fonts, shape Arabic text and paginate. A 65-item regression checks every SKU, totals, customer name and address. The production download route and deployment font tracing are checked separately. |

## Verification

| Check | Result |
| --- | --- |
| Production build | Passed; TypeScript passed and 71 page-generation steps completed |
| ESLint | Passed |
| Unit/component/provider-policy tests | 80 passed, zero failures |
| PostgreSQL and production HTTP regressions | 23 passed, zero failures (21 full-suite tests plus 2 final endpoint checks) |
| Dependency audit, including development dependencies | Zero reported vulnerabilities |
| English/Arabic translation keys in changed components | No missing keys |
| Invoice deployment assets | Both TrueType fonts and their license are included in the route trace |
| Whitespace/diff check | Passed |
| Main database migrations | Both additive migrations applied and verified; all 13 migrations are up to date |

Database verification used the isolated Neon branch `br-curly-rice-arv7y3en`, separate from the application endpoint. The 21-test full suite covered concurrency, refunds, stock, permissions, addresses, referrals, review aggregates and outbox retries. Two additional production HTTP checks covered invoice generation and cron SQL after the final build. Providers were mocked; no real payment, refund, shipment or email was sent. Client handlers were exercised with a hook harness, and an Arabic PDF was visually inspected; an interactive browser/OAuth flow was not exercised.

The temporary branch is scheduled to expire at `2026-10-23T22:55:00Z`. The ignored `.env.audit` points to it. A later test run needs a current isolated endpoint, and the runner refuses to use the application database as a fallback.

Read-only main database checks found zero active Google accounts with a stored password, zero paid online payments missing a transaction ID, zero processing orders without shipments, and zero historical returned shipments matching the audited exception state codes. No historical record repair was needed for those checks.

## Staff controls

- In an order, **Verify payment** requires its captured Paymob transaction ID. Failed online payments and legacy paid payments without a reference can also be verified.
- An order left processing without a shipment displays **Recover shipment booking**. Check the carrier dashboard and provide the outcome and evidence before submitting.
- **Returned** requires confirmation that the remaining goods were physically received, inspected and can be sold. Carrier loss/damage callbacks do not replenish sellable inventory.
- **Email delivery review** is available from the admin dashboard to staff with settings permission. Confirm an existing delivered message using provider evidence; if none was accepted, send it once from the provider dashboard before recording that evidence.

## Remaining service setup

The configuration check detects database, authentication, scheduler, email, uploads and shipping settings. Only cash on delivery is enabled. These Paymob settings are still missing:

- `PAYMOB_API_KEY`
- `PAYMOB_INTEGRATION_ID_CARD`
- `PAYMOB_INTEGRATION_ID_WALLET`

Add them directly to the local/deployment environment when available, restart the application and run `npm run check:config`. Online payments and provider refund inquiry stay unavailable until the corresponding configuration is complete. Live Google login, email delivery, carrier booking and Paymob sandbox transactions need their separate provider checks; configuration presence alone does not validate a credential.
