"use client";

import { useEffect, useMemo, useState } from "react";
import type { FloorState } from "@/lib/hostflow/floor";
import { useFloorStream } from "@/lib/host/useFloorStream";
import { cx, localDateStr } from "@/lib/host/format";
import { DashboardMetrics } from "./DashboardMetrics";
import { FloorPlan } from "./FloorPlan";
import { TablePanel } from "./TablePanel";
import { WaitlistPanel } from "./WaitlistPanel";
import { ReservationsPanel } from "./ReservationsPanel";
import { CurrentlySeatedPanel } from "./CurrentlySeatedPanel";
import { AssistantPanel } from "./AssistantPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { OutdoorQueue } from "./OutdoorQueue";
import { DayView } from "./DayView";
import { HostFlowMark } from "@/components/HostFlowLogo";
import type { BillingState } from "@/lib/billing/subscription";
import Link from "next/link";

type RailTab = "waitlist" | "reservations" | "seated" | "assistant" | "alerts";

// Keyed off the RESTAURANT's timezone (FloorState.timezone), not the
// viewing device's — otherwise "Today" can silently mean the wrong day for
// a host checking in from a device set to a different zone than the venue.
function todayStr(timeZone: string): string {
  return localDateStr(new Date().toISOString(), timeZone);
}
function tomorrowStr(timeZone: string): string {
  return localDateStr(new Date(Date.now() + 24 * 60 * 60000).toISOString(), timeZone);
}
function dayLabel(dateStr: string, timeZone: string): string {
  if (dateStr === todayStr(timeZone)) return "Today";
  if (dateStr === tomorrowStr(timeZone)) return "Tomorrow";
  const [y, m, d] = dateStr.split("-").map(Number);
  // Noon UTC sidesteps any date-boundary ambiguity when re-deriving a
  // weekday label from a bare calendar date — mirrors the "pure calendar
  // math stays in UTC" approach already used server-side.
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone });
}

