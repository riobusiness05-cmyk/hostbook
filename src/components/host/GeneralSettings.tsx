"use client";

import { useState } from "react";
import { Card, Button, SectionTitle } from "./ui";
import * as api from "@/lib/host/client";
import type { SettingsDTO } from "@/lib/hostflow/floor";

const inputCls =
  "mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-sky-500 dark:border-white/15 dark:bg-white/5 dark:text-white";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400">
      {label}
      {children}
      {hint && <span className="mt-1 block text-[11px] font-normal text-neutral-400">{hint}</span>}
    </label>
  );
}

export function GeneralSettings({ initialSettings }: { initialSettings: SettingsDTO }) {
  const [form, setForm] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof SettingsDTO>(key: K, value: SettingsDTO[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateSettings({
        avgDiningMinutes: form.avgDiningMinutes,
        cleaningMinutes: form.cleaningMinutes,
        arrivingSoonThresholdMinutes: form.arrivingSoonThresholdMinutes,
        lateThresholdMinutes: form.lateThresholdMinutes,
        maxOccupancyPct: form.maxOccupancyPct,
        maxBookingsPer15Min: form.maxBookingsPer15Min,
        bookingWindowDays: form.bookingWindowDays,
        aiAssistantEnabled: form.aiAssistantEnabled,
        depositPerPersonCents: form.depositPerPersonCents,
        serviceChargePct: form.serviceChargePct,
        cancellationPolicy: form.cancellationPolicy,
      });
      setForm(updated);
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
        <SectionTitle>Service pacing</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Booking interval — max reservations per 15 min" hint="Caps how many parties can be booked into the same slot, regardless of table availability.">
            <input type="number" min={1} max={50} className={inputCls} value={form.maxBookingsPer15Min} onChange={(e) => set("maxBookingsPer15Min", Number(e.target.value))} />
          </Field>
          <Field label="Maximum occupancy %" hint="Caps how full the floor can get before it's flagged as at-capacity.">
            <input type="number" min={10} max={100} className={inputCls} value={form.maxOccupancyPct} onChange={(e) => set("maxOccupancyPct", Number(e.target.value))} />
          </Field>
          <Field label="Average dining time (minutes)">
            <input type="number" min={30} max={240} className={inputCls} value={form.avgDiningMinutes} onChange={(e) => set("avgDiningMinutes", Number(e.target.value))} />
          </Field>
          <Field label="Cleaning time between seatings (minutes)">
            <input type="number" min={0} max={60} className={inputCls} value={form.cleaningMinutes} onChange={(e) => set("cleaningMinutes", Number(e.target.value))} />
          </Field>
          <Field label="Arriving soon threshold (minutes)" hint="How close to their booking time a table turns 'arriving soon' on the floor plan.">
            <input type="number" min={1} max={120} className={inputCls} value={form.arrivingSoonThresholdMinutes} onChange={(e) => set("arrivingSoonThresholdMinutes", Number(e.target.value))} />
          </Field>
          <Field label="Late threshold (minutes)" hint="How late a reservation can run before it's flagged.">
            <input type="number" min={1} max={120} className={inputCls} value={form.lateThresholdMinutes} onChange={(e) => set("lateThresholdMinutes", Number(e.target.value))} />
          </Field>
          <Field label="Booking window (days ahead)" hint="How far in advance guests can book online.">
            <input type="number" min={1} max={365} className={inputCls} value={form.bookingWindowDays} onChange={(e) => set("bookingWindowDays", Number(e.target.value))} />
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
          <input type="checkbox" checked={form.aiAssistantEnabled} onChange={(e) => set("aiAssistantEnabled", e.target.checked)} />
          AI host assistant enabled
        </label>
      </Card>

      <Card className="p-5">
        <SectionTitle>Booking policy</SectionTitle>
        <p className="mb-3 text-xs text-neutral-400">Shown to guests by the AI assistant when they ask about booking conditions.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="No-show deposit per person (€)" hint="Leave blank for no deposit.">
            <input
              type="number"
              min={0}
              step={0.5}
              className={inputCls}
              value={form.depositPerPersonCents != null ? form.depositPerPersonCents / 100 : ""}
              onChange={(e) => set("depositPerPersonCents", e.target.value === "" ? null : Math.round(Number(e.target.value) * 100))}
            />
          </Field>
          <Field label="Service charge %" hint="Leave blank for no service charge.">
            <input
              type="number"
              min={0}
              max={100}
              className={inputCls}
              value={form.serviceChargePct ?? ""}
              onChange={(e) => set("serviceChargePct", e.target.value === "" ? null : Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Cancellation policy" hint="Free text — e.g. notice period required to avoid the deposit charge.">
          <textarea
            className={inputCls}
            rows={3}
            value={form.cancellationPolicy ?? ""}
            onChange={(e) => set("cancellationPolicy", e.target.value || null)}
          />
        </Field>
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
      </div>
    </div>
  );
}
