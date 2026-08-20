"use client";

import { useState } from "react";
import Link from "next/link";
import { Chip, Button, StatCard, Card, SectionTitle } from "@/components/host/ui";
import { HostFlowLogo } from "@/components/HostFlowLogo";
import { STATUS_META, formatCents, formatDate, formatDateTime } from "./format";
import type { RestaurantDetail as RestaurantDetailData } from "@/lib/platformAdmin";

export function RestaurantDetail({ restaurant }: { restaurant: RestaurantDetailData }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState(7);

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
          </div>
        </Card>

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
      </main>
    </div>
  );
}
