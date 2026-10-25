"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, SectionTitle } from "@/components/host/ui";
import { THANK_YOU_PLACEHOLDERS } from "@/lib/emailTemplate";

type Setup = {
  thankYouMode: "ASK" | "AUTO" | "OFF";
  thankYouDelay: "IMMEDIATE" | "MIN_30" | "HOUR_2" | "NEXT_MORNING";
  googleReviewUrl: string | null;
  emailFromName: string | null;
  emailReplyTo: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
  defaultLanguage: "en" | "es";
  brandSignOff: string | null;
};

// What the venue would otherwise set in its own Brand kit: switch the
// emails on, where the review button goes, who they come from.
function GuestEmailSetup({ restaurantId, restaurantName, onSaved }: { restaurantId: string; restaurantName: string; onSaved: () => void }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [premium, setPremium] = useState<boolean | null>(null);
  const [venue, setVenue] = useState<{ address: string | null; phone: string | null; email: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/platform/email-setup?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((d) => { setSetup(d.settings); setPremium(d.premium); setVenue(d.restaurant); })
      .catch(() => setMsg({ ok: false, text: "Couldn't load this venue's email settings." }));
  }, [restaurantId]);

  const save = async () => {
    if (!setup) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/platform/email-setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, ...setup, googleReviewUrl: setup.googleReviewUrl || null, emailFromName: setup.emailFromName || null, emailReplyTo: setup.emailReplyTo || null, instagramUrl: setup.instagramUrl || null, websiteUrl: setup.websiteUrl || null, brandSignOff: setup.brandSignOff || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't save");
      setSetup(d.settings); setPremium(d.premium);
      setMsg({ ok: true, text: setup.thankYouMode === "OFF" ? "Saved. Emails are off for this venue." : `Saved. ${restaurantName}'s thank-you emails are live (${setup.thankYouMode === "ASK" ? "staff are asked after each visit" : "sent automatically"}).` });
      onSaved();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };

  const field = "w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-sky-500";
  const set = <K extends keyof Setup>(k: K, v: Setup[K]) => setSetup((s) => (s ? { ...s, [k]: v } : s));

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Guest email setup</SectionTitle>
        {premium !== null && (
          <span className={"rounded-md px-1.5 py-0.5 text-xs font-semibold " + (premium ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-300")}>
            {premium ? "Premium — can send" : "Not on Premium — can't send yet"}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        The venue sees these same settings in their own Brand kit. Set them here to get a venue live without their login.
        Footer address and phone come from the venue profile{venue ? ` (${venue.address || "no address"} · ${venue.phone || "no phone"})` : ""}.
      </p>
      {!setup ? (
        <p className="text-xs text-neutral-500">Loading…</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] text-neutral-400">
            Mode
            <select className={field + " mt-1"} value={setup.thankYouMode} onChange={(e) => set("thankYouMode", e.target.value as Setup["thankYouMode"])}>
              <option value="OFF">Off — nothing is sent</option>
              <option value="ASK">Ask — staff are asked when a table is released</option>
              <option value="AUTO">Auto — sent after the delay below</option>
            </select>
          </label>
          <label className="text-[11px] text-neutral-400">
            Delay (Auto mode)
            <select className={field + " mt-1"} value={setup.thankYouDelay} onChange={(e) => set("thankYouDelay", e.target.value as Setup["thankYouDelay"])}>
              <option value="IMMEDIATE">Straight away</option>
              <option value="MIN_30">30 minutes later</option>
              <option value="HOUR_2">2 hours later</option>
              <option value="NEXT_MORNING">Next morning</option>
            </select>
          </label>
          <label className="text-[11px] text-neutral-400 sm:col-span-2">
            Google review link (the button in the email)
            <input className={field + " mt-1"} placeholder="https://g.page/r/…/review  or  https://www.google.com/search?q=…#lrd=…,3" value={setup.googleReviewUrl ?? ""} onChange={(e) => set("googleReviewUrl", e.target.value)} />
          </label>
          <label className="text-[11px] text-neutral-400">
            Sender name (From)
            <input className={field + " mt-1"} placeholder={restaurantName} value={setup.emailFromName ?? ""} onChange={(e) => set("emailFromName", e.target.value)} />
          </label>
          <label className="text-[11px] text-neutral-400">
            Reply-to email
            <input className={field + " mt-1"} placeholder="owner@venue.com" value={setup.emailReplyTo ?? ""} onChange={(e) => set("emailReplyTo", e.target.value)} />
          </label>
          <label className="text-[11px] text-neutral-400">
            Instagram link
            <input className={field + " mt-1"} placeholder="https://instagram.com/…" value={setup.instagramUrl ?? ""} onChange={(e) => set("instagramUrl", e.target.value)} />
          </label>
          <label className="text-[11px] text-neutral-400">
            Website link
            <input className={field + " mt-1"} placeholder="https://…" value={setup.websiteUrl ?? ""} onChange={(e) => set("websiteUrl", e.target.value)} />
          </label>
          <label className="text-[11px] text-neutral-400">
            Language
            <select className={field + " mt-1"} value={setup.defaultLanguage} onChange={(e) => set("defaultLanguage", e.target.value as Setup["defaultLanguage"])}>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
          <label className="text-[11px] text-neutral-400">
            Sign-off
            <input className={field + " mt-1"} placeholder="e.g. The Mantra family" value={setup.brandSignOff ?? ""} onChange={(e) => set("brandSignOff", e.target.value)} />
          </label>
        </div>
      )}
      {msg && <p className={"mt-3 text-xs " + (msg.ok ? "text-emerald-400" : "text-red-300")}>{msg.text}</p>}
      <div className="mt-3">
        <Button variant="primary" disabled={busy || !setup} onClick={save}>{busy ? "Saving…" : "Save email setup"}</Button>
      </div>
    </Card>
  );
}

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
  const [prepared, setPrepared] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/platform/email-design/prepared")
      .then((r) => r.json())
      .then((d) => setPrepared(Array.isArray(d.names) ? d.names : []))
      .catch(() => setPrepared([]));
  }, []);

  const loadPrepared = async (name: string) => {
    if ((html ?? "").trim() && !window.confirm(`Replace what's in the editor with the prepared "${name}" design? Nothing is saved until you click Save design.`)) return;
    setError(null); setNote(null);
    try {
      const res = await fetch(`/api/platform/email-design/prepared?name=${encodeURIComponent(name)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't load that design");
      setHtml(d.html);
      setNote(`Loaded the prepared "${name}" design into the editor — not saved yet.`);
    } catch (e) { setError((e as Error).message); }
  };
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
  // Re-render the samples when setup changes (review button, sign-off, language).
  const [setupVersion, setSetupVersion] = useState(0);
  useEffect(() => { if (html !== null) setHtml((h) => (h === null ? h : h + "")); }, [setupVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
    <GuestEmailSetup restaurantId={restaurantId} restaurantName={restaurantName} onSaved={() => setSetupVersion((v) => v + 1)} />
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
      {prepared.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-neutral-500">Prepared designs:</span>
          {prepared.map((n) => (
            <button key={n} type="button" onClick={() => loadPrepared(n)} className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-neutral-200 hover:border-sky-500 hover:text-white">
              Load {n}
            </button>
          ))}
        </div>
      )}
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
          <iframe sandbox="" title="Email preview" srcDoc={samples?.[sampleIdx]?.html ?? ""} className="h-[520px] w-full" />
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
    </>
  );
}
