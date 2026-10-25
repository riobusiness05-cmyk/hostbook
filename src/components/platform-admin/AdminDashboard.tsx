"use client";

import { useState } from "react";
import Link from "next/link";
import { Chip, Button, StatCard, Card, SectionTitle } from "@/components/host/ui";
import { HostFlowLogo } from "@/components/HostFlowLogo";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { STATUS_META, formatCents, formatDate, formatDateTime } from "./format";
import type {
  PlatformMetrics,
  SeriesPoint,
  RecentRestaurantRow,
  ActiveRestaurantRow,
  RecentBookingRow,
  FailedPaymentRow,
} from "@/lib/platformAdmin";

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

export function AdminDashboard({
  restaurants,
  counts,
  metrics,
  growthSeries,
  bookingSeries,
  mrrSeries,
  recentRestaurants,
  mostActive,
  recentBookings,
  recentFailedPayments,
}: {
  restaurants: RestaurantRow[];
  counts: Record<string, number>;
  metrics: PlatformMetrics;
  growthSeries: SeriesPoint[];
  bookingSeries: SeriesPoint[];
  mrrSeries: SeriesPoint[];
  recentRestaurants: RecentRestaurantRow[];
  mostActive: ActiveRestaurantRow[];
  recentBookings: RecentBookingRow[];
  recentFailedPayments: FailedPaymentRow[];
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
    <div className="dark min-h-screen bg-neutral-950 text-neutral-100">
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

      <main className="mx-auto max-w-6xl space-y-6 p-6">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
        )}

        {/* Metrics */}
        <div>
          <SectionTitle>Business metrics</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <StatCard label="Total restaurants" value={metrics.totalRestaurants} />
            <StatCard label="Active restaurants" value={metrics.activeRestaurants} tone="good" />
            <StatCard label="New this month" value={metrics.newRestaurantsThisMonth} sub="restaurants" />
            <StatCard label="Staff accounts" value={metrics.totalStaffAccounts} sub="across all restaurants" />
            <StatCard label="MRR" value={formatCents(metrics.mrrCents)} tone="good" />
            <StatCard label="Total bookings" value={metrics.totalBookings.toLocaleString("en-US")} />
            <StatCard label="Bookings today" value={metrics.bookingsToday} />
            <StatCard label="Bookings this week" value={metrics.bookingsThisWeek} />
            <StatCard label="Bookings this month" value={metrics.bookingsThisMonth} />
            <StatCard label="Active subscriptions" value={metrics.activeSubscriptions} tone="good" />
            <StatCard label="Trial accounts" value={metrics.trialAccounts} />
            <StatCard label="Cancelled subscriptions" value={metrics.cancelledSubscriptions} tone={metrics.cancelledSubscriptions > 0 ? "warn" : "default"} />
            <StatCard
              label="Failed payments"
              value={metrics.failedPayments30d}
              sub="last 30 days"
              tone={metrics.failedPayments30d > 0 ? "bad" : "default"}
            />
          </div>
        </div>

        {/* Charts */}
        <div>
          <SectionTitle>Trends (last 12 months)</SectionTitle>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Restaurant growth</p>
              <TimeSeriesChart data={growthSeries} color="#3b82f6" />
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Booking volume</p>
              <TimeSeriesChart data={bookingSeries} color="#22c55e" />
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Revenue (MRR)</p>
              <TimeSeriesChart data={mrrSeries} color="#a855f7" formatValue={(v) => `$${v}`} />
            </Card>
          </div>
        </div>

        {/* Activity tables */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <SectionTitle>Recently registered</SectionTitle>
            <div className="space-y-2">
              {recentRestaurants.length === 0 && <p className="text-sm text-neutral-500">No restaurants yet.</p>}
              {recentRestaurants.map((r) => {
                const meta = STATUS_META[r.status] ?? { label: r.status, color: "#6b7280" };
                return (
                  <Link
                    key={r.id}
                    href={`/hostflow/admin/${r.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-white/5"
                  >
                    <div>
                      <span className="font-medium text-white">{r.name}</span>
                      <span className="ml-2 text-xs text-neutral-500">{formatDate(r.createdAt)}</span>
                    </div>
                    <Chip color={meta.color}>{meta.label}</Chip>
                  </Link>
                );
              })}
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle>Most active restaurants</SectionTitle>
            <div className="space-y-2">
              {mostActive.length === 0 && <p className="text-sm text-neutral-500">No bookings yet.</p>}
              {mostActive.map((r) => (
                <Link
                  key={r.id}
                  href={`/hostflow/admin/${r.id}`}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-white/5"
                >
                  <span className="font-medium text-white">{r.name}</span>
                  <span className="text-neutral-400">{r.bookingCount} bookings</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle>Recent bookings</SectionTitle>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {recentBookings.length === 0 && <p className="text-sm text-neutral-500">No bookings yet.</p>}
              {recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">
                      {b.customerName} <span className="text-neutral-500">· {b.partySize}</span>
                    </p>
                    <p className="truncate text-xs text-neutral-500">{b.restaurantName}</p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">{formatDateTime(b.createdAt)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle>Recent failed payments</SectionTitle>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {recentFailedPayments.length === 0 && <p className="text-sm text-neutral-500">No failed payments.</p>}
              {recentFailedPayments.map((f) => (
                <Link
                  key={f.id}
                  href={`/hostflow/admin/${f.restaurantId}`}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-white/5"
                >
                  <span className="font-medium text-white">{f.restaurantName}</span>
                  <span className="text-xs text-red-400">{formatDateTime(f.createdAt)}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        {/* Restaurants table */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <CleanupPanel restaurants={restaurants} />
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
                        <Link href={`/hostflow/admin/${r.id}`} className="hover:underline">
                          <p className="font-medium text-white">{r.name}</p>
                          <p className="text-xs text-neutral-500">{r.slug}</p>
                        </Link>
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


// Bulk removal of test venues. Only expired, never-paid venues are offered;
// each one still goes through the guarded delete endpoint (which refuses
// anything with a live or complimentary subscription), and the operator has
// to tick each venue and type DELETE. Nothing here is automatic.
function CleanupPanel({ restaurants }: { restaurants: RestaurantRow[] }) {
  const candidates = restaurants.filter((r) => r.status === "EXPIRED" && !r.isComplimentary);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; note: string }[] | null>(null);
  if (candidates.length === 0) return null;

  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const run = async () => {
    if (!window.confirm(`Permanently delete ${picked.size} venue${picked.size === 1 ? "" : "s"} and everything in them? This cannot be undone.`)) return;
    setBusy(true);
    const out: { name: string; ok: boolean; note: string }[] = [];
    for (const r of candidates.filter((c) => picked.has(c.id))) {
      try {
        const res = await fetch("/api/platform/delete-restaurant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restaurantId: r.id, confirmSlug: r.slug }),
        });
        const d = await res.json().catch(() => ({}));
        out.push({ name: r.name, ok: res.ok, note: res.ok ? `deleted (${d.deleted?.bookings ?? 0} bookings, ${d.deleted?.accounts ?? 0} accounts)` : d.error || `failed (${res.status})` });
      } catch (e) {
        out.push({ name: r.name, ok: false, note: (e as Error).message });
      }
    }
    setResults(out);
    setBusy(false);
    setTimeout(() => window.location.reload(), 2500);
  };

  return (
    <Card className="mb-6 border-red-500/20 p-4">
      <SectionTitle>Clean up test venues</SectionTitle>
      <p className="mb-3 text-xs text-neutral-500">
        Expired, never-paid venues. Tick the ones that were only ever tests, type DELETE, and they are removed for good — accounts, tables,
        bookings and emails. Anything with a paid or complimentary subscription is never offered here and is refused by the server anyway.
      </p>
      <div className="mb-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {candidates.map((r) => (
          <label key={r.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs">
            <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} disabled={busy} />
            <span className="truncate font-semibold text-white">{r.name}</span>
            <span className="ml-auto shrink-0 text-neutral-500">{formatDate(r.createdAt)}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="text-xs text-sky-400 hover:underline" onClick={() => setPicked(new Set(candidates.map((c) => c.id)))} disabled={busy}>Select all</button>
        <button type="button" className="text-xs text-neutral-400 hover:underline" onClick={() => setPicked(new Set())} disabled={busy}>Clear</button>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="type DELETE"
          className="ml-auto w-36 rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-red-400"
        />
        <Button size="sm" variant="danger" disabled={busy || picked.size === 0 || confirm !== "DELETE"} onClick={run}>
          {busy ? "Deleting…" : `Delete ${picked.size} venue${picked.size === 1 ? "" : "s"}`}
        </Button>
      </div>
      {results && (
        <div className="mt-3 space-y-1 text-xs">
          {results.map((r) => (
            <p key={r.name} className={r.ok ? "text-emerald-400" : "text-red-300"}>{r.name}: {r.note}</p>
          ))}
          <p className="text-neutral-500">Refreshing…</p>
        </div>
      )}
    </Card>
  );
}