export function HostApp({
  initialState,
  restaurantName,
  billing,
}: {
  initialState: FloorState;
  restaurantName: string;
  billing?: BillingState;
}) {
  const { state, status, refresh, setPaused } = useFloorStream(initialState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<RailTab>("waitlist");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [clock, setClock] = useState<string>("");

  // Theme persistence
  useEffect(() => {
    const saved = (localStorage.getItem("hf-theme") as "dark" | "light" | null) ?? "dark";
    setTheme(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem("hf-theme", theme);
  }, [theme]);

  // Live clock
  useEffect(() => {
    const update = () => setClock(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: state.timezone }));
    update();
    const id = setInterval(update, 15000);
    return () => clearInterval(id);
  }, [state.timezone]);

  const [viewDate, setViewDate] = useState<string>(todayStr(state.timezone));
  const isToday = viewDate === todayStr(state.timezone);

  // Below `lg`, the floor plan and the waitlist/reservations rail can't sit
  // side by side, so only one shows at a time — this picks which. Selecting
  // a table (from the floor or from search/lists) jumps to "list" so its
  // panel is immediately visible instead of requiring an extra tap.
  const [mobileView, setMobileView] = useState<"floor" | "list">("floor");
  const selectTable = (id: string | null) => {
    setSelectedId(id);
    setMobileView(id ? "list" : "floor");
  };

  const selected = useMemo(
    () => state.tables.find((t) => t.id === selectedId) ?? null,
    [state.tables, selectedId]
  );

  const unread = state.notifications.filter((n) => !n.isRead).length;

  return (
    <div className={cx(theme === "dark" && "dark")}>
      <div className="min-h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-black/5 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/80">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 font-bold text-white">
                {restaurantName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">{restaurantName}</p>
                <p className="flex items-center gap-1 text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">
                  <HostFlowMark size={11} /> Host Flow
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <DateToggle viewDate={viewDate} setViewDate={setViewDate} timezone={state.timezone} />
              <span className="hidden text-sm font-medium tabular-nums text-neutral-500 dark:text-neutral-400 sm:inline">
                {isToday ? clock : ""}
              </span>
              {isToday && <ConnBadge status={status} />}
              <button
                onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                className="rounded-lg border border-black/10 p-2 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? "☀️" : "🌙"}
              </button>
              <Link
                href="/host/settings"
                className="rounded-lg border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              >
                Settings
              </Link>
              <button
                onClick={async () => {
                  await fetch("/api/hostflow/logout", { method: "POST" });
                  window.location.href = "/hostflow/login";
                }}
                className="rounded-lg border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] space-y-3 p-3 sm:p-4">
          <BillingBanner billing={billing} />
          {!isToday ? (
            <DayView date={viewDate} dateLabel={dayLabel(viewDate, state.timezone)} />
          ) : (
          <>
          <DashboardMetrics state={state} />

          {/* Floor / List switcher — mobile only; lg+ shows both side by side */}
          <div className="flex gap-1 rounded-xl border border-black/5 bg-white/60 p-1 dark:border-white/10 dark:bg-white/[0.03] lg:hidden">
            <RailTabButton active={mobileView === "floor"} onClick={() => setMobileView("floor")}>
              Floor
            </RailTabButton>
            <RailTabButton active={mobileView === "list"} onClick={() => setMobileView("list")}>
              List {!selected && state.walkins.length + state.reservations.length > 0 && (
                <Badge>{state.walkins.length + state.reservations.length}</Badge>
              )}
            </RailTabButton>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_384px]">
            {/* Floor plan */}
            <div className={cx(mobileView === "floor" ? "block" : "hidden", "lg:block h-[68vh] min-h-[420px] lg:h-[calc(100vh-230px)]")}>
              <FloorPlan
                tables={state.tables}
                sections={state.sections}
                selectedId={selectedId}
                onSelect={selectTable}
                refresh={refresh}
                setPaused={setPaused}
              />
            </div>

            {/* Right rail */}
            <div className={cx(mobileView === "list" ? "block" : "hidden", "lg:block h-[68vh] min-h-[420px] lg:h-[calc(100vh-230px)]")}>
              {selected ? (
                <div className="h-full overflow-hidden rounded-2xl border border-black/5 shadow-sm dark:border-white/10">
                  <TablePanel table={selected} state={state} onClose={() => selectTable(null)} refresh={refresh} />
                </div>
              ) : (
                <div className="flex h-full flex-col gap-3">
                  {state.waitingToMoveOutside.length > 0 && (
                    <div className="max-h-[42%] shrink-0 overflow-y-auto">
                      <OutdoorQueue state={state} refresh={refresh} onSelectTable={selectTable} />
                    </div>
                  )}
                  <div className="flex shrink-0 gap-1 rounded-xl border border-black/5 bg-white/60 p-1 dark:border-white/10 dark:bg-white/[0.03]">
                    <RailTabButton active={tab === "waitlist"} onClick={() => setTab("waitlist")}>
                      Waitlist {state.walkins.length > 0 && <Badge>{state.walkins.length}</Badge>}
                    </RailTabButton>
                    <RailTabButton active={tab === "reservations"} onClick={() => setTab("reservations")}>
                      Bookings {state.reservations.length > 0 && <Badge>{state.reservations.length}</Badge>}
                    </RailTabButton>
                    <RailTabButton active={tab === "seated"} onClick={() => setTab("seated")}>
                      Seated {state.metrics.counts.OCCUPIED > 0 && <Badge>{state.metrics.counts.OCCUPIED}</Badge>}
                    </RailTabButton>
                    <RailTabButton active={tab === "assistant"} onClick={() => setTab("assistant")}>
                      AI
                    </RailTabButton>
                    <RailTabButton active={tab === "alerts"} onClick={() => setTab("alerts")}>
                      Alerts {unread > 0 && <Badge>{unread}</Badge>}
                    </RailTabButton>
                  </div>
                  <div className="min-h-0 flex-1">
                    {tab === "waitlist" && <WaitlistPanel state={state} refresh={refresh} />}
                    {tab === "reservations" && <ReservationsPanel state={state} refresh={refresh} onSelectTable={selectTable} setPaused={setPaused} />}
                    {tab === "seated" && <CurrentlySeatedPanel state={state} onSelectTable={selectTable} />}
                    {tab === "assistant" && <AssistantPanel refresh={refresh} />}
                    {tab === "alerts" && <NotificationsPanel notifications={state.notifications} refresh={refresh} />}
                  </div>
                </div>
              )}
            </div>
          </div>
          </>
          )}
        </main>
      </div>
    </div>
  );
}

