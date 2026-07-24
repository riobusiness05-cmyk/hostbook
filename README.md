# Host Flow AI — Booking App (resellable template)

An AI-chatbot-driven reservation system for independent restaurants and bars. Guests can book, reschedule, or
cancel a table by chatting with an AI host (or using a traditional form) on your client's website. Restaurant
staff manage everything — reservations, hours, tables, menu, FAQs — from a password-protected admin dashboard.

This is a **template**: you customize and deploy one instance per client (see "Selling this to a new client"
below), not a shared multi-tenant platform. The database schema is written so that migrating to a true
multi-tenant SaaS later is a consolidation, not a rewrite — see the "Why one instance per client" note at the
bottom.

## Stack

- **Next.js 14** (App Router, TypeScript) — frontend, admin dashboard, and API routes all in one app.
- **Prisma + SQLite** for local dev (zero setup). Swap to **Postgres/Supabase** for production with one env
  var change (see "Going to production" below).
- **Claude API** (`@anthropic-ai/sdk`) — powers the AI chat host.
- **Tailwind CSS** for styling.
- Hooks for **Twilio** (SMS) and **Resend** (email) confirmations — wiring instructions below, not wired by
  default.

## Quick start (local dev)

```bash
npm install
npm run db:push      # creates the SQLite database from prisma/schema.prisma
npm run db:seed      # seeds a demo restaurant ("Hook & Anchor") so the app is usable immediately
npm run dev
```

Then open http://localhost:3000 — you'll see the demo restaurant's booking page with the chat widget in the
bottom-right corner.

Admin dashboard: http://localhost:3000/admin/login

A `.env` file is already included with working defaults (SQLite DB, a generated session secret, demo admin
login `owner@example.com` / `changeme123`). **You only need to add one thing to make the AI chat work:**

1. Get an API key at https://console.anthropic.com
2. Open `.env` and set `ANTHROPIC_API_KEY="sk-ant-..."`
3. Restart `npm run dev`

Without a key, the booking form and admin dashboard work fully — only the AI chat widget will show an error
until the key is set.

**Important:** `.env` contains secrets (API keys, admin password, session secret). It's already in
`.gitignore` — never commit it or share it outside your own machine/deploy target.

## What's in the box

- **Public booking page** (`/`) — hours, menu highlights, FAQs, a traditional booking form, and the AI chat
  widget. This is what you point a client's domain/subdomain at, or embed on their existing site.
- **AI chatbot** — can check availability, book, look up, reschedule, and cancel reservations, and answer
  questions about hours/menu/FAQs. It only ever uses what's in the database — it never invents menu items,
  prices, or availability.
- **Admin dashboard** (`/admin`) — reservations list with status management, and a settings area covering
  restaurant profile, opening hours, tables, blocked dates/private events, FAQs, and menu. Everything you edit
  here changes what the chatbot knows and says immediately, no redeploy needed.
- **Reservation engine** (`src/lib/availability.ts`) — the single source of truth for "is this table, at this
  time, for this many people, available?" Both the chat widget and the plain booking form call the same logic,
  so they can never disagree.

## Host Flow SaaS billing

On top of the per-client template above, the `/hostflow` product (the multi-tenant Host Flow floor-management
app — see `src/app/host/`, `src/app/hostflow/`) has a full Stripe subscription layer:

- **Plans** live in the `Plan` table (`prisma/schema.prisma`) — seeded with one "Professional" plan
  ($100/mo). Add more rows (with `stripeMonthlyPriceId`/`stripeAnnualPriceId` set once you've created the
  corresponding Prices in Stripe) to launch new tiers; nothing in the application code is hardcoded to a
  specific plan.
