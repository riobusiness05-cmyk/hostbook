# Host Flow — Project Handoff Notes

Status snapshot as of 2026-07-25. Written so a fresh chat (or a fresh person) can pick up without re-deriving context.

## SaaS production-readiness pass (2026-07-24)

The user asked for a large, 10-part "make it production ready for paying customers" push (Stripe subscriptions,
billing page, tenant isolation audit, blanket bug fixes, live table-status colors, reservation improvements,
performance, error handling, an admin settings page, and a final codebase audit). Two things up front:
**pricing conflict resolved** — the spec asked for $30/mo + 14-day trial; the already-live Professional plan
was $100/mo + 30-day trial. User chose to update the existing plan in place (not add a second plan) — see
below. **Scope honesty** — "fix every bug in the entire project" and "audit until production-ready" aren't
finishable as literal checkboxes; concrete, verified fixes were made and are listed below, and the audit was
NOT a blanket rewrite. What actually shipped:

- **Pricing/trial updated**: Professional plan → $30/mo (`prisma/seed.ts`), `TRIAL_DAYS` → 14
  (`src/lib/billing/subscription.ts`, the one constant every trial calculation already derived from).
- **Billing page**: added payment method display (new `getDefaultPaymentMethod` in `src/lib/stripe.ts`), "Next
  payment" date, and in-app Cancel/Resume buttons (`src/app/api/host/billing/cancel|resume/route.ts`) wiring
  the `cancelStripeSubscription`/`reactivateStripeSubscription` functions that already existed in `stripe.ts`
  but were previously unused — cancellation is always at period end (data/access kept, resumable), never
  immediate. `BillingState` gained `stripeSubscriptionId`, `canCancel`, `canResume`.
- **Two real race conditions fixed** (this satisfies both the "bug fixes" and "prevent double bookings" asks —
  they were the same underlying bug in two places):
  1. `seatParty`/`moveParty`/`mergeTables` in `src/lib/hostflow/actions.ts` did check-then-act without a lock —
     two concurrent requests could both pass the "is this table free" check before either write landed. Fixed
     with conditional `updateMany` (`WHERE status = 'AVAILABLE'`, check `count`) inside interactive
     transactions. Also fixed a real pre-existing gap: `mergeTables` never checked if the "other" table was
     already merged into something else.
  2. Guest-facing `createReservationForRestaurant`/`rescheduleReservationById` in `src/lib/reservationActions.ts`
     read availability then wrote separately, with no lock — two people could book the same slot at once. Fixed
     by running the read+write inside a **Serializable** transaction (`withSerializableRetry`, one retry on
     Postgres conflict code P2034) — this needs true serializable isolation, not just a conditional update,
     since it's a computed-aggregate/write-skew scenario, not a single-row check. `findAvailableTable` in
     `src/lib/availability.ts` now accepts an optional `db` (transaction client) param for this.
     **Caveat**: `isolationLevel: "Serializable"` is Postgres-only — if local dev is ever pointed at SQLite
     again, these two functions will throw. Not a production concern (production is Postgres), just don't run
     the booking flow against a local SQLite DB.
- **Large-party table combining**: `recommendSeating` in `src/lib/hostflow/seating.ts` only ever checked single
  tables. Added `findBestCombo` — when no single table fits, it finds the best pair of joinable, available
  tables in the same section and proposes merging them. Wired end-to-end: the walk-in "Seat best table" button
  and the AI assistant's "seat the next walk-in" command now auto-merge (reusing the existing `mergeTables`
  action) and seat in one step when only a combo works.
