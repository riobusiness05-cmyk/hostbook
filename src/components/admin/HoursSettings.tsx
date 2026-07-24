"use client";

import { useState } from "react";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Hour = { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean };

export default function HoursSettings({ initial }: { initial: Hour[] }) {
  // Ensure all 7 days are present even if not yet seeded.
  const filled: Hour[] = Array.from({ length: 7 }, (_, dow) => {
    const existing = initial.find((h) => h.dayOfWeek === dow);
    return existing ?? { dayOfWeek: dow, openTime: "17:00", closeTime: "22:00", isClosed: dow === 1 };
  });

  const [hours, setHours] = useState(filled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function update(dow: number, patch: Partial<Hour>) {
    setHours((prev) => prev.map((h) => (h.dayOfWeek === dow ? { ...h, ...patch } : h)));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="mb-4 text-lg font-semibold">Opening hours</h2>
      <div className="space-y-2">
        {hours.map((h) => (
          <div key={h.dayOfWeek} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="w-24">{DAY_NAMES[h.dayOfWeek]}</span>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!h.isClosed}
                onChange={(e) => update(h.dayOfWeek, { isClosed: !e.target.checked })}
              />
              Open
            </label>
            {!h.isClosed && (
              <>
                <input
                  type="time"
                  value={h.openTime}
                  onChange={(e) => update(h.dayOfWeek, { openTime: e.target.value })}
                  className="rounded-lg border border-black/10 px-2 py-1"
                />
                <span className="text-neutral-400">to</span>
                <input
                  type="time"
                  value={h.closeTime}
                  onChange={(e) => update(h.dayOfWeek, { closeTime: e.target.value })}
                  className="rounded-lg border border-black/10 px-2 py-1"
                />
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save hours"}
        </button>
        {saved && <span className="text-sm text-green-700">Saved.</span>}
      </div>
    </section>
  );
}