- **Subscriptions** (`Subscription` table) track each restaurant's status —
  `COMPLIMENTARY | TRIAL | ACTIVE | PAST_DUE | CANCELLED | EXPIRED` — plus trial dates and Stripe IDs. All
  reads/writes go through `src/lib/billing/subscription.ts` (`getBillingState`, `hasAccess`, `startTrial`,
  `grantComplimentary`, `convertComplimentaryToPaid`, `extendTrial`, `suspendSubscription`,
  `reactivateSubscription`) — that module is the single source of truth.
- **Self-serve signup**: `/hostflow/signup` → `POST /api/hostflow/register` creates the restaurant, an OWNER
  account, and a 30-day trial, then logs the owner straight into `/host`.
- **Billing dashboard**: each restaurant's `/host/settings` page shows plan/status/trial countdown, and lets
  the owner start Stripe Checkout or open the Stripe Billing Portal.
- **Platform admin**: `/hostflow/admin` (same login as `/admin`, i.e. your `ADMIN_EMAIL`/`ADMIN_PASSWORD`) —
  cross-restaurant view of every subscription, MRR, and one-click actions (extend trial, grant/convert
  complimentary, suspend/reactivate).
- **Complimentary accounts** (e.g. The Colonial) get full access and are never charged — granted via
  `grantComplimentary()`, the same reusable function the platform admin panel calls, so any restaurant can be
  comped, not just one hardcoded tenant.

**Turning on billing for real:**

1. Create a Stripe account (or use an existing one) and grab your **test-mode** keys from
   https://dashboard.stripe.com/test/apikeys.
2. Create a Product + a recurring monthly Price in the Stripe dashboard for "Professional", then set
   `stripeProductId`/`stripeMonthlyPriceId` on that `Plan` row (via `prisma studio`, or update `prisma/seed.ts`
   and re-seed).
3. Set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` in `.env`.
4. Run `stripe listen --forward-to localhost:3000/api/stripe/webhook` locally (Stripe CLI) and copy the
   printed signing secret into `STRIPE_WEBHOOK_SECRET`. In production, create a webhook endpoint in the Stripe
   dashboard pointed at `https://yourdomain.com/api/stripe/webhook` instead.
5. Restart `npm run dev`. Checkout and the Billing Portal now work for real; until then, the Billing page shows
   a clear "not configured" state instead of erroring.
