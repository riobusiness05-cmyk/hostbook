"use client";

import { useState } from "react";
import { Chip, Button } from "@/components/host/ui";
import { HostFlowLogo } from "@/components/HostFlowLogo";

const STATUS_META: Record<string, { label: string; color: string }> = {
  COMPLIMENTARY: { label: "Complimentary", color: "#a855f7" },
  TRIAL: { label: "Trial", color: "#3b82f6" },
  ACTIVE: { label: "Active", color: "#22c55e" },
  PAST_DUE: { label: "Past due", color: "#f97316" },
  CANCELLED: { label: "Cancelled", color: "#6b7280" },
  EXPIRED: { label: "Expired", color: "#ef4444" },
};

export type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  status: string;
  planName: string | null;
  monthlyPriceCents: number | null;
  trialDaysRemaining: number | null;
  stripeCustomerId: string | null;
  isComplimentary: boolean;
};

function formatCents(cents: number): string {
  // Locale pinned (not `undefined`) so server-rendered and client-hydrated
  // output always match — the runtime's default locale can differ between
  // Node (SSR) and the browser (hydration), which otherwise triggers a
  // hydration mismatch on this exact string.
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function AdminDashboard({
  restaurants,
  mrrCents,
  counts,
}: {
  restaurants: RestaurantRow[];
  mrrCents: number;
  counts: Record<string, number>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState<Record<string, number>>({});

  async function act(id: string, path: string, body?: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/platform/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <HostFlowLogo tone="onDark" size={26} />
            <span className="text-sm text-neutral-500">Platform admin</span>
          </div>
          <a href="/admin" className="text-sm text-neutral-400 hover:text-neutral-200">
            ← Legacy admin
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 p-6">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
        )}

        {/* Aggregate stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">MRR</p>
            <p className="mt-1 text-2xl font-bold text-white">{formatCents(mrrCents)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Restaurants</p>
            <p className="mt-1 text-2xl font-bold text-white">{restaurants.length}</p>
          </div>
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <div key={key} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{meta.label}</p>
              <p className="mt-1 text-2xl font-bold" style={{ color: meta.color }}>
                {counts[key] ?? 0}
              </p>
            </div>
          ))}
        </div>

        {/* Restaurants table */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">All restaurants</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-4 font-medium">Restaurant</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Plan</th>
                  <th className="py-2 pr-4 font-medium">Trial</th>
                  <th className="py-2 pr-4 font-medium">Stripe customer</th>
                  <th className="py-2 pr-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r) => {
                  const meta = STATUS_META[r.status] ?? { label: r.status, color: "#6b7280" };
                  const busy = busyId === r.id;
                  return (
                    <tr key={r.id} className="border-b border-white/5 align-top last:border-0">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-white">{r.name}</p>
                        <p className="text-xs text-neutral-500">{r.slug}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <Chip color={meta.color}>{meta.label}</Chip>
                      </td>
                      <td className="py-3 pr-4 text-neutral-300">
                        {r.planName ?? "—"}
                        {r.monthlyPriceCents != null && (
                          <span className="text-neutral-500"> · {formatCents(r.monthlyPriceCents)}/mo</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-neutral-300">
                        {r.trialDaysRemaining != null ? `${r.trialDaysRemaining}d left` : "—"}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-neutral-500">{r.stripeCustomerId ?? "—"}</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            value={extendDays[r.id] ?? 7}
                            onChange={(e) => setExtendDays((d) => ({ ...d, [r.id]: Number(e.target.value) }))}
                            className="w-14 rounded-md border border-white/15 bg-white/5 px-1.5 py-1 text-xs text-white"
                          />
                          <Button size="sm" disabled={busy} onClick={() => act(r.id, "extend-trial", { days: extendDays[r.id] ?? 7 })}>
                            Extend trial
                          </Button>
                          {!r.isComplimentary ? (
                            <Button size="sm" disabled={busy} onClick={() => act(r.id, "grant-complimentary", { reason: "Granted via platform admin" })}>
                              Grant comp
                            </Button>
                          ) : (
                            <Button size="sm" disabled={busy} onClick={() => act(r.id, "convert-complimentary")}>
                              Convert to paid
                            </Button>
                          )}
                          {r.status !== "CANCELLED" ? (
                            <Button size="sm" variant="danger" disabled={busy} onClick={() => act(r.id, "suspend")}>
                              Suspend
                            </Button>
                          ) : (
                            <Button size="sm" variant="primary" disabled={busy} onClick={() => act(r.id, "reactivate")}>
                              Reactivate
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