- **Host Flow settings page**: `/host/settings` is now a tabbed page (Billing / General / Hours / Tables) —
  `src/components/host/SettingsShell.tsx` owns the shared header/theme/tabs; `BillingSection.tsx` was refactored
  to drop its own page chrome and just render its cards. New tabs:
  - **General** (`GeneralSettings.tsx`) — wires the `/api/host/settings` PATCH endpoint and `settingsSchema`
    that already existed in the codebase but had **zero UI calling them** (confirmed dead-from-the-frontend
    during exploration). Also newly wired two settings that existed in the schema but were never read anywhere:
    `bookingWindowDays` (caps how far ahead guests can book — enforced in `availability.ts`) and
    `maxBookingsPer15Min` (a real kitchen/service-pacing cap — also enforced in `availability.ts`, independent
    of table availability). Added three new fields to `RestaurantSettings`: `depositPerPersonCents`,
    `serviceChargePct`, `cancellationPolicy` — these replace what used to be hardcoded text in the AI
    assistant's system prompt (`src/lib/claude.ts`) with real per-restaurant config.
  - **Hours** (`HoursSettings.tsx`) — new host-scoped opening-hours editor (`src/app/api/host/hours/route.ts`),
    mirroring the legacy `/api/admin/hours` pattern but gated on the Host Flow session instead of legacy admin
    auth. Host Flow had no hours editor at all before this.
  - **Tables** (`TableAvailabilitySettings.tsx`) — per-table active/out-of-service toggle
    (`src/app/api/host/tables/route.ts` for the list, a new `setActive` case on the existing
    `/api/host/tables/[id]` action dispatcher). Confirmed a toggled-off table disappears from the live floor
    (`getFloorState` already filters `isActive: true`).
  - **Deliberately not exposed**: `walkinAllocationPct`, `noShowThresholdMinutes`, `peakStart`/`peakEnd`,
    `autoOptimise`, `maxOnlinePartySize` — these existed in the schema/DTO but are genuinely unused by any
    booking logic; exposing them as editable would just be fake controls that don't do anything. Left as
    schema defaults. `RestaurantSettings.maxOnlinePartySize` specifically is superseded by `Restaurant.maxPartySize`,
    which is what the guest booking flow (`reservationActions.ts`) actually enforces — kept one source of
    truth instead of wiring up the redundant field.
- **Tenant isolation**: audited (not changed) — every restaurant-scoped model has a required `restaurantId`,
  and every `/api/host/*` route that looks up a record by bare `id` immediately checks
  `record.restaurantId !== ctx.restaurantId` before acting. No gaps found.
- **Live table-status colors / realtime**: the SSE push mechanism itself was already fully working (confirmed
  and left unchanged) — but a real gap was found and fixed in a follow-up round: **booking a table didn't
  actually change its colour**. `createReservationForRestaurant` created a `Reservation` row but never touched
  `DiningTable.status`, so a booked table stayed green until a host manually seated it — there was dead-code
  evidence this was meant to work (a `TABLE_COUNTS` tally with `RESERVED`/`ARRIVING_SOON` keys that could never
  be non-zero from real bookings, and a code comment about a "4h service window"). Fixed in
  `src/lib/hostflow/floor.ts`: an `AVAILABLE` table with an upcoming reservation in the next 4h now displays as
  `RESERVED` (>60 min out) / `ARRIVING_SOON` (≤60 min) / `LATE` (overdue) instead of green — computed live on
  every read, so it naturally transitions as time passes. Added `notify()` + `emitFloorChange()` calls to
  booking, cancelling, and rescheduling in `src/lib/reservationActions.ts` (none of the three touched the
  realtime/notification system before, despite it being used everywhere else in Host Flow). Verified live:
  booked a table via a raw API call while a host dashboard tab sat open — stat tiles and the table's colour
  updated within ~2s with zero manual refresh, and a "New booking" notification appeared in Alerts.
- **Thresholds corrected** (user follow-up): "arriving soon" was a hardcoded 60 minutes — too loose. Added a
  proper `arrivingSoonThresholdMinutes` setting (default 5) alongside the existing `lateThresholdMinutes`
  (default bumped 10 → 15), both editable in Settings → General. Verified precisely: 7 min out shows RESERVED
  (blue), 4 min out shows ARRIVING_SOON (orange).
- **"Reserve this table" from the floor plan** (user follow-up): clicking an empty table previously only
  offered "Seat guests" (immediate walk-in) — no way to pin a *future* reservation to a specific table you
  clicked; the existing reservation flow always auto-assigned a table. Added `bookSpecificTable` in
  `reservationActions.ts` (same race-safe Serializable transaction as the rest of the booking engine, scoped to
  one table instead of searching), a new `"reserve"` case on the existing table-action endpoint, and a "Reserve
  table" button + form (name, date, time, party size, phone, occasion) in `TablePanel.tsx`. Verified: booking
  succeeds and colours correctly; a second booking attempt on the same table/time is correctly rejected (409);
  party sizes outside the table's capacity are rejected.
