"use client";

import { useState } from "react";

type Faq = { id: string; question: string; answer: string; category: string };

export default function FaqSettings({ initial }: { initial: Faq[] }) {
  const [faqs, setFaqs] = useState(initial);
  const [form, setForm] = useState({ question: "", answer: "", category: "General" });
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!form.question || !form.answer) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setFaqs((prev) => [...prev, data.faq]);
        setForm({ question: "", answer: "", category: "General" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/faqs/${id}`, { method: "DELETE" });
    setFaqs((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="mb-1 text-lg font-semibold">FAQs</h2>
      <p className="mb-4 text-xs text-neutral-500">
        These feed the AI chatbot directly — anything you add here, the bot can answer immediately.
      </p>

      <div className="space-y-2">
        {faqs.map((f) => (
          <div key={f.id} className="rounded-lg border border-black/5 px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{f.question}</p>
                <p className="text-neutral-500">{f.answer}</p>
              </div>
              <button onClick={() => remove(f.id)} className="shrink-0 text-xs text-red-600 hover:underline">
                Remove
              </button>
            </div>
          </div>
        ))}
        {faqs.length === 0 && <p className="text-sm text-neutral-500">No FAQs yet — add one below.</p>}
      </div>

      <div className="mt-4 space-y-2 border-t border-black/5 pt-4">
        <input
          placeholder="Question (e.g. Do you take walk-ins?)"
          value={form.question}
          onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))}
          className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Answer"
          value={form.answer}
          onChange={(e) => setForm((p) => ({ ...p, answer: e.target.value }))}
          rows={2}
          className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
        />
        <button
          onClick={add}
          disabled={busy || !form.question || !form.answer}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Add FAQ
        </button>
      </div>
    </section>
  );
}
