# Unpaid-order expiry / external schedule (Vercel Hobby)

## Why this is needed
The checkout creates and reserves stock for online-payment orders immediately.
`UNPAID_ORDER_EXPIRY_MINUTES=60` is a BUSINESS TTL, not a timer: order
expiration can only happen when a job actually calls the endpoint.
Vercel Hobby restricts its native Cron schedule to **once per day**. The
existing `vercel.json` daily expiry schedule remains a fallback and **does
not guarantee a 60-minute release time**.

## How to enable the 15-minute schedule
1. Merge this PR after staging tests. Scheduled GitHub Actions only run from
   the default branch. Workflows in draft PRs do NOT run automatically.
2. On the repository, set **Actions variable** `TECH_STORE_BASE_URL` to your
   HTTPS production origin, e.g. `https://shop.example.com` (no path/query).
3. Set **Actions secret** `CRON_SECRET` to the SAME unpredictable secret as
   the deployment's server-side environment variable `CRON_SECRET`.
4. Ensure Actions is enabled and runner provisioning/billing/quotas are healthy.
   The previous quality-gate workflows failed before receiving runners.
5. Run `unpaid-order-expiry.yml` manually (`workflow_dispatch`) and verify
   it receives HTTP 200; check Vercel logs for counted checked/cancelled/failed.
   Then monitor actual scheduled runs, ideally add failure notifications.
6. Optionally switch to Vercel Pro with an every-15-minute Vercel Cron entry
   instead. DO NOT put frequent Cron expressions in `vercel.json` on Hobby:
   deployment would fail.

The GitHub schedule attempts every 15 minutes (at :07, :22, :37, :52).
GitHub Actions is **best effort** and can delay/skip executions; it does not
guarantee order expiration within 75 minutes. If scheduler reliability is
contractual, use a dedicated managed scheduler / Vercel Pro.

## Endpoint correctness changes
- Queries a bounded batch (25) of old PENDING online orders only; never COD.
- The shared cancellation service locks the parent Order row and reloads its
  current Payment, items, coupon, and loyalty state. If payment succeeded or
  expired boundary changed, it skips without restocking.
- The Paymob webhook locks Order before Payment to avoid update races.
- A *late* signed Paymob success after cancellation or manual FAILED payment
  updates the payment record to PAID; it does NOT revive a cancelled order.
  Such orders REQUIRE MANUAL REFUND / FINANCIAL RECONCILIATION. We deliberately
  cannot assume an online checkout's payment authorization expired as soon
  as our order's local reservation expired.
- Manual staff mark-paid and mark-failed actions use the same Order-first
  locking protocol and revalidate state; mark-failed no longer cancels shipped
  COD or paid orders.
- The response returns `checked/cancelled/skipped/failed/backlogMayRemain`.
  HTTP 503 on per-order failures lets external monitoring spot broken runs.

## REQUIRED QA
```bash
npm ci
npm run typecheck
npm run lint
npm run test:expiry
```
Test with real Postgres in parallel: Paymob success vs cron cancellation,
two concurrent cron calls, duplicate mark-failed calls, COD and PAID guard,
and late signed success after expiry. Verify stock adjustments and loyalty
restoration happen **once**, not twice. Validate that two API calls holding
the same order do not deadlock. Test the 503 case and if an expired order
continually fails the transaction.

## Residual constraints
- In-flight successful provider payments not yet reported to us can still
  complete AFTER local expiration; the webhook records those as captured
  money on a cancelled order, requiring a separate refund/reconciliation.
- Provider-intention expiration/cancellation requires Paymob API integration;
  this PR does not cancel payment intentions or move customer funds.
- Large backlogs may require manual repeated invocations because each run is
  bounded to 25 orders. Monitor `backlogMayRemain` and age of oldest pending.
- The existing GitHub Actions runner-provisioning issue is not fixed by
  writing another workflow. NO scheduled execution, DB integration test,
  or deployed webhook test has been performed by this PR.
