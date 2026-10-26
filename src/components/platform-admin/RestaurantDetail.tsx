"use client";

import { useState } from "react";
import Link from "next/link";
import { Chip, Button, StatCard, Card, SectionTitle } from "@/components/host/ui";
import { HostFlowLogo } from "@/components/HostFlowLogo";
import { EmailDesignEditor } from "./EmailDesignEditor";
import { STATUS_META, formatCents, formatDate, formatDateTime } from "./format";
import type { RestaurantDetail as RestaurantDetailData } from "@/lib/platformAdmin";
import type { StripeCustomerSummary } from "@/lib/billing/subscription";
import type { UpgradePreview } from "@/lib/billing/upgradePreview";

type EmailHealth = {
  days: number;
  summary: Record<string, Record<string, number>>;
  bookings: {
    total: number;
    withEmail: number;
    withoutEmail: number;
    withoutEmailBySource: Record<string, number>;
    withEmailButNoConfirmation: { id: string; name: string; createdAt: string; source: string }[];
  };
  recent: { id: string; kind: string; to: string; subject: string; status: string; error: string | null; createdAt: string; openedAt: string | null; clickedAt: string | null }[];
};

const STATUS_COLOR: Record<string, string> = {
  DELIVERED: "#22c55e", OPENED: "#22c55e", CLICKED: "#22c55e", SENT: "#3b82f6", DELAYED: "#f59e0b",
  BOUNCED: "#ef4444", COMPLAINED: "#ef4444", FAILED: "#ef4444", SKIPPED: "#6b7280", PENDING: "#6b7280",
};

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export function RestaurantDetail({ restaurant }: { restaurant: RestaurantDetailData }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState(7);
  const [stripeCustomers, setStripeCustomers] = useState<StripeCustomerSummary[] | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [upgrade, setUpgrade] = useState<UpgradePreview | null>(null);
  const [emailHealth, setEmailHealth] = useState<EmailHealth | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [deleteSlug, setDeleteSlug] = useState("");
  const [cloneSources, setCloneSources] = useState<{ id: string; name: string; slug: string; tables: number; sections: number }[] | null>(null);
  const [cloneFrom, setCloneFrom] = useState("");
  const [cloneParts, setCloneParts] = useState({ floorPlan: true, hours: true, settings: true, emailDesign: true, profile: true });
  const [cloneResult, setCloneResult] = useState<string | null>(null);

  async function loadCloneSources() {
    const res = await fetch("/api/platform/clone-setup");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setCloneSources((data.venues ?? []).filter((v: { id: string }) => v.id !== restaurant.id));
  }

  async function runClone() {
    const src = cloneSources?.find((v) => v.id === cloneFrom);
    if (!src) return;
    const parts = Object.entries(cloneParts).filter(([, on]) => on).map(([k]) => k).join(", ");
    if (!window.confirm(`Copy ${parts} from "${src.name}" onto "${restaurant.name}"? The chosen parts on ${restaurant.name} are replaced.`)) return;
    setBusy(true); setError(null); setCloneResult(null);
    try {
      const res = await fetch("/api/platform/clone-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromRestaurantId: cloneFrom, toRestaurantId: restaurant.id, parts: cloneParts }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't copy");
      setCloneResult(Object.entries(data.done).map(([k, v]) => `${k}: ${v}`).join(" · "));
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadEmailHealth() {
    setEmailLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/email-log?restaurantId=${restaurant.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't load");
      setEmailHealth(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEmailLoading(false);
    }
  }

  async function deleteVenue() {
    if (!window.confirm(`Permanently delete ${restaurant.name} and everything in it? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/delete-restaurant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: restaurant.id, confirmSlug: deleteSlug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't delete");
      window.location.href = "/hostflow/admin";
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  async function loadUpgradePreview() {
    setUpgradeLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/upgrade-preview?restaurantId=${restaurant.id}&planKey=premium`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setUpgrade(data.preview);
      // The preview already fetched every Stripe customer for the venue —
      // show them in the same place "Show Stripe customers" would.
      if (Array.isArray(data.preview?.stripeCustomers)) setStripeCustomers(data.preview.stripeCustomers);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpgradeLoading(false);
    }
  }

  async function loadStripeCustomers() {
    setStripeLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/stripe-customers?restaurantId=${restaurant.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setStripeCustomers(data.customers);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStripeLoading(false);
    }
  }

  async function act(path: string, body?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: restaurant.id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function removeBlackout(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/blackouts/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't remove blackout date");
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const meta = STATUS_META[restaurant.status] ?? { label: restaurant.status, color: "#6b7280" };

  return (
    <div className="dark min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <HostFlowLogo tone="onDark" size={26} />
            <span className="text-sm text-neutral-500">Platform admin</span>
          </div>
          <Link href="/hostflow/admin" className="text-sm text-neutral-400 hover:text-neutral-200">
            ← All restaurants
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-6">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
        )}

        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">{restaurant.name}</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {restaurant.slug} · {restaurant.email ?? "no email on file"} · joined {formatDate(restaurant.createdAt)}
            </p>
          </div>
          <Chip color={meta.color}>{meta.label}</Chip>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Plan"
            value={<span className="text-lg sm:text-xl">{restaurant.planName ?? "—"}</span>}
            sub={restaurant.billingInterval === "YEAR" ? "annual" : "monthly"}
          />
          <StatCard label="MRR contribution" value={restaurant.monthlyPriceCents != null ? formatCents(restaurant.monthlyPriceCents) : "—"} />
          <StatCard label="Tables" value={restaurant.tableCount} />
          <StatCard label="Total bookings" value={restaurant.totalBookings.toLocaleString("en-US")} sub={`${restaurant.bookingsThisMonth} this month`} />
        </div>

        <Card className="p-4">
          <SectionTitle>Account</SectionTitle>
          {restaurant.owner ? (
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-neutral-500">Owner</p>
                <p className="text-white">{restaurant.owner.name}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Email</p>
                <p className="text-white">{restaurant.owner.email}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Role</p>
                <p className="text-white">{restaurant.owner.role}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Last login</p>
                <p className="text-white">{restaurant.owner.lastLoginAt ? formatDateTime(restaurant.owner.lastLoginAt) : "never"}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No owner account found.</p>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle>Subscription</SectionTitle>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-neutral-500">Trial ends</p>
              <p className="text-white">{restaurant.trialEndsAt ? formatDate(restaurant.trialEndsAt) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Current period ends</p>
              <p className="text-white">{restaurant.currentPeriodEnd ? formatDate(restaurant.currentPeriodEnd) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Stripe customer</p>
              <p className="font-mono text-xs text-white">{restaurant.stripeCustomerId ?? "—"}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="number"
              min={1}
              value={extendDays}
              onChange={(e) => setExtendDays(Number(e.target.value))}
              className="w-16 rounded-md border border-white/15 bg-white/5 px-1.5 py-1 text-xs text-white"
            />
            <Button size="sm" disabled={busy} onClick={() => act("extend-trial", { days: extendDays })}>
              Extend trial
            </Button>
            {!restaurant.isComplimentary ? (
              <Button size="sm" disabled={busy} onClick={() => act("grant-complimentary", { reason: "Granted via platform admin" })}>
                Grant comp
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => act("convert-complimentary")}>
                Convert to paid
              </Button>
            )}
            {restaurant.status !== "CANCELLED" ? (
              <Button size="sm" variant="danger" disabled={busy} onClick={() => act("suspend")}>
                Suspend
              </Button>
            ) : (
              <Button size="sm" variant="primary" disabled={busy} onClick={() => act("reactivate")}>
                Reactivate
              </Button>
            )}
            <Button
              size="sm"
              disabled={busy}
              title="Look up this restaurant's actual subscription in Stripe and correct this row to match — use this if a payment went through but the status here didn't update"
              onClick={() => act("reconcile-stripe")}
            >
              Reconcile from Stripe
            </Button>
            <Button
              size="sm"
              disabled={stripeLoading}
              title="List every Stripe customer/subscription found for this restaurant's email — read-only, use this to spot a duplicate from a repeated checkout"
              onClick={loadStripeCustomers}
            >
              {stripeLoading ? "Looking up…" : "Show Stripe customers"}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={upgradeLoading}
              title="Dry run of this venue clicking Upgrade to Premium: what Stripe would charge today, when the new price starts, and anything that would block it — read-only, changes nothing"
              onClick={loadUpgradePreview}
            >
              {upgradeLoading ? "Asking Stripe…" : "Preview upgrade to Premium"}
            </Button>
          </div>

          {upgrade && <UpgradePreviewCard preview={upgrade} />}

          {stripeCustomers && (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              {stripeCustomers.length === 0 ? (
                <p className="text-sm text-neutral-500">No Stripe customers found for this restaurant&apos;s email.</p>
              ) : (
                stripeCustomers.map((c) => (
                  <div key={c.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono text-white">{c.id}</span>
                      {c.isCurrentlyLinked && <Chip color="#22c55e">linked in Host Flow</Chip>}
                      <span className="text-neutral-500">created {formatDateTime(c.createdAt)}</span>
                    </div>
                    {c.subscriptions.length === 0 ? (
                      <p className="mt-2 text-xs text-neutral-500">No subscriptions on this customer.</p>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {c.subscriptions.map((s) => (
                          <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md bg-black/20 px-2 py-1.5 text-xs">
                            <span className="font-mono text-neutral-300">{s.id}</span>
                            <Chip color={s.status === "active" || s.status === "trialing" ? "#22c55e" : s.status === "canceled" ? "#6b7280" : "#f59e0b"}>
                              {s.status}
                              {s.cancelAtPeriodEnd ? " (cancels at period end)" : ""}
                            </Chip>
                            {s.amountCents != null && (
                              <span className="text-neutral-400">
                                {formatCents(s.amountCents)}/{s.currency?.toUpperCase()}
                              </span>
                            )}
                            {s.currentPeriodEnd && <span className="text-neutral-500">renews {formatDate(s.currentPeriodEnd)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle
            action={
              <Button size="sm" disabled={emailLoading} onClick={loadEmailHealth}>
                {emailLoading ? "Loading…" : emailHealth ? "Refresh" : "Check email health"}
              </Button>
            }
          >
            Guest email health
          </SectionTitle>
          <p className="mb-3 text-xs text-neutral-500">
            Last 30 days: what was sent, what Resend says happened to it, and how many bookings never had an email address to send to.
          </p>
          {emailHealth && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><p className="text-neutral-500">Bookings</p><p className="text-lg font-bold text-white">{emailHealth.bookings.total}</p></div>
                <div><p className="text-neutral-500">With an email</p><p className="text-lg font-bold text-white">{emailHealth.bookings.withEmail}</p></div>
                <div>
                  <p className="text-neutral-500">No email given</p>
                  <p className="text-lg font-bold text-amber-300">{emailHealth.bookings.withoutEmail}</p>
                  <p className="text-[10px] text-neutral-500">{Object.entries(emailHealth.bookings.withoutEmailBySource).map(([s, n]) => `${s.toLowerCase()} ${n}`).join(" · ")}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Had email, no confirmation</p>
                  <p className={"text-lg font-bold " + (emailHealth.bookings.withEmailButNoConfirmation.length ? "text-red-300" : "text-white")}>{emailHealth.bookings.withEmailButNoConfirmation.length}</p>
                </div>
              </div>
              {Object.keys(emailHealth.summary).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(emailHealth.summary).map(([kind, statuses]) => (
                    <div key={kind} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                      <span className="font-semibold text-neutral-200">{kind.replace(/_/g, " ").toLowerCase()}</span>
                      <span className="ml-2 text-neutral-400">{Object.entries(statuses).map(([s, n]) => `${n} ${s.toLowerCase()}`).join(", ")}</span>
                    </div>
                  ))}
                </div>
              )}
              {emailHealth.bookings.withEmailButNoConfirmation.length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-red-200">
                  Bookings that had an email but never got a confirmation:{" "}
                  {emailHealth.bookings.withEmailButNoConfirmation.slice(0, 8).map((b) => `${b.name} (${b.source.toLowerCase()}, ${formatDateTime(b.createdAt)})`).join("; ")}
                </div>
              )}
              <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
                {emailHealth.recent.length === 0 ? (
                  <p className="p-3 text-neutral-500">No emails in the last 30 days.</p>
                ) : (
                  emailHealth.recent.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-white/5 px-2.5 py-1.5 last:border-0">
                      <span className="w-28 shrink-0 text-neutral-500">{formatDateTime(r.createdAt)}</span>
                      <span className="w-36 shrink-0 text-neutral-300">{r.kind.replace(/_/g, " ").toLowerCase()}</span>
                      <span className="w-40 shrink-0 truncate font-mono text-neutral-400">{r.to}</span>
                      <Chip color={STATUS_COLOR[r.status] ?? "#6b7280"}>{r.status.toLowerCase()}</Chip>
                      {r.clickedAt && <Chip color="#22c55e">review clicked</Chip>}
                      {r.error && <span className="truncate text-red-300" title={r.error}>{r.error.slice(0, 80)}</span>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle>Blackout dates</SectionTitle>
          <p className="mb-3 text-xs text-neutral-500">
            Dates this restaurant is closed to online bookings — a full-day blackout here blocks every slot on that
            date regardless of opening hours. Useful if a guest reports &quot;no availability&quot; on a day that should be open.
          </p>
          {restaurant.upcomingBlackouts.length === 0 ? (
            <p className="text-sm text-neutral-500">No upcoming blackout dates.</p>
          ) : (
            <div className="space-y-1.5">
              {restaurant.upcomingBlackouts.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-white">{b.dateLabel}</span>{" "}
                    <span className="text-neutral-400">
                      {b.fullDay ? "· full day" : `· ${b.startTime}–${b.endTime}`}
                      {b.reason ? ` · ${b.reason}` : ""}
                    </span>
                  </div>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => removeBlackout(b.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <EmailDesignEditor restaurantId={restaurant.id} restaurantName={restaurant.name} />

        <Card className="p-4">
          <SectionTitle>Recent bookings</SectionTitle>
          <div className="space-y-2">
            {restaurant.recentBookings.length === 0 && <p className="text-sm text-neutral-500">No bookings yet.</p>}
            {restaurant.recentBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                <span className="font-medium text-white">
                  {b.customerName} <span className="text-neutral-500">· party of {b.partySize}</span>
                </span>
                <div className="flex items-center gap-2">
                  <Chip>{b.status}</Chip>
                  <span className="text-xs text-neutral-500">{b.reservationTimeLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <SectionTitle action={!cloneSources ? <Button size="sm" onClick={loadCloneSources}>Choose a venue…</Button> : undefined}>Copy setup from another venue</SectionTitle>
          <p className="mb-3 text-xs text-neutral-500">
            Puts another venue&apos;s floor plan (areas and tables), opening hours, settings, email design and look &amp; feel onto this one. For a
            freshly signed-up account that should match one you prepared. Accounts, bookings and billing are never touched. Refuses to replace a
            floor plan when this venue already has bookings.
          </p>
          {cloneSources && (
            <div className="space-y-2 text-xs">
              <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)} className="w-full max-w-md rounded-md border border-white/15 bg-neutral-900 px-2 py-1.5 text-white">
                <option value="">Copy from…</option>
                {cloneSources.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} — {v.sections} areas, {v.tables} tables</option>
                ))}
              </select>
              <div className="flex flex-wrap gap-3">
                {([["floorPlan", "Floor plan (areas + tables)"], ["hours", "Opening hours"], ["settings", "Settings (pacing, no-show, brand kit, areas notes)"], ["emailDesign", "Email design"], ["profile", "Look & feel, timezone, party size"]] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1.5 text-neutral-300">
                    <input type="checkbox" checked={cloneParts[k]} onChange={(e) => setCloneParts((p) => ({ ...p, [k]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>
              <Button size="sm" variant="primary" disabled={busy || !cloneFrom} onClick={runClone}>Copy onto {restaurant.name}</Button>
              {cloneResult && <p className="text-emerald-400">Done — {cloneResult}. Refreshing…</p>}
            </div>
          )}
        </Card>

        <Card className="border-red-500/20 p-4">
          <SectionTitle>Delete venue</SectionTitle>
          <p className="mb-3 text-xs text-neutral-500">
            For test venues only. Removes the venue, its accounts, tables, bookings and emails permanently. Refuses any venue with a live paid or
            complimentary subscription. Type the slug <span className="font-mono text-neutral-300">{restaurant.slug}</span> to confirm.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={deleteSlug}
              onChange={(e) => setDeleteSlug(e.target.value)}
              placeholder={restaurant.slug}
              className="w-72 rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-red-400"
            />
            <Button size="sm" variant="danger" disabled={busy || deleteSlug.trim() !== restaurant.slug} onClick={deleteVenue}>
              Delete permanently
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}

const PATH_META: Record<UpgradePreview["path"], { label: string; color: string }> = {
  CHANGE_IN_PLACE: { label: "Ready — upgrades in place, prorated", color: "#22c55e" },
  CHECKOUT: { label: "Would open a new Checkout", color: "#f59e0b" },
  ALREADY_ON_PLAN: { label: "Already on this plan", color: "#3b82f6" },
  COMPLIMENTARY: { label: "Complimentary", color: "#a855f7" },
};

function UpgradePreviewCard({ preview }: { preview: UpgradePreview }) {
  const ok = preview.blockers.length === 0 && preview.path === "CHANGE_IN_PLACE";
  const path = PATH_META[preview.path];
  const cur = preview.target.currency ?? preview.stripe?.currency ?? "usd";
  return (
    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-white">Upgrade to {preview.target.name}</span>
        <Chip color={preview.blockers.length ? "#ef4444" : path.color}>{preview.blockers.length ? "Blocked" : path.label}</Chip>
        {preview.relinked && <Chip color="#3b82f6">relinked to Stripe&apos;s live subscription</Chip>}
      </div>

      {ok && preview.charge && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
            <p className="text-xs text-emerald-300/80">Charged today</p>
            <p className="text-xl font-bold text-white">{money(preview.charge.dueNowCents, preview.charge.currency)}</p>
            <p className="text-[11px] text-neutral-400">the rest of this period at the new price, minus what was already paid</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs text-neutral-500">Then every month</p>
            <p className="text-xl font-bold text-white">{money(preview.charge.nextInvoiceCents, preview.charge.currency)}</p>
            <p className="text-[11px] text-neutral-400">
              first full charge {preview.charge.nextInvoiceDate ? formatDate(preview.charge.nextInvoiceDate) : "at next renewal"}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs text-neutral-500">Paid with</p>
            <p className="text-sm text-white">{preview.stripe?.paymentMethod ?? "—"}</p>
            <p className="text-[11px] text-neutral-400">Premium features switch on the moment they click Upgrade</p>
          </div>
        </div>
      )}

      {preview.blockers.map((b) => (
        <div key={b} className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-200">
          ✕ {b}
        </div>
      ))}
      {preview.warnings.map((w) => (
        <div key={w} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-100">
          ⚠ {w}
        </div>
      ))}

      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <p className="text-neutral-500">Host Flow says</p>
          <p className="text-white">
            {preview.local.status} · {preview.local.planName ?? "no plan"}
          </p>
          <p className="font-mono text-[10px] text-neutral-500">{preview.local.stripeSubscriptionId ?? "no subscription id"}</p>
        </div>
        <div>
          <p className="text-neutral-500">Stripe says</p>
          <p className="text-white">
            {preview.stripe ? `${preview.stripe.status}${preview.stripe.cancelAtPeriodEnd ? " (cancels at period end)" : ""}` : "—"}
          </p>
          <p className="text-[10px] text-neutral-500">
            {preview.stripe?.amountCents != null && preview.stripe.currency
              ? `${money(preview.stripe.amountCents, preview.stripe.currency)}/${preview.stripe.interval ?? "period"} · renews ${preview.stripe.currentPeriodEnd ? formatDate(preview.stripe.currentPeriodEnd) : "—"}`
              : ""}
          </p>
        </div>
        <div>
          <p className="text-neutral-500">Latest invoice</p>
          {preview.stripe?.latestInvoice ? (
            <>
              <p className="text-white">
                {preview.stripe.latestInvoice.status} · {money(preview.stripe.latestInvoice.amountDueCents, preview.stripe.latestInvoice.currency)}
              </p>
              {preview.stripe.latestInvoice.hostedUrl && (
                <a className="text-[10px] text-blue-300 underline" href={preview.stripe.latestInvoice.hostedUrl} target="_blank" rel="noreferrer">
                  open in Stripe
                </a>
              )}
            </>
          ) : (
            <p className="text-white">—</p>
          )}
        </div>
        <div>
          <p className="text-neutral-500">{preview.target.name} price</p>
          <p className="text-white">
            {preview.target.amountCents != null ? `${money(preview.target.amountCents, cur)}/${preview.target.interval ?? "month"}` : "not found"}
          </p>
          <p className="font-mono text-[10px] text-neutral-500">{preview.target.priceId ?? ""}</p>
        </div>
      </div>

      {preview.charge && preview.charge.lines.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-neutral-400">Stripe&apos;s line items</summary>
          <div className="mt-2 space-y-1">
            {preview.charge.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-3 rounded-md bg-black/20 px-2 py-1.5">
                <span className="text-neutral-300">
                  {l.description || "(no description)"} {l.proration && <span className="text-neutral-500">· charged now</span>}
                </span>
                <span className={l.amountCents < 0 ? "text-emerald-300" : "text-white"}>{money(l.amountCents, preview.charge!.currency)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
