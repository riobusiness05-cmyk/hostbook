# Host Flow — Project Handoff Notes

Status snapshot as of 2026-07-23. Written so a fresh chat (or a fresh person) can pick up without re-deriving context.

## What this repo is

Started as a single-tenant AI-chatbot booking template. On top of it, a full multi-tenant floor-management
platform called **Host Flow** was built at `/host` (marketing site at `/hostflow`), for a real restaurant,
**The Colonial** (Costa Adeje, Tenerife), plus a second seeded demo restaurant, **The Harbour**.

Stack: Next.js 14 (App Router, TypeScript), Prisma + SQLite (Postgres-portable), Tailwind CSS, SSE-based
realtime (deliberate substitution for Supabase Realtime, which can't be provisioned in this dev environment).

## Host Flow platform architecture (`/host`)

- **Multi-tenant model:** `Restaurant` (tenant root) → `Account` (per-restaurant staff login) → `hf_session`
  cookie (`src/lib/hostAuth.ts`), scoped per restaurant.
- **DB additions:** `Section`, `StaffMember`, floor-plan fields on `DiningTable` (x/y/width/height/shape/status/
  sectionId/serverId/mergedInto), `TableSession`, `Walkin`, `Notification`, `TableStatusHistory`,
  `RestaurantSettings`. `prisma/seed.ts` seeds a real 21-table floor plan across 4 sections (from user-provided
  photos of The Colonial) plus a live dinner-service snapshot relative to `now()`.
- **Realtime:** in-process event bus `src/lib/hostflow/events.ts`; every mutation calls `emitFloorChange`;
  `GET /api/host/stream` is an SSE endpoint; client hook `src/lib/host/useFloorStream.ts` refetches
  `/api/host/floor` on each change, with polling fallback. This is the single seam to swap for Postgres
  LISTEN/NOTIFY later.
- **Domain layer** (`src/lib/hostflow/`): `floor.ts` (single source of truth — `getFloorState`), `seating.ts`
  (smart table recommendation), `actions.ts` (all mutations), `assistant.ts` (grounded AI assistant —
  deterministic engine over the floor snapshot, optional Claude fallback).
- **UI** (`src/components/host/`), orchestrated by `HostApp.tsx`. Tailwind `darkMode:"class"`.
- Features shipped before the billing milestone: outdoor-wait queue, real Colonial floor plan, future-day
  dashboard toggle, future-reservation booking tab, and a full pre-launch QA pass (auth/multi-tenancy, floor &
  table actions, walk-ins/waitlist/bookings/day view, AI assistant, notifications, UI polish).

## SaaS billing infrastructure (completed 2026-07-23)

Full commercial-launch billing layer, built as an *extension* of the existing architecture (no redesign). See
the README's "Host Flow SaaS billing" section for the user-facing version of this.

**Database** — three new models in `prisma/schema.prisma` (Postgres-portable):
- `Plan` (key, name, monthlyPriceCents, annualPriceCents, stripe*Id fields, features as JSON string) —
  seeded with one "Professional" plan at $100/mo; nothing in app code is hardcoded to a single plan.
- `Subscription` (1:1 with `Restaurant`; status: `COMPLIMENTARY | TRIAL | ACTIVE | PAST_DUE | CANCELLED |
  EXPIRED`; trial dates; Stripe customer/subscription IDs; `isComplimentary`/`complimentaryReason`).
- `BillingEvent` (append-only audit log, idempotency-keyed on `stripeEventId`).
- `Account` gained `emailVerified` / `emailVerifyToken` / `emailVerifyExpiresAt`.

**Core modules:**
- `src/lib/stripe.ts` — Stripe client singleton, `getOrCreateStripeCustomer`, `createCheckoutSession`,
  `createBillingPortalSession`, `listRecentInvoices`, `mapStripeStatus`. Note: on Stripe SDK v22.3.2
  (`2026-06-24.dahlia`), `current_period_start/end` live on `SubscriptionItem`, not top-level `Subscription`.
- `src/lib/billing/subscription.ts` — single source of truth: `getBillingState`, `hasAccess`,
  `resolveEffectiveStatus` (lazy trial-expiry, computed on every read — no cron dependency), `startTrial`,
  `grantComplimentary` (the one reusable mechanism, works for any restaurant, not hardcoded to The Colonial),
  `convertComplimentaryToPaid`, `extendTrial`, `suspendSubscription`, `reactivateSubscription`.
  `TRIAL_DAYS = 30`, `DEFAULT_PLAN_KEY = "professional"`.
- `src/app/api/stripe/webhook/route.ts` — public, signature-verified, idempotent.
- `src/app/api/cron/reconcile-billing/route.ts` — bearer-guarded (`CRON_SECRET`) batch reconciliation job
  (belt-and-suspenders; the lazy per-request check already handles expiry correctly on its own).

**Access-gate placement (deliberate):** lives in `src/app/host/page.tsx` (redirects to
`/host/settings?blocked=1` if access has lapsed), **not** in `host/layout.tsx` — so a blocked restaurant can
still reach `/host/settings` to fix their subscription. Layout only checks the session.

**New user-facing surfaces:**
- `/hostflow/signup` + `POST /api/hostflow/register` — self-serve registration, starts a 30-day trial,
  best-effort Stripe customer + verification email, logs straight into `/host`.
- `/host/settings` + `BillingSection.tsx` — plan/status/trial gauge/checkout-or-portal/invoices.
- `/hostflow/admin` + `AdminDashboard.tsx` — cross-restaurant MRR/status table with per-row actions (extend
  trial, grant/convert complimentary, suspend/reactivate). Gated by the **legacy env-based admin session**
  (`ADMIN_EMAIL`/`ADMIN_PASSWORD`, same login as `/admin`) — same single-operator persona, new view.
- `src/app/api/platform/*` — thin admin-gated wrappers around `billing/subscription.ts`.

**Seed data:** The Colonial → `grantComplimentary(reason: "Early partner restaurant")`. The Harbour → ordinary
`TRIAL`, proving the paid path works without touching Colonial's code path.

**Verified end-to-end** via curl (deterministic API checks) + browser UI pass: signup → trial → dashboard
access → billing page → checkout/portal graceful-degradation (when Stripe isn't configured) → platform admin
actions → access-block/reactivate cycle → cross-tenant isolation.

## Live deployment (2026-07-24)

Deployed to Vercel for real-world phone testing at The Colonial: **https://hostflow-booking.vercel.app**

- **Hosting:** Vercel project `hostflow/hostflow-booking`, linked via `vercel link` (this repo is now also a
  local git repo — `git init` done 2026-07-24, no GitHub remote, deploys go straight from local via `vercel
  --prod`, not git-triggered).
- **Database:** switched from SQLite to Postgres (`prisma/schema.prisma` datasource provider is now
  `"postgresql"`) — a free Neon-backed Postgres DB created via Vercel's Storage tab and connected to the
  project, which auto-injected `DATABASE_URL` and friends as Vercel env vars.
- **Schema + seed:** pushed once via a temporary change to the `build` script (`prisma db push --accept-data-loss
  && tsx prisma/seed.ts && next build`) so it ran on Vercel's build servers, which have the real
  `DATABASE_URL` — my local sandbox cannot see that secret (see gotcha below), so this had to happen
  server-side. After the first successful deploy, the `seed` step was removed from `build` (kept only `prisma
  db push`) so future deploys don't re-wipe real data with demo data.
- **Env vars set on Vercel** (production + preview): `ANTHROPIC_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
  `ADMIN_SESSION_SECRET`, `NEXT_PUBLIC_RESTAURANT_SLUG`, `NEXT_PUBLIC_APP_URL` (set to the deployed URL above)
  — copied from local `.env`. `STRIPE_*` / `RESEND_API_KEY` / `CRON_SECRET` were left unset (still open, see
  below).
- **Verified live:** logged in as The Colonial (`colonial@hostflow.app` / `colonial123`) against production —
  full floor dashboard renders with real seeded data (41 covers, 21 tables, live metrics). The Harbour's login
  is `harbour@hostflow.app` / `harbour123`.
- **⚠️ Local dev is now broken on this Mac** until `.env`'s `DATABASE_URL` is updated: the schema provider is
  now `"postgresql"` project-wide (shared by local dev and prod — there's only one schema file), but the local
  `.env` still points at `file:./dev.db` (SQLite), which no longer matches. To fix: get the real Postgres
  connection string from the Vercel dashboard (Settings → Environment Variables → reveal `DATABASE_URL`) and
  paste it into local `.env`, replacing the `file:./dev.db` line — I can't safely fetch that value myself (see
  gotcha below). Until fixed, `npm run dev` will fail on any DB query.

## Still open (needs the user — I can't do these)

1. **Real Stripe test-mode keys** — `.env` has `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` /
   `STRIPE_WEBHOOK_SECRET` as empty placeholders. Until set, the Billing page shows a clean "not configured"
   state rather than erroring. Steps to turn it on for real are in the README.
2. **`RESEND_API_KEY`** — also empty; verification emails currently just log to console instead of sending.
   Registration is non-blocking on this (account works immediately either way).
3. **Local `.env` `DATABASE_URL`** needs updating to the real Postgres string (see the live-deployment section
   above) before `npm run dev` will work on this Mac again.

## Known dev-environment gotchas

- **No system Node on this Mac.** Portable Node v20.18.1 (darwin-arm64) lives at
  `/Users/riohernandez/.local/share/hostflow-tools/node-v20.18.1-darwin-arm64/bin`, referenced by
  `.claude/launch.json`. Export it onto `PATH` for any manual `npm`/`npx`/`node` command.
- **`.next` cache corruption:** running `next build` while a long-lived `next dev` server is active corrupts
  its webpack cache (`Cannot find module './XXXX.js'` errors on next page load). Fix: stop the dev server,
  `rm -rf .next`, restart it fresh. Never run a production build alongside the dev server.
- **Locale-pin hydration bug:** `Intl.NumberFormat(undefined, ...)` / `toLocaleDateString(undefined, ...)` can
  resolve different locales server (Node) vs client (browser) → hydration mismatch. Always pass an explicit
  locale (`"en-US"`). Already fixed in `BillingSection.tsx` and `AdminDashboard.tsx`.
- **Session token bug (fixed):** `src/lib/auth.ts` originally split the session cookie payload on `.` and
  broke for the default admin email `owner@example.com` (the dot in the address desynced the split). Fixed by
  parsing from the end (`pop()` signature, then expires, then join the rest as email).
- **Two-copy workflow:** `/Users/riohernandez/Downloads/hostflow-booking` (this repo) is the source of truth —
  all edits happen here. `/Users/riohernandez/Desktop/hostflow` is a saved mirror, only updated via
  `rsync -a --delete --exclude='.next' --exclude='tsconfig.tsbuildinfo'` when explicitly told "save it" /
  "save it all." Never treat the Desktop copy as editable.
- **Claude Code's sandbox redacts real secret values pulled from the network**, even into files on disk —
  confirmed when `vercel env pull` wrote a literal `"[SENSITIVE]"` placeholder into the `.env` file instead of
  the real `DATABASE_URL` (verified by measuring the string's byte length, not by trying to bypass the
  redaction). This is a deliberate safety boundary, not a bug — don't try to work around it. Any workflow that
  needs a real secret Vercel/another service generated (e.g. pointing local dev at the same Postgres DB as
  production) has to be done by the user directly in their own terminal or the provider's dashboard, not
  through Claude Code's Bash tool. Schema pushes/seeding against such a DB should instead run inside the
  provider's own build step (e.g. Vercel's build command), where the real env vars are available server-side.

## Full context

More detail (and the reasoning behind these decisions) is also stored in this session's persistent memory at
`/Users/riohernandez/.claude/projects/-Users-riohernandez-Downloads-hostflow-booking/memory/`, which
auto-loads into a fresh Claude Code chat in this project — this file is a human-readable mirror of the same
information for direct reference.