- **Real floor-layout & capacity corrections** (user follow-up, plain data fixes, no code changes): tables 135
  and 140 were seeded into "Back Terrace" but physically belong in the Bar — moved both (section + position)
  into open space in the Bar's existing layout, verified visually with no overlap before touching production.
  Separately, corrected real capacities: tables 10/12/14/17/18/20/21/140 → fixed 2-top, table 13 → fixed 4-top;
  every table in Restaurant → 4-top, every table in Back Terrace → 2-top, every table in Lounge → 2-top. Both
  changes used the same "temporary script in `build`, deploy, verify, delete script, deploy again" pattern as
  every other production data fix in this doc — restaurant always looked up by slug, never hardcoded IDs
  (local SQLite and production Postgres have different auto-generated row IDs for the same logical table).
- **Day/night shift split for Bookings** (user follow-up: "from 5 o'clock, show me that night's bookings, name
  and time"): new configurable `nightShiftStartTime` setting (default 17:00, Settings → General). The Bookings
  tab now has a Day/Night toggle above the list, filtering by whether each booking's time is before or at/after
  the shift boundary — defaults to whichever shift is "on" right now, so it just shows tonight's list without
  an extra click once it's evening. Applies across every date shown, not just today.
- **Merge 2+ tables in one action** (user follow-up: "put 2 or more tables together for a bigger group"). The
  backend (`mergeTables`/`splitTable`) already handled any number of merged tables correctly — the gap was the
  UI only letting you pick one table at a time. `TablePicker` now supports multi-select with a live "Combined:
  N seats across M tables" preview; confirming sequentially merges each pick into the primary. Verified:
  merged 2 tables into a third (2+2+4 → 8 seats, confirmed via API), then split back apart cleanly.
- **What was intentionally NOT done**: a blanket "fix every bug" sweep (unbounded, not verifiable as
  "complete"), a full performance profiling pass (no profiler was run — don't trust unverified performance
  claims), and a "remove all dead code across the whole app" audit beyond what surfaced naturally while working
  in these files. If any of these are wanted as a next step, scope them as their own concrete task.
- **Verified**: `npx tsc --noEmit` and `npx next lint` clean after every phase. Settings page (all 4 tabs)
  manually verified in-browser against real Colonial data (local SQLite, temporarily, per the established
  pattern — see gotchas) — general settings save and persist across reload, hours load real data, the table
  toggle actually removes/restores a table from the live floor. Cancel/Resume/payment-method **could not be
  live-tested** — Stripe still isn't configured (no real keys), same open item as before. The AI assistant's
  dynamic booking-policy prompt reaches the Anthropic API call correctly but couldn't be response-verified —
  the configured `ANTHROPIC_API_KEY`'s account is out of credit balance (unrelated to this work, a real
  billing issue on the user's Anthropic account, not something fixable from here).
- **Visual merged-table grouping on the floor plan** (user follow-up: "make a visual when tables merge, and put
  them displayed together, and when they unmerge they go back to there place"). `mergedIntoId` existed on the
  `DiningTable` model and was already read/written correctly by `mergeTables`/`splitTable`, but it was never
  exposed on the client-facing `TableDTO` (`src/lib/hostflow/floor.ts`, also fixed in the day-plan variant in
  `dayplan.ts`) — the frontend had no way to know a table was merged. Fixed entirely in
  `src/components/host/FloorPlan.tsx`, purely at render time — **stored `x`/`y` are never touched**, which is
  what makes "unmerge puts it back" automatic (nothing was ever moved). A new `layoutMergedPositions` helper
  computes, per render, where each merged-in child should be *drawn*: directly beside its primary table, in
  table-number order. A dashed violet outline is drawn behind each merged cluster, and a merged child's glyph
  shows "→ Table N" instead of its normal seat count. Real gap found and fixed along the way: `splitTable`
  already existed server-side and was already wired to the `"split"` API action, but **no UI ever called it** —
  there was no way to actually unmerge tables before this. Added a "Split tables (T…)" button to `TablePanel.tsx`
  when a table has merged children, and — since a host might tap the merged-in child table directly rather than
  the primary — the panel for a merged-in child now shows only a "Split from Table N" action (dispatching the
  split against the primary's id) instead of the normal action set, which would otherwise have offered a
  dangerously incorrect "Unblock" button that clears `BLOCKED` status without clearing `mergedIntoId`. Verified
  live on both desktop and mobile viewports: merged tables 130+135 → 135 rendered adjacent to 130 with the link
  outline and "→ Table 130" label; split via the new button → 135 returned to exactly its original stored
  position with no outline, confirming the round-trip is lossless.

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
- **Fixed: root domain was showing The Colonial's guest site instead of Host Flow.** The legacy single-tenant
  template's homepage owned `/`, rendering whichever restaurant `NEXT_PUBLIC_RESTAURANT_SLUG` points to — so
  visiting the bare domain (or any link to `/`) showed The Colonial's branded guest page, not the Host Flow
  product, and pages under `/hostflow/*`/`/host/*` inherited its title too. Fixed: guest page moved to
  `/booking` (still fully working), `/` now redirects to `/hostflow`, and `/hostflow`/`/host` got their own
  layout-level metadata so their titles read "Host Flow" instead of "The Colonial." Verified live on all three
  paths.
- **⚠️ Local dev is now broken on this Mac** until `.env`'s `DATABASE_URL` is updated: the schema provider is
  now `"postgresql"` project-wide (shared by local dev and prod — there's only one schema file), but the local
  `.env` still points at `file:./dev.db` (SQLite), which no longer matches. To fix: get the real Postgres
  connection string from the Vercel dashboard (Settings → Environment Variables → reveal `DATABASE_URL`) and
  paste it into local `.env`, replacing the `file:./dev.db` line — I can't safely fetch that value myself (see
  gotcha below). Until fixed, `npm run dev` will fail on any DB query.

## Live data reset for real use (2026-07-24)

The site launched with demo data (fake reservations/walk-ins/table sessions from `seed.ts`) still showing on
the live dashboard. Cleared it for The Colonial so staff can start entering real bookings:

- One-off script `prisma/reset-colonial-live-data.ts` deleted all reservations, walk-ins, table sessions,
  notifications, and table-status history for The Colonial (only — The Harbour untouched) and reset every
  table to `AVAILABLE`. Floor plan, staff, menu, hours, FAQs, login, and billing were left alone.
- Ran once via a temporary `build`-script change (same "run inside Vercel's build, then remove" pattern used
  for the schema push), then the script was deleted and `build` reverted, in a separate deploy — so it can't
  accidentally run again against real future bookings.
- Verified live: 0 covers, 0% occupancy, every table green/available, Service Health 100.

## Mobile improvements (2026-07-24)

The `/host` dashboard is now built for phone use, not just desktop:

- **Floor plan section zoom** (`src/components/host/FloorPlan.tsx`) — previously every section in a room (e.g.
  Main Terrace, Restaurant, Back Terrace, Bar) rendered together in one shared SVG viewBox, so on a phone all
  the tables were tiny and hard to tap. Added a chip row (All + one chip per section) above the plan — tapping
  a section (or its zone label directly on the plan) zooms the view to just that section, filling the frame
  with much larger, legible tables. "All" returns to the combined view. Works alongside the existing room
  switcher (Main Room / Lounge).
- **Floor/List mobile toggle** (`src/components/host/HostApp.tsx`) — below the `lg` breakpoint, the floor plan
  and the waitlist/reservations rail used to both render at nearly full viewport height, stacked, forcing a
  very long scroll. Added a mobile-only segmented toggle so only one shows at a time; selecting a table
  automatically switches to the List view to show its panel, and closing the panel switches back to Floor.
  Desktop (`lg+`) is unchanged — both panels still show side by side.
- Verified on a 375×812 mobile viewport: dashboard metrics, floor plan + section zoom + table tap, waitlist
  add-walk-in form, new-reservation form, AI assistant, and alerts all render cleanly with no overflow or
  broken layout. Desktop layout re-verified unaffected at 1280×800.

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
