# Cash revenue reporting — migration and accounting policy

## Definitions (all values in EGP)
- **Gross captured** = `Payment.amount` for payments captured in the report
  period (server-validated `paidAt`, current status PAID, PARTIALLY_REFUNDED,
  or REFUNDED).
- **Confirmed refunds** = sums of `Refund.amount` for ledger rows with
  `status=CONFIRMED` and `confirmedAt` within the report period.
- **Net collected** = gross captured - confirmed refunds.
- **Paid orders** = count of capture events in the period; **average paid
  order** = gross captured / paid orders.
- Range is by **Africa/Cairo calendar day**: today and last 7/30 days
  inclusive. A refund today against a payment from last month reduces today's
  net. Negative net days (or an overall negative range) are legitimate.
- Counts by order status remain **operational** counts for orders created in
  the selected range, not cash revenue metrics.
- Top variants are **gross paid units** (no returned-unit inventory treatment).

## What changes
Previously the admin dashboard counted every non-cancelled `Order.total` by
`Order.createdAt`, including unpaid PENDING and unconfirmed payments. It
ignored confirmed refunds entirely. This PR deliberately uses a confirmed
financial event for each movement, including captured late payments on
subsequently cancelled orders.

## Dependencies
**Stacked on PR #7 (refund ledger)** which itself depends on PR #2. Merge
PR #2 and PR #7 first, then rebase/retarget this branch onto main. Running
this code without PR #7's migration + Prisma generation will fail.
No new schema migration is required beyond PR #7.

## Verification
```sh
npm ci
npm run typecheck
npm run lint
npm run test:revenue
```
Staging test: unpaid checkout $100, one paid checkout $200, $50 refund on
another prior-week paid order. Today shows gross=$200, refunds=$50, net=$150.
Test paid checkout subsequently cancelled, multiple partial refunds,
refund confirmed without a new capture, Cairo midnight and DST changeover,
and refunds spanning different periods.

## Known limitations
- The ledger introduced in PR #7 **does not backfill** old `REFUNDED`
  status rows or untracked off-platform refunds; reconcile historical
  payments with Paymob/bank before treating historic dashboard totals as
  audited accounting. Do not synthesize fake confirmed refunds.
- If an existing paid payment is missing `paidAt`, it is deliberately NOT
  attributed to a date. Audit/fix missing settlement timestamps rather
  than using `Order.createdAt`.
- For large datasets, per-payment/refund event retrieval should be replaced
  by indexed SQL aggregates/materialized daily summaries. Verify query plans
  and add `Payment.paidAt` / `Refund.confirmedAt` indexes when appropriate.
- Net collected is a cash-movement reporting metric, not accrual accounting,
  profit, taxes, payment-provider settlement fees, or bank deposits.
- PR #7's refund provider integration itself requires staging reconciliation.
  No actual payment processing or tests were executed in this GitHub-only PR.
