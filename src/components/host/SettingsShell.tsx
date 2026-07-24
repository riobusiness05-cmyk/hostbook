"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HostFlowMark } from "@/components/HostFlowLogo";
import { cx } from "@/lib/host/format";
import { BillingSection } from "./BillingSection";
import { GeneralSettings } from "./GeneralSettings";
import { HoursSettings } from "./HoursSettings";
import { TableAvailabilitySettings } from "./TableAvailabilitySettings";
import type { BillingState, PlanDTO } from "@/lib/billing/subscription";
import type { SettingsDTO } from "@/lib/hostflow/floor";
import type { HourRow, TableRow } from "@/lib/host/client";

type Tab = "billing" | "general" | "hours" | "tables";

const TABS: { id: Tab; label: string }[] = [
  { id: "billing", label: "Billing" },
  { id: "general", label: "General" },
  { id: "hours", label: "Hours" },
  { id: "tables", label: "Tables" },
];

export function SettingsShell({
  restaurantName,
  initialBilling,
  initialPlans,
  trialDays,
  initialSettings,
  initialHours,
  initialTables,
  blocked = false,
  checkoutResult = null,
}: {
  restaurantName: string;
  initialBilling: BillingState;
  initialPlans: PlanDTO[];
  trialDays: number;
  initialSettings: SettingsDTO;
  initialHours: HourRow[];
  initialTables: TableRow[];
  blocked?: boolean;
  checkoutResult?: "success" | "cancelled" | null;
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [tab, setTab] = useState<Tab>("billing");

  useEffect(() => {
    setTheme((localStorage.getItem("hf-theme") as "dark" | "light" | null) ?? "dark");
  }, []);

  return (
    <div className={cx(theme === "dark" && "dark")}>
      <div className="min-h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <header className="sticky top-0 z-30 border-b border-black/5 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/80">
          <div className="mx-auto flex max-w-[900px] items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 font-bold text-white">
                {restaurantName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">{restaurantName}</p>
                <p className="flex items-center gap-1 text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">
                  <HostFlowMark size={11} /> Settings
                </p>
              </div>
            </div>
            <Link
              href="/host"
              className="rounded-lg border border-black/10 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              ← Dashboard
            </Link>
          </div>
          <div className="mx-auto flex max-w-[900px] gap-1 overflow-x-auto px-4 pb-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cx(
                  "shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  tab === t.id
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        <main className="mx-auto max-w-[900px] p-4">
          {tab === "billing" && (
            <BillingSection
              initialBilling={initialBilling}
              initialPlans={initialPlans}
              trialDays={trialDays}
              blocked={blocked}
              checkoutResult={checkoutResult}
            />
          )}
          {tab === "general" && <GeneralSettings initialSettings={initialSettings} />}
          {tab === "hours" && <HoursSettings initialHours={initialHours} />}
          {tab === "tables" && <TableAvailabilitySettings initialTables={initialTables} />}
        </main>
      </div>
    </div>
  );
}
