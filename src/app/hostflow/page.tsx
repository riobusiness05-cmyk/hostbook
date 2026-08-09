import Link from "next/link";
import { HostFlowLogo } from "@/components/HostFlowLogo";
import { listActivePlans } from "@/lib/billing/subscription";

export const metadata = {
  title: "Host Flow — The operating system for your floor",
  description: "Live floor plan, smart seating, walk-ins, waitlist, rush prediction and an AI host assistant — one calm screen for a busy service.",
};

const FEATURES = [
  { icon: "▦", title: "Live floor plan", body: "Every table, colour-coded by status, updating in real time as your service moves." },
  { icon: "✦", title: "AI host assistant", body: "Ask the floor anything — free tables, late tables, who's next — grounded in live data." },
  { icon: "◎", title: "Smart seating", body: "The engine recommends the best table for every party and never wastes a six-top on a two." },
  { icon: "◔", title: "Rush prediction", body: "See your peak before it hits, with projected occupancy and wait times." },
  { icon: "≣", title: "Walk-ins & waitlist", body: "Quote a wait, sort by priority and VIP, and seat the next party in one tap." },
  { icon: "⟳", title: "Realtime everywhere", body: "Host stand, iPad, phone — every screen stays perfectly in sync, instantly." },
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* ambient gradient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[520px] w-[520px] rounded-full bg-sky-500/20 blur-[140px]" />
        <div className="absolute top-1/3 right-0 h-[420px] w-[420px] rounded-full bg-indigo-500/20 blur-[140px]" />
        <div className="absolute bottom-0 left-0 h-[360px] w-[360px] rounded-full bg-emerald-500/10 blur-[120px]" />
      </div>

      <div className="relative">
        {/* Nav */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Logo />
          <nav className="flex items-center gap-3">
            <Link
              href="/hostflow/login"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/10"
            >
              Sign in
            </Link>
            <Link
              href="/hostflow/signup"
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition-transform hover:scale-[1.02]"
            >
              Start Free Trial
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-neutral-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Built for high-volume restaurants & bars
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            The operating system
            <br />
            for your <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">floor</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-neutral-400">
            Reservations, walk-ins, waitlist, table management, rush prediction and an AI host assistant —
            on one calm screen that keeps your whole team in sync through the busiest service.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/hostflow/signup"
              className="w-full rounded-xl bg-white px-6 py-3 text-sm font-semibold text-neutral-900 transition-transform hover:scale-[1.02] sm:w-auto"
            >
              Start Free Trial →
            </Link>
            <Link
              href="/hostflow/login"
              className="w-full rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-neutral-200 transition-colors hover:bg-white/10 sm:w-auto"
            >
              Sign in to your venue
            </Link>
          </div>
          <p className="mt-4 text-xs text-neutral-500">7-day free trial · No card required · Cancel anytime.</p>
        </section>

        {/* Feature grid */}
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-500/30 to-indigo-500/30 text-lg text-sky-200">
                  {f.icon}
                </div>
                <h3 className="text-base font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-6 pb-24">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple, honest pricing.</h2>
            <p className="mx-auto mt-3 max-w-xl text-neutral-400">One plan, everything included. No setup fees, no per-seat tricks.</p>
          </div>

          <div className="mx-auto max-w-md">
            <div className="rounded-3xl border border-sky-400/30 bg-gradient-to-br from-sky-500/[0.08] to-indigo-500/[0.04] p-8">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                7-day free trial
              </span>
              <h3 className="mt-4 text-2xl font-bold">{professional?.name ?? "Professional"}</h3>
              <p className="mt-1 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight">
                  ${professional ? (professional.monthlyPriceCents / 100).toFixed(0) : "100"}
                </span>
                <span className="text-neutral-400">/month</span>
              </p>
              {professional?.description && <p className="mt-2 text-sm text-neutral-400">{professional.description}</p>}

              <Link
                href="/hostflow/signup"
                className="mt-6 block w-full rounded-xl bg-white py-3 text-center text-sm font-semibold text-neutral-900 transition-transform hover:scale-[1.02]"
              >
                Start Free Trial
              </Link>
              <p className="mt-2 text-center text-xs text-neutral-500">No card required to start.</p>

              <ul className="mt-6 space-y-2.5 border-t border-white/10 pt-6">
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
                  <li key={f} className="flex items-center gap-2.5 text-sm text-neutral-200">
                    <span className="text-emerald-400">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-center text-xs text-neutral-500">
              More plans (Starter, Enterprise) are on the way — this page updates automatically when they launch.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-6 pb-24">
          <h2 className="mb-8 text-center text-3xl font-bold tracking-tight sm:text-4xl">Questions, answered.</h2>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 open:bg-white/[0.05]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-white">
                  {f.q}
                  <span className="shrink-0 text-neutral-500 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="mx-auto max-w-6xl px-6 pb-28">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-10 text-center sm:p-14">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Run a calmer, faster service.</h2>
            <p className="mx-auto mt-3 max-w-xl text-neutral-400">
              Start your free trial, or sign in to your venue to open the live floor.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/hostflow/signup"
                className="inline-block rounded-xl bg-white px-6 py-3 text-sm font-semibold text-neutral-900 transition-transform hover:scale-[1.02]"
              >
                Start Free Trial →
              </Link>
              <Link
                href="/hostflow/login"
                className="inline-block rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-neutral-200 transition-colors hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 py-8 text-center text-xs text-neutral-500">
          Host Flow · A floor-management platform · © {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}

function Logo() {
  return <HostFlowLogo tone="onDark" size={30} />;
}
