"use client";

import { useState } from "react";
import { Card, Button, SectionTitle } from "./ui";
import * as api from "@/lib/host/client";
import type { HourRow } from "@/lib/host/client";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function defaultRow(dayOfWeek: number): HourRow {
  return { dayOfWeek, openTime: "17:00", closeTime: "22:00", isClosed: dayOfWeek === 1 };
}

export function HoursSettings({ initialHours }: { initialHours: HourRow[] }) {
  const byDay = new Map(initialHours.map((h) => [h.dayOfWeek, h]));
  const [hours, setHours] = useState<HourRow[]>(
    Array.from({ length: 7 }, (_, dow) => byDay.get(dow) ?? defaultRow(dow))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (dow: number, patch: Partial<HourRow>) => {
    setHours((prev) => prev.map((h) => (h.dayOfWeek === dow ? { ...h, ...patch } : h)));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateHours(hours);
      const map = new Map(updated.map((h) => [h.dayOfWeek, h]));
      setHours(Array.from({ length: 7 }, (_, dow) => map.get(dow) ?? defaultRow(dow)));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">{error}</Card>
      )}

      <Card className="p-5">
        <SectionTitle>Opening hours</SectionTitle>
        <div className="space-y-2">
          {hours.map((h) => (
            <div key={h.dayOfWeek} className="flex flex-wrap items-center gap-3 border-b border-black/5 py-2 last:border-0 dark:border-white/10">
              <label className="flex w-32 shrink-0 items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
                <input
                  type="checkbox"
                  checked={!h.isClosed}
                  onChange={(e) => update(h.dayOfWeek, { isClosed: !e.target.checked })}
                />
                {DAY_NAMES[h.dayOfWeek]}
              </label>
              {h.isClosed ? (
                <span className="text-sm text-neutral-400">Closed</span>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-sky-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
                    value={h.openTime}
                    onChange={(e) => update(h.dayOfWeek, { openTime: e.target.value })}
                  />
                  <span className="text-neutral-400">–</span>
                  <input
                    type="time"
                    className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-sky-500 dark:border-white/15 dark:bg-white/5 dark:text-white"
                    value={h.closeTime}
                    onChange={(e) => update(h.dayOfWeek, { closeTime: e.target.value })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save hours"}
        </Button>
        {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
      </div>
    </div>
  );
}
