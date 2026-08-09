import Link from "next/link";
import { HostFlowLogo } from "@/components/HostFlowLogo";
import { listActivePlans } from "@/lib/billing/subscription";

export const metadata = {
  title: "Host Flow — The operating system for your floor",
  description: "Live floor plan, smart seating, walk-ins, waitlist, rush prediction and an AI host assistant — one calm screen for a busy service.",
};

const FEATURES = [
  { icon: "floor" as const, title: "Live floor plan", body: "Every table, colour-coded by status, updating in real time as your service moves." },
  { icon: "assistant" as const, title: "AI host assistant", body: "Ask the floor anything — free tables, late tables, who's next — grounded in live data." },
  { icon: "seating" as const, title: "Smart seating", body: "The engine recommends the best table for every party and never wastes a six-top on a two." },
  { icon: "rush" as const, title: "Rush prediction", body: "See your peak before it hits, with projected occupancy and wait times." },
  { icon: "waitlist" as const, title: "Walk-ins & waitlist", body: "Quote a wait, sort by priority and VIP, and seat the next party in one tap." },
  { icon: "sync" as const, title: "Realtime everywhere", body: "Host stand, iPad, phone — every screen stays perfectly in sync, instantly." },
];

const FAQS = [
  {
    q: "Is there really a free trial?",
    a: "Yes — 7 days, full Professional access, no card required to start. If you decide to continue, you'll add a payment method before the trial ends.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your Billing settings whenever you like — you'll keep access through the end of your current billing period, no questions asked.",
  },
  {
    q: "Do you support annual billing?",
    a: "Monthly billing is available today; annual pricing is coming soon and will offer a discount over paying monthly.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Your floor plan, reservations, and history stay intact. Resubscribe anytime to pick up right where you left off.",
  },
  {
    q: "How does payment work?",
    a: "Billing is handled securely by Stripe — Host Flow never sees or stores your card details.",
  },
];

