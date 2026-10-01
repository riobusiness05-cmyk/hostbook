"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, SectionTitle } from "@/components/host/ui";
import { THANK_YOU_PLACEHOLDERS } from "@/lib/emailTemplate";

// Where a venue's bespoke thank-you email is designed: raw HTML on the
// left, the venue's real sample emails on the right, re-rendered as you
// type. Saved templates replace the built-in design for that venue.
export function EmailDesignEditor({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [savedHtml, setSavedHtml] = useState<string | null>(null);
  const [samples, setSamples] = useState<{ label: string; subject: string; html: string }[] | null>(null);
  const [sampleIdx, setSampleIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [sampleTo, setSampleTo] = useState("");
  const [sampleName, setSampleName] = useState("");
  const [sampleReview, setSampleReview] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/platform/email-design?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((d) => { setHtml(d.html ?? ""); setSavedHtml(d.html ?? null); })
      .catch(() => { setHtml(""); setSavedHtml(null); });
  }, [restaurantId]);

  // Preview the draft (or the built-in design when the draft is empty).
  const seq = useRef(0);
  useEffect(() => {
    if (html === null) return;
    const mine = ++seq.current;
    const id = setTimeout(async () => {
      try {
        const res = await fetch("/api/platform/email-design/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId, html }) });
        const d = await res.json();
        if (mine === seq.current && d.samples) setSamples(d.samples);
      } catch { /* keep the last render */ }
    }, 500);
    return () => clearTimeout(id);
  }, [html, restaurantId]);

  const save = async () => {
    if (html === null) return;
    setBusy(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/platform/email-design", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId, html }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.problems ? d.problems.join("\n") : d.error ?? "Couldn't save");
      setSavedHtml(html);
      setNote(`Saved — ${restaurantName}'s guests now get this design.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const clear = async () => {
    if (!window.confirm(`Remove the custom design? ${restaurantName} goes back to the built-in email.`)) return;
    setBusy(true); setError(null); setNote(null);
    try {
      const res = await fetch(`/api/platform/email-design?restaurantId=${restaurantId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't remove");
      setHtml(""); setSavedHtml(null);
      setNote("Removed — back to the built-in design.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  // One real email with the design in the box (saved or not) — for showing
  // an owner what their guests would get, in an actual inbox.
  const sendSample = async () => {
    if (html === null) return;
    setSending(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/platform/email-design/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, html, to: sampleTo.trim(), guestName: sampleName.trim() || undefined, reviewUrl: sampleReview.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.problems ? d.problems.join("\n") : d.error ?? "Couldn't send");
      setNote(`Sample sent to ${d.to} — "${d.subject}". Check the inbox (and spam, the first time).`);
    } catch (e) { setError((e as Error).message); } finally { setSending(false); }
  };

  const dirty = html !== null && (html || null) !== savedHtml;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Guest email design</SectionTitle>
        <div className="flex items-center gap-2 text-xs">
          <span className={"rounded-md px-1.5 py-0.5 font-semibold " + (savedHtml ? "bg-emerald-500/15 text-emerald-400" : "bg-neutral-500/15 text-neutral-400")}>
            {savedHtml ? "Custom design live" : "Built-in design"}
          </span>
          <button type="button" className="text-sky-400 hover:underline" onClick={() => setShowKeys((v) => !v)}>
            {showKeys ? "Hide placeholders" : "Placeholders"}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        Paste a full HTML email. The venue&apos;s words and links drop in through placeholders; the preview shows it with their real sample emails.
        Leave it empty to use the built-in design.
      </p>
      {showKeys && (
        <div className="mb-3 grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] sm:grid-cols-2">
          {THANK_YOU_PLACEHOLDERS.map((p) => (
            <div key={p.key} className="flex gap-2">
              <code className="shrink-0 text-sky-300">{p.raw ? `{{{${p.key}}}}` : `{{${p.key}}}`}</code>
              <span className="text-neutral-400">{p.about}</span>
            </div>
          ))}
          <div className="text-neutral-500 sm:col-span-2">Optional parts: wrap them as <code className="text-sky-300">{"{{#review_url}}…{{/review_url}}"}</code> so they vanish when the venue hasn&apos;t set that value.</div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <textarea
          spellCheck={false}
          className="h-[560px] w-full rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[12px] leading-relaxed text-neutral-200 outline-none focus:border-sky-500"
          placeholder="<!DOCTYPE html> … {{{message}}} … {{unsubscribe_url}} …"
          value={html ?? ""}
          onChange={(e) => setHtml(e.target.value)}
        />
        <div className="overflow-hidden rounded-lg border border-white/10 bg-[#f6f4f0]">
          <div className="flex items-center gap-1 border-b border-black/10 bg-white px-2 py-1.5 text-[11px]">
            {(samples ?? []).map((s, i) => (
              <button key={s.label} type="button" onClick={() => setSampleIdx(i)} className={"rounded px-2 py-0.5 " + (i === sampleIdx ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100")}>
                {s.label}
              </button>
            ))}
            {samples?.[sampleIdx] && <span className="ml-auto truncate text-neutral-500">Subject: {samples[sampleIdx].subject}</span>}
          </div>
          <iframe title="Email preview" srcDoc={samples?.[sampleIdx]?.html ?? ""} className="h-[520px] w-full" />
        </div>
      </div>
      {error && <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</pre>}
      {note && <p className="mt-3 text-xs text-emerald-400">{note}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy || !dirty || !(html ?? "").trim()} onClick={save}>{busy ? "Saving…" : "Save design"}</Button>
        {savedHtml && <Button variant="danger" disabled={busy} onClick={clear}>Remove custom design</Button>}
      </div>
      <div className="mt-4 border-t border-white/10 pt-3">
        <p className="mb-2 text-xs text-neutral-500">
          Send a sample of the design above to any inbox — works before it&apos;s saved and before the venue is on Premium. Comes from {restaurantName}, exactly as a guest would get it.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            aria-label="Send sample to"
            placeholder="send to — you@example.com"
            value={sampleTo}
            onChange={(e) => setSampleTo(e.target.value)}
            className="w-64 rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-sky-500"
          />
          <input
            type="text"
            aria-label="Guest first name"
            placeholder="guest first name (optional)"
            value={sampleName}
            onChange={(e) => setSampleName(e.target.value)}
            className="w-48 rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-sky-500"
          />
          <input
            type="url"
            aria-label="Review link for the sample"
            placeholder="review link (optional — if the venue hasn't set one)"
            value={sampleReview}
            onChange={(e) => setSampleReview(e.target.value)}
            className="w-80 rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-sky-500"
          />
          <Button disabled={sending || !sampleTo.trim()} onClick={sendSample}>{sending ? "Sending…" : "Send sample"}</Button>
        </div>
      </div>
    </Card>
  );
}
