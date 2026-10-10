# Tech Store — Code Review Fixes

Date: 2026-10-06

This copy is the reviewed/fixed version of the uploaded project.

## P0 fixes completed

1. **Double checkout protection**
   - Checkout now locks the user's `Cart` row with `FOR UPDATE` and reads cart items only after acquiring that lock.
   - Concurrent checkout requests for the same user can no longer create two orders from the same cart snapshot.
   - Variant locking order remains deterministic to reduce deadlock risk between different users.

2. **Paymob webhook vs cancellation race**
   - Successful Paymob callbacks update payment idempotently.
   - Order confirmation uses compare-and-set (`PENDING` -> `CONFIRMED`) inside the same transaction.
   - A cancelled order is never resurrected by a late webhook.
   - Paid-but-cancelled cases remain visible for manual refund/reconciliation.

3. **Prevent cancellation after payment without a refund flow**
   - `cancelOrderAndRestock()` refuses cancellation when `paymentStatus` is already `PAID`.
   - This prevents restoring stock while the payment remains captured.

4. **Bosta webhook idempotency / double restock**
   - Shipment transitions now acquire a row lock and re-read fresh order/shipment state inside the transaction.
   - Duplicate or concurrent `RETURNED` callbacks cannot restore stock or coupon usage twice.
   - Out-of-order webhooks cannot move shipment state backwards.

5. **Bosta shipment creation vs order cancellation**
   - Failed Bosta creation only restores `PROCESSING -> CONFIRMED` with compare-and-set.
   - After an external delivery is created, local shipment creation is allowed only while the order is still reserved as `PROCESSING`.
   - If the order changed/cancelled during the network call, a compensating Bosta cancellation is attempted instead of resurrecting the order.
   - Cancellation routes re-read the shipment after local cancellation so they do not miss a shipment created concurrently.

6. **Shipping-ID tampering protection**
   - Cached Bosta city IDs are validated against the address governorate.
   - Cached district IDs are validated against the resolved city/zone.
   - Checkout stores only validated Bosta IDs in the order snapshot.

## P1/P2 fixes completed

7. **Fresh admin authorization**
   - `requireAdmin()` now re-checks `role=ADMIN` and `deletedAt=null` in the database.
   - Demoting/deleting an admin takes effect immediately for sensitive server routes even if the JWT is still valid.

8. **Variant integrity**
   - Variant option values must exist, belong to the same product, be unique, and contain at most one value per option.
   - Nested variant/option/value routes verify the resource actually belongs to the parent IDs in the URL.

9. **Coupon PATCH integrity**
   - Percentage coupons cannot be changed to values over 100 even when `type` is omitted from PATCH.
   - Coupon expiry is validated against the effective start date after merging existing and patched data.

10. **Verification/reset token storage**
    - Raw bearer tokens are returned to the email flow but only SHA-256 hashes are stored in the database.
    - Older unused tokens of the same type are invalidated when a new one is issued.

11. **Email secret leakage**
    - Development email fallback no longer prints HTML/reset links to logs.
    - Production now fails if Resend is not configured instead of silently logging sensitive content.

12. **Seed safety**
    - Destructive seed refuses to run when users/products/orders already exist unless `ALLOW_DESTRUCTIVE_SEED=yes` is explicitly set.
    - `SEED_PASSWORD` is required; the predictable `password123` fallback was removed.
    - Resend and seed-related environment variables were documented in `env.example`.

13. **Category hierarchy**
    - Filtering by a parent/root category now includes products from all descendant categories.
    - Category updates prevent cycles, including moving a category under one of its descendants.

14. **Product price filtering display consistency**
    - The variant displayed for a price-filtered result now uses the same min/max price constraints used to match the product.

15. **Default-address concurrency**
    - Address mutations use a PostgreSQL advisory transaction lock per user.
    - Concurrent creates/updates/deletes cannot independently create multiple default addresses.

16. **External request timeouts**
    - Added request timeouts to Bosta, Paymob and Cloudinary outbound calls.

17. **App Router UX boundaries**
    - Added root `app/error.tsx`, `app/loading.tsx`, and `app/not-found.tsx`.

## Verification performed

- Static review of all modified files.
- TypeScript parser/syntax check of the modified TypeScript/TSX files found no TS1xxx syntax errors.
- A full dependency install was attempted so `next build` and ESLint could run, but package installation timed out in the execution environment before dependencies were complete.
- The partial `node_modules` directory created by that attempt is intentionally excluded from the delivered ZIP.

## Recommended next validation on your machine

```bash
npm ci
npx prisma generate
npm run lint
npm run build
```

Before running the seed, set a strong `SEED_PASSWORD`. Only set `ALLOW_DESTRUCTIVE_SEED=yes` on a database you intentionally want to wipe.
