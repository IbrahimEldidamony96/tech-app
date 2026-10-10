Tech Store — full project (post-review)
=========================================

This is the ENTIRE project as of the end of our conversation — not a
patch, the whole thing. 245 files, node_modules and .next excluded
(standard practice; see setup below).

WHAT'S IN HERE
----------------
- All 6 critical + all 10 medium issues from the code review, fixed
  and tested (see chat for full before/after evidence on each)
- NEW this round, by request:
  - Full (Postgres-backed, cross-instance-safe) rate limiting,
    replacing the earlier in-memory version
  - Email verification (sent on registration, confirm link, resend)
  - Password reset (forgot-password -> email -> reset-password)
  - New Prisma models: VerificationToken, RateLimitBucket (migration
    included: prisma/migrations/20261003162147_add_verification_tokens_and_rate_limit)
  - Resend wired up as the email provider (lib/email.ts) — falls back
    to console-logging the email content if RESEND_API_KEY isn't set,
    so local dev works with zero email setup

SETUP (Windows PowerShell)
-----------------------------
This project uses [id] folders (Next.js dynamic routes). Extract
DIRECTLY onto a fresh location — don't try to Copy-Item individual
files out of it afterward; PowerShell's wildcard handling on square
brackets can silently skip them.

    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
    Expand-Archive -Path tech-store-main-full.zip -DestinationPath "C:\path\to\tech-store-main"
    cd C:\path\to\tech-store-main
    npm install
    Copy-Item -LiteralPath env.example -Destination .env
    # fill in .env with your real values (see README.md's Environment
    # Variables table — RESEND_API_KEY and CRON_SECRET are new)
    # DATABASE_URL must point to a running PostgreSQL database.
    # Set AUTH_SECRET and SEED_PASSWORD before continuing.
    # Seeding adds missing demo records; reruns preserve existing data.
    npx prisma generate
    npx prisma migrate dev
    npx prisma db seed
    npm run dev

NEW ENV VARS (all optional except noted)
-------------------------------------------
- CRON_SECRET            required for the unpaid-order expiry job to run
- UNPAID_ORDER_EXPIRY_MINUTES   default 60
- APP_URL                leave unset on Vercel
- RESEND_API_KEY         unset = emails log to console instead of sending
- RESEND_FROM_EMAIL      default: Tech Store <onboarding@resend.dev>

Full details, including everything deliberately deferred and why,
are in the conversation itself.