export default async function HostFlowLanding() {
  const plans = await listActivePlans();
  const professional = plans[0] ?? null;

  return (
    <div className="relative overflow-hidden">
      <div className="hf-blueprint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-brand-500/[0.10] blur-[160px]" />

      <div className="relative">
        {/* Nav */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <HostFlowLogo tone="onDark" size={30} />
          <nav className="flex items-center gap-3">
            <Link
              href="/hostflow/login"
              className="rounded-lg border border-hf-line px-4 py-2 text-sm font-medium text-hf-ink/80 transition-colors hover:border-hf-ink/25 hover:text-hf-ink"
            >
              Sign in
            </Link>
            <Link
              href="/hostflow/signup"
              className="rounded-lg bg-brand-400 px-4 py-2 text-sm font-semibold text-hf-bg transition-transform hover:scale-[1.02]"
            >
              Start Free Trial
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-8 pt-14 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <span
              className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-hf-line bg-hf-surface/60 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-hf-inkMuted"
              style={{ animationDelay: "0ms" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Built for high-volume restaurants &amp; bars
            </span>
            <h1
              className="animate-fade-up mx-auto mt-7 text-balance font-display text-5xl leading-[1.08] tracking-tight sm:text-[64px]"
              style={{ animationDelay: "90ms" }}
            >
              The operating system
              <br />
              for your <em className="text-brand-400 not-italic sm:italic">floor.</em>
            </h1>
            <p
              className="animate-fade-up mx-auto mt-6 max-w-xl text-balance text-lg leading-relaxed text-hf-inkMuted"
              style={{ animationDelay: "170ms" }}
            >
              Reservations, walk-ins, waitlist, table management, rush prediction and an AI host assistant —
              on one calm screen that keeps your whole team in sync through the busiest service.
            </p>
            <div
              className="animate-fade-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "250ms" }}
            >
              <Link
                href="/hostflow/signup"
                className="w-full rounded-xl bg-brand-400 px-6 py-3 text-sm font-semibold text-hf-bg transition-transform hover:scale-[1.02] sm:w-auto"
              >
                Start Free Trial →
              </Link>
              <Link
                href="/hostflow/login"
                className="w-full rounded-xl border border-hf-line px-6 py-3 text-sm font-semibold text-hf-ink/85 transition-colors hover:border-hf-ink/25 sm:w-auto"
              >
                Sign in to your venue
              </Link>
            </div>
            <p
              className="animate-fade-up mt-4 font-mono text-xs tracking-wide text-hf-inkFaint"
              style={{ animationDelay: "320ms" }}
            >
              7-day free trial · no card required · cancel anytime
            </p>
          </div>

          <FloorPreview />
        </section>

        {/* Feature grid */}
        <section className="mx-auto max-w-6xl px-6 pb-24 pt-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="group animate-fade-up rounded-2xl border border-hf-line bg-hf-surface/50 p-6 transition-colors hover:border-brand-400/30 hover:bg-hf-surface"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-brand-400/25 bg-brand-500/10 text-brand-300">
                  <FeatureIcon kind={f.icon} />
                </div>
                <h3 className="font-display text-lg text-hf-ink">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-hf-inkMuted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-6 pb-24">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">Simple, honest pricing.</h2>
            <p className="mx-auto mt-3 max-w-xl text-hf-inkMuted">One plan, everything included. No setup fees, no per-seat tricks.</p>
          </div>

          <div className="mx-auto max-w-md">
            <div className="relative overflow-hidden rounded-3xl border border-brand-400/25 bg-hf-surface p-8">
              <div className="hf-blueprint pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/30 bg-brand-500/10 px-2.5 py-1 font-mono text-xs text-brand-300">
                  7-day free trial
                </span>
                <h3 className="mt-4 font-display text-2xl">{professional?.name ?? "Professional"}</h3>
                <p className="mt-1 flex items-baseline gap-1 font-mono">
                  <span className="text-4xl font-semibold tracking-tight text-hf-ink">
                    ${professional ? (professional.monthlyPriceCents / 100).toFixed(0) : "30"}
                  </span>
                  <span className="text-hf-inkMuted">/month</span>
                </p>
                {professional?.description && <p className="mt-2 text-sm text-hf-inkMuted">{professional.description}</p>}

                <Link
                  href="/hostflow/signup"
                  className="mt-6 block w-full rounded-xl bg-brand-400 py-3 text-center text-sm font-semibold text-hf-bg transition-transform hover:scale-[1.02]"
                >
                  Start Free Trial
                </Link>
                <p className="mt-2 text-center text-xs text-hf-inkFaint">No card required to start.</p>

                <ul className="mt-6 space-y-2.5 border-t border-hf-line pt-6">
                  {(professional?.features ?? [
                    "Unlimited reservations",
                    "AI table allocation",
                    "Booking website",
                    "Live floor plans",
                    "Waitlist management",
                    "Staff accounts",
                    "Analytics",
                    "Workflows",
                  ]).map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-hf-ink/90">
                      <CheckIcon /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-hf-inkFaint">
              More plans (Starter, Enterprise) are on the way — this page updates automatically when they launch.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-6 pb-24">
          <h2 className="mb-8 text-center font-display text-3xl tracking-tight sm:text-4xl">Questions, answered.</h2>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-hf-line bg-hf-surface/50 p-5 open:bg-hf-surface">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-hf-ink">
                  {f.q}
                  <span className="shrink-0 text-hf-inkFaint transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-hf-inkMuted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="mx-auto max-w-6xl px-6 pb-28">
          <div className="relative overflow-hidden rounded-3xl border border-hf-line bg-hf-surface p-10 text-center sm:p-14">
            <div className="hf-blueprint pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_80%_100%_at_50%_0%,black,transparent)]" />
            <div className="relative">
              <h2 className="font-display text-3xl tracking-tight sm:text-4xl">Run a calmer, faster service.</h2>
              <p className="mx-auto mt-3 max-w-xl text-hf-inkMuted">
                Start your free trial, or sign in to your venue to open the live floor.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/hostflow/signup"
                  className="inline-block rounded-xl bg-brand-400 px-6 py-3 text-sm font-semibold text-hf-bg transition-transform hover:scale-[1.02]"
                >
                  Start Free Trial →
                </Link>
                <Link
                  href="/hostflow/login"
                  className="inline-block rounded-xl border border-hf-line px-6 py-3 text-sm font-semibold text-hf-ink/85 transition-colors hover:border-hf-ink/25"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-hf-line py-8 text-center font-mono text-xs text-hf-inkFaint">
          Host Flow · A floor-management platform · © {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}

// A stylised, non-interactive miniature of the real floor plan — the single
// most direct way to show what this product actually is, rather than
// another row of abstract icon cards. Table fills use the exact status
// colours the live dashboard uses (see hostflow/constants.ts), so a host
// who signs up and opens their real floor recognises the language instantly.
function FloorPreview() {
  const tables: { x: number; y: number; w: number; h: number; r?: number; fill: string }[] = [
    { x: 40, y: 30, w: 46, h: 46, fill: "#34d399" },
    { x: 110, y: 30, w: 46, h: 46, fill: "#34d399" },
    { x: 180, y: 24, w: 58, h: 40, fill: "#f59e0b" },
    { x: 40, y: 100, w: 46, h: 46, r: 23, fill: "#ef4444" },
    { x: 110, y: 100, w: 46, h: 46, fill: "#34d399" },
    { x: 180, y: 96, w: 46, h: 46, r: 23, fill: "#3b82f6" },
    { x: 260, y: 30, w: 46, h: 46, fill: "#34d399" },
    { x: 260, y: 100, w: 46, h: 46, r: 23, fill: "#34d399" },
    { x: 330, y: 60, w: 58, h: 90, fill: "#34d399" },
  ];
  return (
    <div className="animate-fade-up relative mx-auto mt-14 max-w-3xl" style={{ animationDelay: "400ms" }}>
      <div className="relative overflow-hidden rounded-2xl border border-hf-line bg-hf-surface/80 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.6)]">
        <div className="hf-grain" />
        <div className="flex items-center justify-between border-b border-hf-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest text-hf-inkFaint">
          <span>Main Room · live</span>
          <span className="flex items-center gap-1.5 text-brand-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" /> Realtime
          </span>
        </div>
        <svg viewBox="0 0 420 170" className="block w-full">
          {tables.map((t, i) => (
            <rect
              key={i}
              x={t.x}
              y={t.y}
              width={t.w}
              height={t.h}
              rx={t.r ?? 10}
              fill={t.fill}
              opacity={0.85}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0 text-brand-400">
      <path d="M3 8.5 6.2 12 13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Hand-drawn, single-weight line icons — deliberately not from an icon
// library, so they stay visually consistent with each other and the rest
// of the mark (see HostFlowLogo) instead of the mismatched-style grab-bag
// that comes from mixing font-icon sets.
function FeatureIcon({ kind }: { kind: "floor" | "assistant" | "seating" | "rush" | "waitlist" | "sync" }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "floor":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <rect x="6.5" y="6.5" width="5" height="5" rx="1" />
          <rect x="14" y="6.5" width="3.5" height="3.5" rx="1" />
          <circle cx="16" cy="15.5" r="2.2" />
        </svg>
      );
    case "assistant":
      return (
        <svg {...common}>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          <circle cx="12" cy="12" r="5.2" />
        </svg>
      );
    case "seating":
      return (
        <svg {...common}>
          <circle cx="8" cy="9" r="3" />
          <path d="M3.5 19c.6-3 2.2-4.6 4.5-4.6s3.9 1.6 4.5 4.6" />
          <path d="M16 5.5a2.6 2.6 0 1 1 0 5.2" />
          <path d="M14.5 19c.5-2.6 1.7-4 3.5-4.4" />
        </svg>
      );
    case "rush":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case "waitlist":
      return (
        <svg {...common}>
          <path d="M4 6h11M4 12h11M4 18h7" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      );
    case "sync":
      return (
        <svg {...common}>
          <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8" />
          <path d="M20 4v4h-4" />
          <path d="M20 12a8 8 0 0 1-13.7 5.7L4 16" />
          <path d="M4 20v-4h4" />
        </svg>
      );
  }
}
