"use client";

import { useState } from "react";
import type { NotificationDTO } from "@/lib/hostflow/floor";
import { Button, Card, SectionTitle } from "./ui";
import { cx, relativeAgo } from "@/lib/host/format";
import * as api from "@/lib/host/client";

const SEVERITY_DOT: Record<string, string> = {
  INFO: "bg-sky-500",
  WARNING: "bg-amber-500",
  CRITICAL: "bg-red-500",
};

export function NotificationsPanel({
  notifications,
  refresh,
}: {
  notifications: NotificationDTO[];
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const unread = notifications.filter((n) => !n.isRead).length;

  const markAll = async () => {
    setBusy(true);
    try {
      await api.markNotifications();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex h-full flex-col p-4">
      <SectionTitle
        action={
          unread > 0 ? (
            <Button size="sm" variant="ghost" onClick={markAll} disabled={busy}>
              Mark all read
            </Button>
          ) : undefined
        }
      >
        Notifications{unread > 0 ? ` · ${unread}` : ""}
      </SectionTitle>

      <div className="-mx-1 flex-1 space-y-1.5 overflow-y-auto px-1">
        {notifications.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">All clear.</p>}
        {notifications.map((n) => (
          <div
            key={n.id}
            className={cx(
              "flex items-start gap-2.5 rounded-lg px-2.5 py-2",
              n.isRead ? "opacity-60" : "bg-black/[0.02] dark:bg-white/[0.03]"
            )}
          >
            <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[n.severity] ?? "bg-neutral-400")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{n.title}</p>
              {n.body && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{n.body}</p>}
              <p className="text-[10px] text-neutral-400">{relativeAgo(n.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
