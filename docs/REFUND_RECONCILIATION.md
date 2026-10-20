# Refund & loyalty reconciliation (draft feature)

## Prerequisites

1. Apply `prisma/migrations/20261020120000_refund_ledger/migration.sql` with `npx prisma migrate deploy` BEFORE shipping the new handlers.
2. Set `PAYMOB_API_KEY` (merchant API Key, **not** `PAYMOB_SECRET_KEY`) on the server for Paymob inquiry. The service exchanges it for a Bearer token at `/api/auth/tokens`, then reads `/api/acceptance/transactions/{transaction_id}`. Never expose either token to clients.
3. Ensure the Paymob merchant dashboard supports partial refunds for the configured card/wallet payment methods. This application does NOT trigger a provider refund and therefore cannot accidentally double-send money on a timeout.
4. An operator must execute and document the **exact EGP refund amount externally** before confirming it in this UI.

## Process

- Customer requests a return. Admin approves, then receives it and restocks under the order lock (PR #2).
- Admin enters a non-zero refund value. The API caps it by **net eligible returned order items** (including proportional order-level promotions and redeemed points), excludes shipping, and caps the aggregate against the captured payment.
- The Refund row becomes `PENDING_CONFIRMATION`. A second pending refund on the same order is blocked. For Paymob, the API captures the current provider refunded-cents baseline; this must match all previously reconciled local confirmed refunds.
- The operator issues the refund separately in Paymob Dashboard, using the original transaction ID; for COD, the operator pays the customer and retains a unique receipt/reference.
- Clicking **Verify Paymob and confirm** re-queries Paymob for the original signed/verified payment ID and checks *currency, original amount, merchant order ID, success flag,* and cumulative refunded cents. The cumulative total must be **exactly** the recorded baseline + pending amount. For COD, the operator supplies the independent receipt/reference.
- Only then, atomically: `Refund.status=CONFIRMED`, `ReturnRequest.status=REFUNDED`, payment/order status `PARTIALLY_REFUNDED` or `REFUNDED`, audit/notification, and loyalty correction. If any database step fails, no local confirmation is saved; retry is idempotent.
- Delivery earns loyalty and referral points; a returned Bosta shipment reverses the earned and referral points and restores redeemed points. Partial refunds prorate earn reversal and redeemed restoration; a full merchandise refund reverses original referral awards too. Negative balances represent outstanding point debt if the user already spent the original rewards.

## Remaining / production warnings

- **No automatic payment initiation.** This is an intent and independent provider **verification** workflow; it does not call Paymob's money-moving refund API. Do not tell customers a refund has been initiated just because a pending intent exists.
- Only one Paymob refund may be awaiting reconciliation per order; an unmatched provider refunded amount blocks new intents. Investigate discrepancies manually rather than overriding historical evidence.
- Manual COD reconciliation is an authorized operator attestation, NOT independently verified by a payment provider. Establish business approval/separation of duties before production.
- Verify Paymob transaction inquiry response shapes with live sandbox account, especially `order.merchant_order_id` and `refunded_amount_cents_int`.
- Ensure no historical inconsistent refunds are present before enabling. This migration does not backfill existing return rows marked `REFUNDED` without provider evidence.
- Stage/test concurrent refund requests and confirmations with PostgreSQL, plus Paymob failure/timeout/partial refund cases. GitHub Actions failed to provision runners at baseline.
- A fully returned shipment after delivery can be cancelled and restocked. A paid shipment still requires separate provider payment refund/reconciliation; it is **not automatically refunded** by stock reconciliation.
- PR #2 must merge first; this PR is stacked on `fix/p1-atomic-return-reservations` and changes overlapping return handlers.
