"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "./ui";
import * as api from "@/lib/host/client";

// This month's post-visit emails at a glance. Review clicks need click
// tracking switched on for the sending domain in Resend.
export function EmailStatsCard() {
  const [stats, setStats] = useState<api.EmailStats | null>(null);
  useEffect(() => {
    api.fetchEmailStats().then(setStats).catch(() => setStats({ sent: 0, opened: 0, clicked: 0, bounced: 0, openRate: 0, premium: false }));
  }, []);
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
      ) : !stats.premium ? (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          Thank-you emails with your Google review link, sent when a table is finished —{" "}
          <Link href="/host/settings" className="font-medium text-sky-600 hover:underline dark:text-sky-400">part of Premium</Link>.
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div>
            <p className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.sent}</p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">sent</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-neutral-900 dark:text-white">{stats.openRate}%</p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">opened</p>
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
