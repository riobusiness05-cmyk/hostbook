"use client";

import { useState } from "react";

type Blackout = {
  id: string;
  date: string;
  fullDay: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
};

export default function BlackoutSettings({ initial }: { initial: Blackout[] }) {
  const [blackouts, setBlackouts] = useState(initial);
  const [form, setForm] = useState({
    date: "",
    fullDay: true,
    startTime: "",
    endTime: "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);

  async function addBlackout() {
    if (!form.date) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/blackouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          fullDay: form.fullDay,
          startTime: form.fullDay ? undefined : form.startTime,
          endTime: form.fullDay ? undefined : form.endTime,
          reason: form.reason || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBlackouts((prev) => [...prev, data.blackout].sort((a, b) => a.date.localeCompare(b.date)));
        setForm({ date: "", fullDay: true, startTime: "", endTime: "", reason: "" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/blackouts/${id}`, { method: "DELETE" });
    setBlackouts((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="mb-1 text-lg font-semibold">Blocked dates &amp; private events</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Block a full day (holiday closure) or a time window (private event) — the AI chatbot and booking form will
        stop offering those slots automatically.
      </p>

      <div className="space-y-2">
        {blackouts.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-lg border border-black/5 px-3 py-2 text-sm">
            <div>
              <span className="font-medium">{b.date}</span>{" "}
              <span className="text-neutral-500">
                {b.fullDay ? "Closed all day" : `Blocked ${b.startTime}–${b.endTime}`}
                {b.reason ? ` · ${b.reason}` : ""}
              </span>
            </div>
            <button onClick={() => remove(b.id)} className="text-xs text-red-600 hover:underline">
              Remove
            </button>
          </div>
        ))}
        {blackouts.length === 0 && <p className="text-sm text-neutral-500">No blocked dates.</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-black/5 pt-4">
        <label className="flex flex-col gap-1 text-xs">
          Date
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            className="rounded-lg border border-black/10 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={form.fullDay}
            onChange={(e) => setForm((p) => ({ ...p, fullDay: e.target.checked }))}
          />
          Full day
        </label>
        {!form.fullDay && (
          <>
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
              className="rounded-lg border border-black/10 px-2 py-1.5 text-sm"
            />
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
              className="rounded-lg border border-black/10 px-2 py-1.5 text-sm"
            />
          </>
        )}
        <input
          placeholder="Reason (optional)"
          value={form.reason}
          onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
          className="w-40 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
        />
        <button
          onClick={addBlackout}
          disabled={busy || !form.date}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </section>
  );
}