function DateToggle({ viewDate, setViewDate, timezone }: { viewDate: string; setViewDate: (d: string) => void; timezone: string }) {
  const today = todayStr(timezone);
  const tomorrow = tomorrowStr(timezone);
  const isCustom = viewDate !== today && viewDate !== tomorrow;
  return (
    <div className="flex items-center gap-1 rounded-lg border border-black/10 bg-white/60 p-0.5 text-xs dark:border-white/15 dark:bg-white/5">
      <button
        onClick={() => setViewDate(today)}
        className={cx("rounded-md px-2.5 py-1 font-medium transition-colors", viewDate === today ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white")}
      >
        Today
      </button>
      <button
        onClick={() => setViewDate(tomorrow)}
        className={cx("rounded-md px-2.5 py-1 font-medium transition-colors", viewDate === tomorrow ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white")}
      >
        Tomorrow
      </button>
      <label
        className={cx(
          "relative flex cursor-pointer items-center rounded-md px-2 py-1 font-medium transition-colors",
          isCustom ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
        )}
        title="Pick a date"
      >
        📅
        <input
          type="date"
          min={today}
          value={viewDate}
          onChange={(e) => e.target.value && setViewDate(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

// Slim status bar — only renders for states worth a host's attention
// (trial winding down, a failed charge). Complimentary/Active/early-trial
// accounts see nothing here, so this never gets in the way day to day.
function BillingBanner({ billing }: { billing?: BillingState }) {
  if (!billing) return null;
  if (billing.status === "PAST_DUE") {
    return (
      <Link
        href="/host/settings"
        className="flex items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 text-sm text-orange-700 hover:bg-orange-500/15 dark:text-orange-300"
      >
        <span>⚠️ We couldn&apos;t process your last payment — update your payment method to avoid interruption.</span>
        <span className="font-semibold underline">Fix billing →</span>
      </Link>
    );
  }
  if (billing.status === "TRIAL" && billing.trialDaysRemaining != null && billing.trialDaysRemaining <= 7) {
    return (
      <Link
        href="/host/settings"
        className="flex items-center justify-between rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-700 hover:bg-sky-500/15 dark:text-sky-300"
      >
        <span>
          🎉 {billing.trialDaysRemaining === 0 ? "Your trial ends today" : `${billing.trialDaysRemaining} day${billing.trialDaysRemaining === 1 ? "" : "s"} left in your free trial`}
          .
        </span>
        <span className="font-semibold underline">Upgrade now →</span>
      </Link>
    );
  }
  return null;
}

function ConnBadge({ status }: { status: "connecting" | "live" | "polling" }) {
  const map = {
    live: { label: "Live", color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
    polling: { label: "Syncing", color: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
    connecting: { label: "Connecting", color: "bg-neutral-400", text: "text-neutral-500" },
  }[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium dark:bg-white/10", map.text)}>
      <span className={cx("h-2 w-2 rounded-full", map.color, status === "live" && "animate-pulse")} />
      {map.label}
    </span>
  );
}

function RailTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-white text-neutral-900 shadow-sm dark:bg-white/10 dark:text-white"
          : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
      )}
    >
      {children}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
      {children}
    </span>
  );
}
