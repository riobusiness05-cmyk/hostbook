"use client";

import { useState } from "react";

type Table = { id: string; name: string; capacityMin: number; capacityMax: number; isActive: boolean };

export default function TablesSettings({ initial }: { initial: Table[] }) {
  const [tables, setTables] = useState(initial);
  const [newTable, setNewTable] = useState({ name: "", capacityMin: 1, capacityMax: 2 });
  const [busy, setBusy] = useState(false);

  async function addTable() {
    if (!newTable.name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTable),
      });
      const data = await res.json();
      if (res.ok) {
        setTables((prev) => [...prev, data.table]);
        setNewTable({ name: "", capacityMin: 1, capacityMax: 2 });
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/admin/tables/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, isActive } : t)));
  }

  async function removeTable(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone — any booking history for this table will be lost.`)) {
      return;
    }
    const res = await fetch(`/api/admin/tables/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Couldn't delete that table.");
      return;
    }
    setTables((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="mb-1 text-lg font-semibold">Tables</h2>
      <p className="mb-4 text-xs text-neutral-500">
        The reservation engine matches party size to a table&apos;s min/max capacity — set these accurately so guests
        aren&apos;t seated at the wrong size table.
      </p>

      <div className="space-y-2">
        {tables.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border border-black/5 px-3 py-2 text-sm">
            <div>
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 text-neutral-500">
                seats {t.capacityMin}–{t.capacityMax}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs text-neutral-500">
                <input type="checkbox" checked={t.isActive} onChange={(e) => toggleActive(t.id, e.target.checked)} />
                Active
              </label>
              <button onClick={() => removeTable(t.id, t.name)} className="text-xs text-red-600 hover:underline">
                Remove
              </button>
            </div>
          </div>
        ))}
        {tables.length === 0 && <p className="text-sm text-neutral-500">No tables yet — add one below.</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-black/5 pt-4">
        <label className="flex flex-col gap-1 text-xs">
          Name
          <input
            value={newTable.name}
            onChange={(e) => setNewTable((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Patio 2"
            className="w-32 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Min seats
          <input
            type="number"
            min={1}
            value={newTable.capacityMin}
            onChange={(e) => setNewTable((p) => ({ ...p, capacityMin: Number(e.target.value) }))}
            className="w-20 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Max seats
          <input
            type="number"
            min={1}
            value={newTable.capacityMax}
            onChange={(e) => setNewTable((p) => ({ ...p, capacityMax: Number(e.target.value) }))}
            className="w-20 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          onClick={addTable}
          disabled={busy || !newTable.name}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Add table
        </button>
      </div>
    </section>
  );
}