6. **Launching to the public**: new signups already start on a real trial — there's nothing to "switch on."
   The only thing to change when you're ready to stop offering complimentary access to new restaurants is to
   stop calling `grantComplimentary()` for them (i.e. just don't check that box in the platform admin panel);
   existing complimentary accounts are unaffected.
7. Optional: wire `POST /api/cron/reconcile-billing` (guarded by `CRON_SECRET`) to a daily scheduler (Vercel
   Cron, etc.) so lapsed trials flip to `EXPIRED` even for restaurants that never log back in — the app already
   resolves trial expiry correctly on every request either way, this just keeps the stored value in sync too.

## Selling this to a new client

Because this is a template deployed one-instance-per-client, onboarding client #2 is config, not code:

1. Copy this project folder (or `git clone` your own template repo) into a new project.
2. Create a fresh database for them (a new `dev.db` for testing, or a new Postgres database for production —
   see "Going to production").
3. Open `prisma/seed.ts` and replace the demo restaurant's details (name, tagline, address, phone, brand
   color, welcome message, hours, tables, FAQs, menu) with the client's real information. This is normally a
   30–60 minute data-entry job — the fastest way to fill it in is to ask the client for their hours/menu/FAQs
   during onboarding (see your Host Flow AI project's client questionnaire).
4. Set `NEXT_PUBLIC_RESTAURANT_SLUG` in `.env` to a new unique slug for this client (e.g. `"joes-bar-nyc"`).
5. Run `npm run db:push && npm run db:seed`.
6. Set a unique `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` for this client in `.env`.
7. Deploy (see below) under the client's own domain/subdomain, or hand them the URL to embed.
8. Get their own `ANTHROPIC_API_KEY` set (either their own Anthropic account, billed to them, or your own key
   with usage priced into their monthly fee — decide this per your pricing model).

Everything after step 3 the client can also self-serve going forward through the admin dashboard (hours,
menu, FAQs, blocked dates) — you don't need to touch code again for routine updates.

## Going to production

**Database:** swap SQLite for Postgres (Supabase is the easiest managed option — free tier is enough for one
client's traffic).

1. In `prisma/schema.prisma`, change:
   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
2. In `.env` / your hosting provider's env vars, set `DATABASE_URL` to your Postgres connection string.
3. Run `npm run db:push && npm run db:seed` against the new database.

**Hosting:** Vercel is the path of least resistance for a Next.js app — connect the repo, set the same env
vars from `.env` in the Vercel project settings, deploy. Any Node host works too (`npm run build && npm run
start`).

**Timezone:** the reservation engine works in the server process's local time (no timezone-conversion
library, to keep the template dependency-light). Set the `TZ` environment variable on your host to the
restaurant's timezone (e.g. `TZ=Atlantic/Canary`) so "5pm" in the admin dashboard means 5pm at the restaurant,
not 5pm UTC.

## Notifications (SMS / email confirmations)

Not wired by default — this is the highest-value upsell to add per client (reduces no-shows). Hook points are
marked with `// Hook point:` comments in:

- `src/app/api/reservations/route.ts` (POST — form/API bookings)
- `src/lib/reservationActions.ts` → `createReservationForRestaurant` (chat bookings go through here too)

To wire up:

- **SMS (Twilio):** `npm install twilio`, use `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER`
  from `.env`, send from the hook point using `customerPhone`.
- **Email (Resend):** `npm install resend`, use `RESEND_API_KEY` / `RESEND_FROM_EMAIL`, send from the hook
  point using `customerEmail`.

Both env vars are already in `.env.example` — just uncomment/fill and add the send calls.

## Extending the chatbot

The bot's capabilities live in two places in `src/lib/claude.ts`:

- The `tools` array defines what the model *can* call (check availability, book, find/cancel/reschedule).
- `executeTool()` is the switch statement that actually runs each tool.

To add a capability (e.g. "add me to the waitlist" or "text me the menu"), add a new entry to `tools` with a
JSON schema for its inputs, then add a `case` in `executeTool()`. The system prompt (`buildSystemPrompt()`) is
rebuilt from the database on every request, so hours/menu/FAQ edits in the admin dashboard take effect
immediately without a code change or redeploy.

## Security notes (read before going live with a real client)

- Admin auth is a single email/password pair per instance (from `.env`), checked in plaintext against the env
  var and signed into an HMAC cookie — intentionally minimal for a single-owner admin panel. If you build the
  true multi-tenant SaaS version with multiple staff logins, replace this with real per-user auth (e.g.
  NextAuth or Supabase Auth).
- Rotate `ADMIN_SESSION_SECRET` and set a strong `ADMIN_PASSWORD` per client before going live — the values in
  the included `.env` are local-dev placeholders only.
- The public `/api/reservations` POST endpoint and `/api/chat` endpoint are intentionally unauthenticated
  (guests need to book without logging in) — they're rate-limit-worthy in production if you expect abuse;
  consider adding rate limiting (e.g. via your hosting provider or a library like `@upstash/ratelimit`) before
  scaling up traffic.

## Why one instance per client (not multi-tenant from day one)

Every business-data model in `prisma/schema.prisma` is scoped by `restaurantId`, even though this template
runs one restaurant per deployment. That's deliberate: it means that once you have several clients running
and know what actually needs to be shared/generalized, you can consolidate multiple single-tenant databases
into one multi-tenant platform (resolving "the active restaurant" by subdomain instead of an env var) without
a schema rewrite — just a change to `src/lib/restaurant.ts`. Building the shared platform before you have
paying clients means guessing at requirements; this template lets you sell first and generalize later.
