"use client";

import { useState } from "react";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  category: string;
  allergens: string | null;
  isAvailable: boolean;
};

export default function MenuSettings({ initial }: { initial: MenuItem[] }) {
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState({ name: "", description: "", price: "", category: "Menu", allergens: "" });
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!form.name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          price: form.price ? Number(form.price) : undefined,
          category: form.category,
          allergens: form.allergens || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setItems((prev) => [...prev, data.item]);
        setForm({ name: "", description: "", price: "", category: "Menu", allergens: "" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleAvailable(id: string, isAvailable: boolean) {
    await fetch(`/api/admin/menu/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAvailable }),
    });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isAvailable } : i)));
  }

  async function remove(id: string) {
    await fetch(`/api/admin/menu/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="mb-1 text-lg font-semibold">Menu</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Also feeds the AI chatbot — it will only mention items and prices listed here, never invent them.
      </p>

      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded-lg border border-black/5 px-3 py-2 text-sm">
            <div>
              <span className="font-medium">{i.name}</span>
              {i.price != null && <span className="ml-2 text-neutral-500">${i.price.toFixed(2)}</span>}
              {i.description && <div className="text-xs text-neutral-500">{i.description}</div>}
              {i.allergens && <div className="text-xs text-amber-700">Contains: {i.allergens}</div>}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs text-neutral-500">
                <input
                  type="checkbox"
                  checked={i.isAvailable}
                  onChange={(e) => toggleAvailable(i.id, e.target.checked)}
                />
                Available
              </label>
              <button onClick={() => remove(i.id)} className="text-xs text-red-600 hover:underline">
                Remove
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-neutral-500">No menu items yet — add one below.</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-black/5 pt-4">
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          className="w-40 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          className="w-48 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
        />
        <input
          placeholder="Price"
          type="number"
          step="0.01"
          value={form.price}
          onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
          className="w-24 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
        />
        <input
          placeholder="Category"
          value={form.category}
          onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
          className="w-28 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
        />
        <input
          placeholder="Allergens (comma-separated)"
          value={form.allergens}
          onChange={(e) => setForm((p) => ({ ...p, allergens: e.target.value }))}
          className="w-48 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
        />
        <button
          onClick={add}
          disabled={busy || !form.name}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Add item
        </button>
      </div>
    </section>
  );
}
