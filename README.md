# Tech Store

A full-stack bilingual (EN/AR) e-commerce platform built to demonstrate production-grade full-stack architecture: authentication & RBAC, cart/wishlist, checkout with atomic stock handling, a payment/shipment state machine, verified-purchase reviews, product image galleries, a homepage slider, and a full admin dashboard.

## Tech Stack

| Layer      | Technology                                            |
| ---------- | ----------------------------------------------------- |
| Framework  | Next.js 16 (App Router)                               |
| Language   | TypeScript                                            |
| Database   | PostgreSQL                                            |
| ORM        | Prisma 7 (driver adapters, `@prisma/adapter-pg`)      |
| Auth       | Auth.js v5 (Google OAuth + Credentials, JWT sessions) |
| Styling    | Tailwind CSS v4                                       |
| Validation | Zod                                                   |

## Features

- **Catalog** — categories (with hierarchy), brands, products with option/value/variant support (e.g. size × color)
- **Product Images** — admin-managed gallery per product (`/admin/products/[id]/edit`): upload via Cloudinary, reorder, set primary, delete — first image auto-promotes to primary, and deleting the primary auto-promotes the next one, since storefront cards/cart/wishlist only ever query the primary image
- **Storefront gallery** — product detail page shows the primary image large with a clickable thumbnail strip for the rest
- **Homepage Slider** — admin-managed image carousel (`/admin/sliders`): each slide has an optional link (internal path or external URL); a slide with no link renders as a plain, non-clickable image. Responsive crossfade carousel, auto-advances every 5s, pauses on hover/focus
- **Auth & RBAC** — Google OAuth + email/password, JWT sessions, admin-only routes enforced in `proxy.ts` (Next.js 16's middleware convention)
- **Cart & Wishlist** — IDOR-protected, optimistic UI updates
- **Checkout** — atomic stock decrement via Prisma transactions, coupon validation, live Bosta-backed shipping cost (see Shipping section)
- **Orders** — payment/shipment state machine with guarded transitions (`canTransitionOrder`, `canTransitionPayment`, `canTransitionShipment`)
- **Reviews** — five-condition verified-purchase check before a review is allowed
- **Admin dashboard** — full CRUD for products (incl. images), categories, brands, options, values, variants, shipping rates, and the homepage slider

## Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) PostgreSQL database
- A Google Cloud OAuth Client (for Google sign-in)

## Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your env file (see table below) then fill in the values
cp env.example .env
# On Windows PowerShell, use: Copy-Item -LiteralPath env.example -Destination .env
# Configure both database URLs, AUTH_SECRET, and SEED_PASSWORD before continuing.

# 3. Generate the Prisma client (required — app/generated/prisma is gitignored)
npx prisma generate

# 4. Run migrations against your database
npx prisma migrate dev

# 5. Seed demo data (optional but recommended)
npx prisma db seed

# 6. Start the dev server
npm run dev
```

App runs at `http://localhost:3000`.

Use the two connection strings for the same Neon branch. The application URL is
pooled for serverless traffic; the Prisma CLI URL is direct because schema
operations require session-level database behavior:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@ENDPOINT-pooler.REGION.aws.neon.tech/neondb?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://USER:PASSWORD@ENDPOINT.REGION.aws.neon.tech/neondb?sslmode=require"
```

Copy both values from the Neon **Connect** dialog and URL-encode any special
characters in the password. If Prisma reports database `placeholder`, neither
database variable is available and the config is using its generation-only
fallback. `prisma generate` can succeed without a database connection, but
migrations and the app need a real database.

Set `SEED_PASSWORD` to the password you want when creating demo accounts. Seeding
creates missing demo records and preserves existing accounts, passwords, stock,
products, coupons, and orders. It is safe to run again on a populated database;
the old `ALLOW_DESTRUCTIVE_SEED` setting no longer enables deletion.

Use `.env` (with the leading dot). A file named `env` is not loaded by Prisma.
For a hosted database, use `sslmode=verify-full` to make certificate verification
explicit and avoid the PostgreSQL driver's deprecated SSL alias warning.

> **Windows note:** if you ever recreate folders with bracket names (e.g. `[id]`), use `New-Item -ItemType Directory -LiteralPath "app\api\products\[id]"` — plain PowerShell paths misinterpret `[id]` as a wildcard.

## Environment Variables

| Variable                       | Description                                                                                          | Example                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `DATABASE_URL`                 | Pooled Neon connection used by the application                                                       | hostname contains `-pooler`                       |
| `DATABASE_URL_UNPOOLED`        | Direct Neon connection used by Prisma CLI commands and migrations                                    | hostname does not contain `-pooler`                |
| `AUTH_SECRET`                  | Encrypts Auth.js JWTs/cookies. **Must be named `AUTH_SECRET`**, not `BETTER_AUTH_SECRET`             | generate below                                    |
| `SEED_PASSWORD`                | Password used only when creating missing demo accounts; existing passwords are preserved          | choose a private password                         |
| `AUTH_GOOGLE_ID`               | Google OAuth Client ID                                                                               | from Google Cloud Console                         |
| `AUTH_GOOGLE_SECRET`           | Google OAuth Client Secret                                                                           | from Google Cloud Console                         |
| `BOSTA_API_KEY`                | Bosta business API key                                                                               | from business.bosta.co → API settings             |
| `BOSTA_BASE_URL`               | Bosta API base URL (optional, defaults to production; must match the API key's environment)           | `https://app.bosta.co`; staging requires a staging key |
| `BOSTA_WEBHOOK_SECRET`         | Your own secret — set as the custom Authorization header value in Bosta's webhook dashboard settings | any random string                                 |
| `PAYMOB_SECRET_KEY`            | Paymob secret key (starts `skl_`)                                                                    | from Paymob dashboard → Developers                |
| `PAYMOB_PUBLIC_KEY`            | Paymob public key (starts `pk_`)                                                                     | from Paymob dashboard → Developers                |
| `PAYMOB_HMAC_SECRET`           | Used to verify the payment webhook is genuinely from Paymob                                          | from Paymob dashboard → Developers                |
| `PAYMOB_INTEGRATION_ID_CARD`   | Integration ID for the card payment method                                                           | from Paymob dashboard → Payment Integrations      |
| `PAYMOB_INTEGRATION_ID_WALLET` | Integration ID for mobile wallets (e.g. Vodafone Cash)                                               | from Paymob dashboard → Payment Integrations      |
| `PAYMOB_BASE_URL`              | Paymob API base URL (optional, defaults to `https://accept.paymob.com`)                              | sandbox URL for testing                           |
| `CLOUDINARY_CLOUD_NAME`        | Cloudinary cloud name                                                                                | from Cloudinary dashboard                         |
| `CLOUDINARY_API_KEY`           | Cloudinary API key                                                                                   | from Cloudinary dashboard                         |
| `CLOUDINARY_API_SECRET`        | Cloudinary API secret — never exposed to the browser                                                 | from Cloudinary dashboard                         |
| `FREE_SHIPPING_THRESHOLD`      | Subtotal (EGP) at/above which shipping is free (optional, default `3000`)                            | `3000`                                            |
| `DEFAULT_SHIPPING_FEE`         | Fallback flat fee (EGP) if a governorate has no `ShippingRate` row yet (optional, default `75`)      | `75`                                              |

An up-to-date `env.example` with all of the above (verified against actual `process.env.*` references in the code, not just this table) lives in the project root.

Generate `AUTH_SECRET` (works the same in PowerShell, bash, or macOS):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

For Google OAuth, set the authorized redirect URI in Google Cloud Console to:

- Local: `http://localhost:3000/api/auth/callback/google`
- Production: `https://<your-domain>/api/auth/callback/google`

## Demo Accounts (after seeding)

| Role     | Email                 | Password      |
| -------- | --------------------- | ------------- |
| Admin    | `admin@techstore.com` | your `SEED_PASSWORD` |
| Customer | `ahmed@example.com`   | your `SEED_PASSWORD` |

Coupon code: `WELCOME10`

The password above applies to accounts created by the seed. Running it again
does not reset passwords on existing accounts.

## NPM Scripts

| Command                  | Purpose                          |
| ------------------------ | -------------------------------- |
| `npm run dev`            | Start local dev server           |
| `npm run build`          | Production build                 |
| `npm run start`          | Run the production build         |
| `npm run lint`           | Run ESLint                       |
| `npx prisma studio`      | Browse the database visually     |
| `npx prisma migrate dev` | Create/apply a migration locally |
| `npx prisma db seed`     | Re-run the seed script           |

## Deploying to the Cloud (Neon + Vercel)

**One-time prep — before your first deploy:**

The existing `postinstall` hook regenerates the Prisma client during dependency
installation, including on Vercel:

```jsonc
// package.json
"scripts": {
  "postinstall": "prisma generate",
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint"
}
```

**1. Create the database (Neon)**

```bash
# Install Neon's CLI (one-time)
npm install -g neon

# Log in and create a project
neon auth
neon project create --name tech-store

# Link the project and pull DATABASE_URL plus DATABASE_URL_UNPOOLED
neon link --project-id <project-id> -y
neon env pull
```

> Prefer the web UI? Create a project at [console.neon.tech](https://console.neon.tech), then copy the **pooled** connection string — Vercel's serverless functions open many short-lived connections, and the pooled endpoint avoids exhausting Postgres's connection limit. (Supabase works the same way: use its "Transaction" pooler connection string, port `6543`.)

**2. Apply your schema to the cloud database**

```bash
# macOS/Linux — Prisma reads the direct URL from DATABASE_URL_UNPOOLED
DATABASE_URL_UNPOOLED="<your-neon-direct-url>" npx prisma migrate deploy

# Windows PowerShell
$env:DATABASE_URL_UNPOOLED="<your-neon-direct-url>"; npx prisma migrate deploy

# Optional: seed demo data into the cloud DB too (PowerShell)
$env:DATABASE_URL="<your-neon-pooled-url>"; npx prisma db seed
```

**3. Deploy to Vercel**

```bash
npm install -g vercel

vercel login
vercel link          # links this folder to a Vercel project

# Add each env var (repeat for every variable in the table above)
vercel env add DATABASE_URL production
vercel env add DATABASE_URL_UNPOOLED production
vercel env add AUTH_SECRET production
vercel env add AUTH_GOOGLE_ID production
vercel env add AUTH_GOOGLE_SECRET production

# Ship it
vercel --prod
```

After the first deploy, update the Google OAuth redirect URI to your live `*.vercel.app` (or custom) domain.

## Payments — Paymob Integration

Card and mobile wallet payments go through [Paymob](https://accept.paymob.com) (Intention API + Unified Checkout). Cash on Delivery skips this entirely.

- Checkout creates the order, then starts a Paymob payment intention and redirects the customer to Paymob's hosted checkout page.
- Paymob calls back `POST /api/webhooks/paymob?hmac=...` when payment succeeds or fails — the handler verifies the HMAC signature before touching the database (fields/order documented in `lib/paymob.ts`, sourced from Paymob's own official AI-integration reference, not guessed).
- If a customer abandons the Paymob page or the intention fails to create, the order stays `PENDING` and a **"Complete Payment"** button appears on `/orders/[id]` to generate a fresh payment link — Paymob's `client_secret` is single-use.
- Admin's "Mark Payment Paid/Failed" buttons are now a manual override/reconciliation tool (e.g. a webhook got lost), not the primary path.
- This store is Egypt-only for now — the country code sent to Paymob (`EGY`) is hardcoded in `lib/paymob.ts`.

## Shipping — Bosta Integration

Shipments are booked automatically through [Bosta](https://business.bosta.co) instead of manual carrier entry.

- Shipping cost is calculated before checkout via a `ShippingRate` table (per-governorate, admin-managed at `/admin/shipping-rates`). Free shipping over `FREE_SHIPPING_THRESHOLD` EGP (default 3000), shown to the customer on the checkout page.
- Bosta's location model has three real tiers — City → Zone → District — not two. Checkout has three cascading dropdowns (governorate/area/district), all backed by live Bosta data (`/api/bosta/cities`, `/zones`, `/districts`), and the real `districtId` gets cached on the Address/Order so "Ship with Bosta" never has to re-resolve by name.
- Admin clicks **"Ship with Bosta"** on an order → we call `POST https://app.bosta.co/api/v2/deliveries?apiVersion=1` and store the returned `trackingNumber`/`bostaDeliveryId`.
- Configure `BOSTA_API_KEY` and `BOSTA_BASE_URL` in `.env` (Next.js does not load the file named `env`). Keys from the production dashboard use `https://app.bosta.co`; `https://stg-app.bosta.co` requires a separate staging key. If shipping returns **"Invalid authorization token or API key"**, check this pairing first, then verify the key is enabled. Successful location dropdowns do not confirm that the key can create deliveries. Use Read/Write access for creation, or Full Access for creation and cancellation, and restart `npm run dev` after changing `.env`. See [Bosta's API key guide](https://docs.bosta.co/docs/how-to/get-your-api-key/).
- Register your webhook **once** in the Bosta dashboard (Settings → API Integration → Request OTP → Set Up Your Webhook), not per-delivery: URL `https://<your-domain>/api/webhooks/bosta`, plus a custom Authorization header — set its value to your `BOSTA_WEBHOOK_SECRET` (our handler reads it from the `x-webhook-secret` request header).
- Cancelling an order in the admin also attempts to cancel the Bosta delivery (best-effort — won't block cancellation if Bosta rejects it, e.g. already picked up).
- The delivery address only sends a plain `city` name (e.g. "Cairo") — Bosta validates it server-side and returns a clear error if it doesn't match. For more precise routing you can add `zoneId`/`districtId` in `lib/bosta.ts` once you've downloaded Bosta's zoning sheet (linked from [docs.bosta.co/docs/how-to/format-bosta-address](https://docs.bosta.co/docs/how-to/format-bosta-address)) — not required, `city` alone satisfies their API.

## Unpaid Order Expiry

Card/wallet orders reserve stock immediately at checkout, before payment succeeds. If a customer abandons the Paymob page, nothing used to release that stock.

- `GET /api/cron/expire-unpaid-orders` cancels any online-payment order (not Cash on Delivery) still `PENDING` after `UNPAID_ORDER_EXPIRY_MINUTES` (default 60), restores its stock, and releases any coupon it used — same logic as a normal cancel.
- Scheduled via `vercel.json` (every 15 minutes). Vercel calls it with `Authorization: Bearer <CRON_SECRET>`; set `CRON_SECRET` in your environment or the route refuses every request (including Vercel's own).
- Running locally or on another host: call this route yourself on a schedule (cron, GitHub Actions, etc.) with the same header.

## Known Gotchas (learned the hard way)

- `app/generated/prisma` must be regenerated with `npx prisma generate` any time `app/` is replaced or after a fresh clone.
- Use `AUTH_SECRET` — using `BETTER_AUTH_SECRET` causes a persistent `MissingSecret` error.
- `@relation` attributes in `schema.prisma` must stay single-line; multi-line breaks the parser.
- Next.js 16 renamed `middleware.ts` → `proxy.ts` with a named `proxy` export (already done here).
- `typedRoutes: false` in `next.config.ts` avoids false-positive type errors on dynamic `href` template literals.
- Prisma 7 does **not** auto-run seeds on `migrate dev`/`migrate deploy` — always run `npx prisma db seed` explicitly.
- **Migration history drift:** `prisma migrate status`/`migrate dev` trust the `_prisma_migrations` table in the real database, not `schema.prisma` directly. If two migration folders end up describing the same schema change, trust whichever one `migrate status` shows as actually recorded/applied in the DB — not whichever has the earlier timestamp in its folder name. Deleting the wrong one produces a drift error whose only offered fix is `migrate reset` (which drops all data) — don't run that; restore the correct migration file instead.
- **Windows PowerShell + `Set-Content -Encoding utf8`** silently prepends a UTF-8 BOM. This breaks Postgres's SQL parser during Prisma's shadow-database migration checks (`syntax error at or near ""`). Use `-Encoding ascii` for pure-ASCII SQL files, or `[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $false))` for files that need real Unicode characters.
