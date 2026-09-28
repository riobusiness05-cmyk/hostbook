"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "./ui";
import * as api from "@/lib/host/client";

// This month's post-visit emails at a glance. Delivered comes from Resend's
// webhook; review clicks from our own /r/… redirect on the button.
export function EmailStatsCard() {
  const [stats, setStats] = useState<api.EmailStats | null>(null);
  useEffect(() => {
    api.fetchEmailStats().then(setStats).catch(() => setStats({ sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, openRate: 0, premium: false }));
  }, []);
  // Not part of the Professional plan — the card simply doesn't exist for them.
  if (stats && !stats.premium) return null;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Guest emails · this month</p>
        <Link href="/host/settings" className="text-[10px] font-medium text-sky-600 hover:underline dark:text-sky-400">
          Brand kit →
        </Link>
      </div>
      {stats === null ? (
        <p className="mt-2 text-sm text-neutral-400">Loading…</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div>
            <p className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.sent}</p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">sent</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.delivered}</p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">delivered</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.clicked}</p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">review clicks</p>
          </div>
        </div>
      )}
    </Card>
  );
}
