"use client";

import type { FloorState } from "@/lib/hostflow/floor";
import { Card, Gauge, Sparkline, StatCard } from "./ui";
import { minutesLabel } from "@/lib/host/format";

export function DashboardMetrics({ state }: { state: FloorState }) {
  const { metrics: m, rush } = state;

  const healthTone = m.serviceHealthScore >= 80 ? "good" : m.serviceHealthScore >= 55 ? "warn" : "bad";
  const kitchenTone = m.kitchenLoad >= 90 ? "bad" : m.kitchenLoad >= 75 ? "warn" : "default";
  const occTone =
    m.occupancyPct >= state.settings.maxOccupancyPct ? "bad" : m.occupancyPct >= 70 ? "warn" : "default";

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Covers" value={m.covers} sub={`${m.counts.OCCUPIED} tables seated`} />
        <StatCard label="Occupancy" value={`${m.occupancyPct}%`} sub={`${m.seatsAvailable} seats free`} tone={occTone as any} />
        <StatCard label="Available" value={m.counts.AVAILABLE} accent="#22c55e" />
        <StatCard label="Occupied" value={m.counts.OCCUPIED} accent="#ef4444" />
        <StatCard label="Reserved" value={m.counts.RESERVED + m.counts.ARRIVING_SOON} accent="#3b82f6" />
        <StatCard label="Dirty" value={m.counts.DIRTY + m.counts.CLEANING} accent="#9ca3af" />
        <StatCard label="Late" value={m.lateReservations} accent="#a855f7" tone={m.lateReservations ? "warn" : "default"} />
        <StatCard label="Walk-ins" value={m.walkinsWaiting} sub={`${m.walkinCoversWaiting} covers`} accent="#f97316" />
        <StatCard label="Avg wait" value={m.avgQuotedWait ? minutesLabel(m.avgQuotedWait) : "—"} />
        <StatCard label="Arrivals ≤1h" value={m.upcomingArrivals} />
        <StatCard label="Dining pace" value={m.diningPace} sub="freeing ≤30m" />
        <StatCard label="Kitchen load" value={`${m.kitchenLoad}%`} tone={kitchenTone as any} />
      </div>

      {/* Rush + health */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[420px]">
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Predicted rush
              </p>
              <p className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">
                {rush.peakLabel}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                ~{rush.peakOccupancyPct}% peak
                {rush.predictedWaitMinutes > 0 ? ` · ${minutesLabel(rush.predictedWaitMinutes)} wait` : ""}
              </p>
            </div>
          </div>
          <div className="mt-2">
            <Sparkline points={rush.points} maxPct={state.settings.maxOccupancyPct} peakMinute={rush.minutesToPeak} />
            <div className="flex justify-between text-[9px] text-neutral-400">
              <span>now</span>
              <span>+1h</span>
              <span>+2h</span>
            </div>
          </div>
        </Card>

        <Card className="flex items-center gap-3 p-4">
          <Gauge value={m.serviceHealthScore} label="Health" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Service health
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-800 dark:text-neutral-100">
              {healthTone === "good" ? "Running smoothly" : healthTone === "warn" ? "Needs attention" : "Under pressure"}
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {m.lateReservations} late · {m.counts.DIRTY + m.counts.CLEANING} to clean · {m.walkinsWaiting} waiting
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
