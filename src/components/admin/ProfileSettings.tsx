"use client";

import { useState } from "react";

type Profile = {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  brandColor: string;
  welcomeMessage: string;
  maxPartySize: number;
  defaultReservationMinutes: number;
};

export default function ProfileSettings({ initial }: { initial: Profile }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/restaurant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="mb-4 text-lg font-semibold">Restaurant profile</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" value={form.name} onChange={(v) => set("name", v)} />
        <Field label="Tagline" value={form.tagline ?? ""} onChange={(v) => set("tagline", v)} />
        <Field label="Address" value={form.address ?? ""} onChange={(v) => set("address", v)} />
        <Field label="Phone" value={form.phone ?? ""} onChange={(v) => set("phone", v)} />
        <Field label="Email" value={form.email ?? ""} onChange={(v) => set("email", v)} />
        <label className="flex flex-col gap-1 text-sm">
          Brand color
          <input
            type="color"
            value={form.brandColor}
            onChange={(e) => set("brandColor", e.target.value)}
            className="h-10 w-full rounded-lg border border-black/10"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Max party size (auto-bookable)
          <input
            type="number"
            min={1}
            value={form.maxPartySize}
            onChange={(e) => set("maxPartySize", Number(e.target.value))}
            className="rounded-lg border border-black/10 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Reservation length (minutes)
          <input
            type="number"
            min={15}
            step={15}
            value={form.defaultReservationMinutes}
            onChange={(e) => set("defaultReservationMinutes", Number(e.target.value))}
            className="rounded-lg border border-black/10 px-3 py-2"
          />
        </label>
      </div>
      <label className="mt-3 flex flex-col gap-1 text-sm">
        Chat welcome message
        <textarea
          value={form.welcomeMessage}
          onChange={(e) => set("welcomeMessage", e.target.value)}
          rows={2}
          className="rounded-lg border border-black/10 px-3 py-2"
        />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        {saved && <span className="text-sm text-green-700">Saved.</span>}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-black/10 px-3 py-2"
      />
    </label>
  );
}
