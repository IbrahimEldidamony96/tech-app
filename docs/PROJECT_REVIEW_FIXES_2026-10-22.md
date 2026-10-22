# Fixes for the 22 October project review

This follow-up covers the six confirmed findings in [the original review](PROJECT_REVIEW_2026-10-22.md). Existing unrelated working-tree changes were preserved.

| Step | Finding | Implementation |
| --- | --- | --- |
| 1 | F01: reset links survive password changes | Password changes revoke outstanding reset links in the same transaction. Token issuance and reset consumption acquire the user lock before mutating tokens, matching password-update lock ordering. |
| 2 | F02: redirect normalization bypass | Locale and authentication navigation share local-path validation. It rejects controls, backslashes and external origins, including percent-encoded forms, while preserving safe path/query/hash strings. |
| 3 | F03: callbacks lost during booking recovery | Authenticated callbacks matching a known booking are stored in `ShipmentBookingEvent`. Attachment replays them transactionally through the existing shipment, COD and loyalty logic. All paths lock the order first; delivery/tracking mismatches are rejected, duplicate callbacks remain idempotent, and early callbacks can identify an in-flight attempt by its order reference. |
| 4 | F04: alternate catalog endpoints bypass checks | Both variant endpoints call one creation service. Product ownership, unique values per option and duplicate combinations are validated under a product lock. Creation, opening inventory balance, audit and starting-price updates commit together. Both option-value endpoints enforce the product/option relationship. |
| 5 | F05: sale boundaries shift on blur | Date inputs display local calendar components and skip unchanged values, preserving seconds and ambiguous DST instants. Edited dates convert to UTC; nonexistent local times are rejected. |
| 6 | F06: insufficient points return 500 | The atomic balance claim raises a typed conflict. Checkout returns HTTP 409 with code `INSUFFICIENT_LOYALTY_POINTS` and the current balance. The form clears redemption, updates the available balance, refreshes and displays an English/Arabic retry message. |

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 84 passed, zero failures. After the final redirect refinement, its focused regression also passed. |
| `npm run test:db` | 28 passed, zero failures, including all five new database regressions; fixture cleanup completed successfully. |
| `npm run lint` | Passed; focused lint on the final redirect and database-test edits also passed. |
| `npm run typecheck` | Passed after correcting two required fields in new test fixtures. |
| `npm run build` | Passed, including TypeScript and all 71 page-generation steps. |
| Migration | New callback-storage migration applied successfully on the isolated audit database. |
| Translation keys | All 570 English/Arabic keys match; new Arabic messages retain Unicode text. |
| `git diff --check` | Passed. |

The new regressions cover the real locale handler, date-field/checkout component handlers, Cairo/New York/UTC date round trips, and HTTP/database flows for credentials, shipment recovery, catalog integrity and checkout rollback. Database cases verify that an earlier reset link returns 400 after a successful password change; a retained delivered callback settles COD exactly once after attachment; both variant endpoints reject foreign, repeated, nonexistent and duplicate combinations; concurrent creation returns one 201 and one 409; and insufficient loyalty points return 409 without changing the cart, stock, points or order records.

The database runner applies pending migrations only after verifying that `TEST_DATABASE_URL` is on a separate endpoint from the application's `.env` database. Provider calls use local fixtures; email sending is disabled. Cleanup targets exact fixture IDs. The prior review's invoice/cron connection-reset exception did not recur. The run emitted a `pg` concurrent-query deprecation warning; it did not cause an assertion or cleanup failure.

## Rollout

The new migration is `20261022120000_booking_callback_events`. Apply it to the intended application database with `npm run db:deploy` before deploying the application code. The application database is not migrated as part of this repair session.

The review's lower-priority observations remain separate operational/localization follow-ups: missing Paymob credentials, email retry scheduling, and broader Arabic coverage. No credentials are fabricated, and provider transactions and interactive browser flows are outside this verification.
