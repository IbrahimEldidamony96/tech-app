# Existing guest order access: secure migration

New guest checkout is already disabled and remains disabled in this PR.
Historical orders that already have `guestAccessTokenHash` are preserved and
remain accessible without requiring a registered account.

## Threat model and migration

Previously, `GET /api/guest-orders/:id?token=...` accepted a reusable bearer
token from the query string and returned the *entire* Prisma order, including
payment/shipment records and shipping PII. The client also copied bearer tokens
to unencrypted `localStorage`. These tokens leak through logs, shared links,
browser history, injected JavaScript and sometimes Referrer headers.

The new flow:
1. The page `/guest-orders/:id` reads an existing legacy token from the
   initial `?token=` link or old `guestOrderToken:<id>` localStorage key.
   It immediately removes the query parameter via history.replaceState and
   permanently clears the localStorage entry. No future link is generated
   containing a raw token.
2. The browser `POST`s `{token}` in the JSON body to
   `/api/guest-orders/:id` (same-origin only). The API checks the active
   order's stored SHA-256 token hash in constant time and rate limits token
   exchanges by IP/order.
3. The server sets a `HttpOnly`, `SameSite=Strict`, short-lived,
   per-order cookie. The cookie contains a nonce, expiry and an AUTH_SECRET
   HMAC binding it to that order ID **and the current stored token hash**.
   It does not contain the bearer token. The cookie is Secure on production
   HTTPS, expires within 15 minutes and is sent only to this order's API
   path. Rotating AUTH_SECRET or changing/removing the order's hash revokes it.
4. Subsequent GETs use ONLY the cookie, never a URL token. Response selects
   only order status, total, safe item names and status-event titles; no
   shipping PII, provider transaction identifiers or token hashes.
   No-store and no-referrer headers prevent accidental caching/leakage.
5. The guest can also paste their original token into a password-style
   field if the cookie expires. The token is never saved to localStorage.

## Test and deploy

```bash
npm ci
npm run typecheck
npm run lint
npm run test:guest-orders
```

Staging scenarios: valid historical token in original link, old localStorage
token, manually entered token, invalid token, missing/expired cookie, second
order ID, deleted guest token hash, owner-attached order, rate limits, wrong
Origin, no secret, and returning only whitelisted response fields. Confirm
cookie flags using browser developer tools and verify no query token appears
in GET URLs or API logs.

**Known constraints**:
- A historical link containing `?token=` is inherently disclosed to the
  initial request/edge logs before JavaScript can erase it. Referrer-Policy
  and immediate replaceState reduce new leakage but cannot undo old access
  logs. Consider a one-time customer support token rotation program for
  sensitive older orders.
- Tokens previously exposed to third parties remain usable for POST exchange
  until revoked/rotated. The only permanent revocation mechanism is clearing
  or changing `guestAccessTokenHash` on the order.
- This is an order-detail read-only session. It does not authorize paying,
  cancelling, editing or downloading invoices.
- No database migration, live deployment, penetration test, or full
  Auth.js/Prisma integration test was performed in this connector-only draft.
