"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, SectionTitle } from "./ui";
import * as api from "@/lib/host/client";
import type { SettingsDTO } from "@/lib/hostflow/floor";
import { FONT_STYLES, LANGUAGES, THANK_YOU_DELAYS, THANK_YOU_MODES, TONES, buildReviewUrl, extractPlaceId, isReviewLink } from "@/lib/brandKit";

// A venue's post-visit email, on one page: what gets sent, when, how it
// looks, how it sounds — with the real email rendering live on the right
// as they edit. Deliberately simple: one colour, one font, one voice.

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

const STATUS_META: Record<string, { label: string; cls: string }> = {
  SENT: { label: "Sent", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  DELAYED: { label: "Delayed", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  DELIVERED: { label: "Delivered", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  OPENED: { label: "Opened", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  BOUNCED: { label: "Bounced", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  COMPLAINED: { label: "Marked spam", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  FAILED: { label: "Failed", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  SKIPPED: { label: "Not sent", cls: "bg-neutral-500/15 text-neutral-500 dark:text-neutral-400" },
};
const KIND_LABEL: Record<string, string> = {
  SIGNUP_VERIFY: "Welcome / verify email",
  PASSWORD_RESET: "Password reset",
  LOGIN_ALERT: "New sign-in alert",
  BOOKING_CONFIRMATION: "Booking confirmation",
  OWNER_NEW_BOOKING: "New booking (to you)",
  THANK_YOU: "Thank-you",
  THANK_YOU_TEST: "Thank-you (test)",
  PAYMENT_FAILED: "Payment failed",
  PAYMENT_REQUIRED: "Trial ending",
};

type Draft = Pick<
  SettingsDTO,
  | "thankYouMode" | "thankYouDelay" | "brandPrimary" | "brandFont" | "brandTone" | "brandVoiceNotes" | "brandSignOff"
  | "googlePlaceId" | "googleReviewUrl" | "instagramUrl" | "websiteUrl" | "defaultLanguage" | "emailFromName" | "emailReplyTo"
  | "thankYouEmailSubject" | "thankYouEmailBody"
>;

export function BrandKitSettings({ initialSettings, premium, onUpgrade }: { initialSettings: SettingsDTO; premium: boolean; onUpgrade: () => void }) {
  const [d, setD] = useState<Draft>({ ...initialSettings });
  const [venue, setVenue] = useState<api.RestaurantRow | null>(null);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [reviewInput, setReviewInput] = useState(initialSettings.googlePlaceId ?? initialSettings.googleReviewUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [samples, setSamples] = useState<api.ThankYouSample[] | null>(null);
  const [showSamples, setShowSamples] = useState(false);
  const [customCopy, setCustomCopy] = useState(!!(initialSettings.thankYouEmailBody || initialSettings.thankYouEmailSubject));
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  const [log, setLog] = useState<api.EmailLogRow[] | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setD((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  useEffect(() => {
    api.fetchRestaurant().then((r) => { setVenue(r); setAddress(r.address ?? ""); setPhone(r.phone ?? ""); }).catch(() => {});
    api.fetchEmailLog().then(setLog).catch(() => setLog([]));
  }, []);

  // Live preview: render the draft (not what's saved) with a short debounce.
  const previewSeq = useRef(0);
  const refreshPreview = useCallback(async (draft: Draft) => {
    const seq = ++previewSeq.current;
    try {
      const html = await api.previewThankYou(draft);
      if (seq === previewSeq.current) setPreviewHtml(html);
    } catch { /* keep the last good preview */ }
  }, []);
  useEffect(() => {
    const id = setTimeout(() => refreshPreview(d), 450);
    return () => clearTimeout(id);
  }, [d, refreshPreview]);

  const loadSamples = async () => {
    setShowSamples(true);
    setSamples(null);
    setSamples(await api.fetchThankYouSamples().catch(() => []));
  };

  const applyReviewInput = (raw: string) => {
    setReviewInput(raw);
    const placeId = extractPlaceId(raw);
    if (placeId) { set("googlePlaceId", placeId); set("googleReviewUrl", null); return; }
    if (isReviewLink(raw)) { set("googlePlaceId", null); set("googleReviewUrl", raw.trim()); return; }
    if (!raw.trim()) { set("googlePlaceId", null); set("googleReviewUrl", null); }
  };
  const reviewUrl = buildReviewUrl(d.googlePlaceId, d.googleReviewUrl);

  const save = async () => {
    setSaving(true); setError(null); setTestNote(null);
    try {
      if (reviewInput.trim() && !reviewUrl) throw new Error("That doesn't look like a Google Place ID or review link.");
      await Promise.all([
        api.updateSettings({
          ...d,
          brandVoiceNotes: d.brandVoiceNotes?.trim() || null,
          brandSignOff: d.brandSignOff?.trim() || null,
          instagramUrl: d.instagramUrl?.trim() || null,
          websiteUrl: d.websiteUrl?.trim() || null,
          emailFromName: d.emailFromName?.trim() || null,
          emailReplyTo: d.emailReplyTo?.trim() || null,
          thankYouEmailSubject: customCopy ? d.thankYouEmailSubject?.trim() || null : null,
          thankYouEmailBody: customCopy ? d.thankYouEmailBody?.trim() || null : null,
        }),
        api.updateRestaurant({ brandColor: d.brandPrimary ?? venue?.brandColor, address: address.trim() || null, phone: phone.trim() || null }),
      ]);
      setSaved(true);
      setSamples(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true); setError(null); setTestNote(null);
    try {
      const { to } = await api.sendThankYouTestEmail(testTo.trim() || undefined);
      setTestNote(`Sent to ${to} — the log below shows what Resend did with it.`);
      setLog(await api.fetchEmailLog().catch(() => []));
    } catch (e) { setError((e as Error).message); } finally { setTesting(false); }
  };

  const primaryShown = d.brandPrimary ?? venue?.brandColor ?? "#c9611f";
  const radio = (checked: boolean) =>
    "cursor-pointer rounded-xl border p-3 text-left transition-colors " +
    (checked ? "border-sky-500 bg-sky-500/5" : "border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20");

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        {error && <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">{error}</Card>}

        {!premium && (
          <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Premium</p>
            <h3 className="mt-1 text-lg font-bold">Turn every visit into a Google review</h3>
            <p className="mt-1 max-w-xl text-sm text-neutral-600 dark:text-neutral-300">
              When a table is finished, the guest gets a thank-you in your colour and your voice, with a one-tap link to your Google review page
              and a link to book again. Set it up and see it live here — sending is part of the Premium plan.
            </p>
            <div className="mt-3"><Button variant="primary" onClick={onUpgrade}>Upgrade to Premium</Button></div>
          </Card>
        )}

        {/* ── When to send ── */}
        <Card className="p-5">
          <SectionTitle>Post-visit email</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(THANK_YOU_MODES) as (keyof typeof THANK_YOU_MODES)[]).map((m) => (
              <button key={m} type="button" disabled={!premium && m !== "OFF"} className={radio(d.thankYouMode === m) + (!premium && m !== "OFF" ? " opacity-50" : "")} onClick={() => set("thankYouMode", m)}>
                <p className="text-sm font-semibold">{THANK_YOU_MODES[m].label}</p>
                <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">{THANK_YOU_MODES[m].hint}</p>
              </button>
            ))}
          </div>
          {d.thankYouMode === "AUTO" && (
            <div className="mt-3 max-w-xs">
              <Field label="Send" hint="Guests without an email on the booking are still offered to staff at release time.">
                <select className={inputCls} value={d.thankYouDelay} onChange={(e) => set("thankYouDelay", e.target.value)}>
                  {(Object.keys(THANK_YOU_DELAYS) as (keyof typeof THANK_YOU_DELAYS)[]).map((k) => <option key={k} value={k}>{THANK_YOU_DELAYS[k].label}</option>)}
                </select>
              </Field>
            </div>
          )}
          <p className="mt-3 text-[11px] text-neutral-400">Every guest who leaves is asked — Google doesn&apos;t allow only asking the happy ones. Guests can unsubscribe with one tap, and we never email a visit twice.</p>
        </Card>

        {/* ── Look & voice ── */}
        <Card className="p-5">
          <SectionTitle>Look &amp; voice</SectionTitle>
          {initialSettings.thankYouEmailHtml && (
            <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] p-3 text-sm">
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">Your email is designed by Host Flow</p>
              <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300">
                The layout was made for you by hand — the preview on the right shows it. Your tone, sign-off, review link and sender details below still apply. Want a change to the design? Just ask us.
              </p>
            </div>
          )}
          <div className={"grid grid-cols-1 gap-4 sm:grid-cols-2" + (initialSettings.thankYouEmailHtml ? " hidden" : "")}>
            <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Brand colour
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={primaryShown} onChange={(e) => set("brandPrimary", e.target.value)} className="h-9 w-11 cursor-pointer rounded-md border border-black/10 bg-transparent p-0.5 dark:border-white/15" />
                <input className={inputCls.replace("mt-1 ", "")} value={primaryShown} onChange={(e) => set("brandPrimary", e.target.value)} />
              </div>
              <span className="mt-1 block text-[11px] font-normal text-neutral-400">Your name, the review button and links. Also tints your booking widget.</span>
            </div>
            <Field label="Default language" hint="Used when we don't know the guest's language from their booking.">
              <select className={inputCls} value={d.defaultLanguage} onChange={(e) => set("defaultLanguage", e.target.value)}>
                {(Object.keys(LANGUAGES) as (keyof typeof LANGUAGES)[]).map((l) => <option key={l} value={l}>{LANGUAGES[l]}</option>)}
              </select>
            </Field>
          </div>
          <p className={"mt-4 text-xs font-medium text-neutral-500 dark:text-neutral-400" + (initialSettings.thankYouEmailHtml ? " hidden" : "")}>Font style <span className="font-normal text-neutral-400">· email clients only allow built-in fonts, so these use safe fallbacks</span></p>
          <div className={"mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3" + (initialSettings.thankYouEmailHtml ? " hidden" : "")}>
            {(Object.keys(FONT_STYLES) as (keyof typeof FONT_STYLES)[]).map((f) => (
              <button key={f} type="button" className={radio(d.brandFont === f)} onClick={() => set("brandFont", f)}>
                <p className="text-lg leading-tight" style={{ fontFamily: FONT_STYLES[f].heading }}>{venue?.name ?? "Your venue"}</p>
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">{FONT_STYLES[f].label}</p>
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs font-medium text-neutral-500 dark:text-neutral-400">Tone of voice</p>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(TONES) as (keyof typeof TONES)[]).map((t) => (
              <button key={t} type="button" className={radio(d.brandTone === t)} onClick={() => set("brandTone", t)}>
                <p className="text-sm font-semibold">{TONES[t].label}</p>
                <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">{TONES[t].hint}</p>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Field label="Sign-off" hint='e.g. "Maria & the team at The Colonial"'>
              <input className={inputCls} placeholder={`The team at ${venue?.name ?? "your venue"}`} value={d.brandSignOff ?? ""} onChange={(e) => set("brandSignOff", e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 rounded-lg border border-black/10 p-3 dark:border-white/10">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={customCopy} onChange={(e) => { setCustomCopy(e.target.checked); setSaved(false); }} />
              Write the message myself instead
            </label>
            {customCopy && (
              <div className="mt-3 space-y-3">
                <Field label="Subject" hint="{name} = guest's first name, {restaurant} = your venue">
                  <input className={inputCls} placeholder="Thanks for tonight, {name}" value={d.thankYouEmailSubject ?? ""} onChange={(e) => set("thankYouEmailSubject", e.target.value)} />
                </Field>
                <Field label="Message" hint="Blank lines start a new paragraph. Your sign-off is added underneath.">
                  <textarea className={inputCls} rows={6} value={d.thankYouEmailBody ?? ""} onChange={(e) => set("thankYouEmailBody", e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        </Card>

        {/* ── Google reviews ── */}
        <Card className="p-5">
          <SectionTitle>Google reviews</SectionTitle>
          <Field label="Google Place ID or review link" hint="Find your Place ID at developers.google.com/maps/documentation/places/web-service/place-id — or paste the “Ask for reviews” link from your Google Business Profile.">
            <input className={inputCls} placeholder="ChIJ… or https://g.page/r/…/review" value={reviewInput} onChange={(e) => applyReviewInput(e.target.value)} />
          </Field>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {reviewUrl ? (
              <>
                <span className="truncate text-neutral-500 dark:text-neutral-400">→ {reviewUrl}</span>
                <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-600 hover:underline dark:text-sky-400">Test link ↗</a>
              </>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">No review link yet — the email will go without its button.</span>
            )}
          </div>
        </Card>

        {/* ── Sender & footer ── */}
        <Card className="p-5">
          <SectionTitle>Sender &amp; footer</SectionTitle>
          <div className="mb-4 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2.5 text-sm dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Guests see</p>
            <p className="mt-0.5 font-semibold text-neutral-900 dark:text-white">
              {d.emailFromName?.trim() || venue?.name || "Your venue"} <span className="font-mono text-xs font-normal text-neutral-500 dark:text-neutral-400">&lt;{venue?.senderAddress ?? "…"}&gt;</span>
            </p>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Replies go to {d.emailReplyTo?.trim() || venue?.email ? <span className="font-medium text-neutral-700 dark:text-neutral-200">{d.emailReplyTo?.trim() || venue?.email}</span> : <span className="text-amber-600 dark:text-amber-400">nowhere yet — add a reply-to</span>}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="From name"><input className={inputCls} placeholder={venue?.name ?? ""} value={d.emailFromName ?? ""} onChange={(e) => set("emailFromName", e.target.value)} /></Field>
            <Field label="Reply-to email"><input className={inputCls} type="email" placeholder={venue?.email ?? "you@yourvenue.com"} value={d.emailReplyTo ?? ""} onChange={(e) => set("emailReplyTo", e.target.value)} /></Field>
            <Field label="Address"><input className={inputCls} value={address} onChange={(e) => { setAddress(e.target.value); setSaved(false); }} /></Field>
            <Field label="Phone"><input className={inputCls} value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} /></Field>
            <Field label="Instagram"><input className={inputCls} placeholder="https://instagram.com/…" value={d.instagramUrl ?? ""} onChange={(e) => set("instagramUrl", e.target.value)} /></Field>
            <Field label="Website"><input className={inputCls} placeholder="https://…" value={d.websiteUrl ?? ""} onChange={(e) => set("websiteUrl", e.target.value)} /></Field>
          </div>
        </Card>

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-black/10 bg-white/90 p-3 backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved ✓</span>}
          {premium && (
            <div className="ml-auto flex items-center gap-2">
              <input className={inputCls.replace("mt-1 w-full", "w-52")} type="email" placeholder="Send test to… (blank = me)" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <Button onClick={sendTest} disabled={testing}>{testing ? "Sending…" : "Send test email"}</Button>
            </div>
          )}
        </div>
        {testNote && <p className="text-sm text-neutral-500 dark:text-neutral-400">{testNote}</p>}

        {/* ── Log ── */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>Recent emails</SectionTitle>
            <Button size="sm" variant="ghost" onClick={() => api.fetchEmailLog().then(setLog).catch(() => {})}>Refresh</Button>
          </div>
          <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">“Sent” means it left us; it becomes “Delivered” (or “Bounced”) when the receiving server answers, and “Opened” when the guest reads it.</p>
          {log === null ? <p className="text-sm text-neutral-400">Loading…</p> : log.length === 0 ? <p className="text-sm text-neutral-400">No emails yet.</p> : (
            <ul className="divide-y divide-black/5 dark:divide-white/10">
              {log.map((e) => (
                <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 text-xs">
                  <span className="w-24 shrink-0 tabular-nums text-neutral-400">{new Date(e.createdAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className={"shrink-0 rounded-md px-1.5 py-0.5 font-semibold " + (STATUS_META[e.status]?.cls ?? STATUS_META.SKIPPED.cls)}>{STATUS_META[e.status]?.label ?? e.status}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-neutral-800 dark:text-neutral-100">{KIND_LABEL[e.kind] ?? e.kind}</span>
                    <span className="text-neutral-500 dark:text-neutral-400"> → {e.to}</span>
                    {e.error && <span className="block text-red-600 dark:text-red-400">{e.error}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Live preview ── */}
      <div className="xl:sticky xl:top-24 xl:self-start">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-2.5 dark:border-white/10">
            <SectionTitle>Preview</SectionTitle>
            <button type="button" className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400" onClick={showSamples ? () => setShowSamples(false) : loadSamples}>
              {showSamples ? "Back to live preview" : "See 3 sample emails"}
            </button>
          </div>
          {!showSamples ? (
            <iframe title="Live email preview" srcDoc={previewHtml} className="h-[720px] w-full bg-[#f6f4f0]" />
          ) : samples === null ? (
            <p className="p-4 text-sm text-neutral-400">Writing three samples…</p>
          ) : (
            <div className="divide-y divide-black/5 dark:divide-white/10">
              {samples.map((s) => (
                <div key={s.label}>
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">{s.label}</p>
                    <p className="text-sm font-semibold">{s.subject}</p>
                  </div>
                  <iframe title={s.label} srcDoc={s.html} className="h-[560px] w-full bg-[#f6f4f0]" />
                </div>
              ))}
              <p className="p-3 text-[11px] text-neutral-400">Samples use what&apos;s saved — save first to see changes here.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
