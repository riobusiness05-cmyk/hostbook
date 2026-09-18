"use client";

import { useEffect, useState } from "react";
import { Button, Card, SectionTitle } from "./ui";
import * as api from "@/lib/host/client";
import type { SettingsDTO } from "@/lib/hostflow/floor";
import { DEFAULT_THANK_YOU_BODY, DEFAULT_THANK_YOU_SUBJECT } from "@/lib/hostflow/constants";

// A restaurant's own guest email: switched on here, written in their words,
// wearing their logo and colour, with their Google review link. Sent
// automatically the moment staff release a booked table.

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

export function GuestEmailSettings({
  initialSettings,
  premium,
  onUpgrade,
}: {
  initialSettings: SettingsDTO;
  /** On a plan that includes guest emails (Premium, or complimentary). */
  premium: boolean;
  onUpgrade: () => void;
}) {
  const [enabled, setEnabled] = useState(initialSettings.thankYouEmailEnabled);
  const [subject, setSubject] = useState(initialSettings.thankYouEmailSubject ?? "");
  const [body, setBody] = useState(initialSettings.thankYouEmailBody ?? "");
  const [reviewUrl, setReviewUrl] = useState(initialSettings.googleReviewUrl ?? "");
  const [brandColor, setBrandColor] = useState("#c9611f");
  const [logoUrl, setLogoUrl] = useState("");
  // Sender identity — the address is fixed per venue; name and reply-to are theirs to set.
  const [fromName, setFromName] = useState(initialSettings.emailFromName ?? "");
  const [replyTo, setReplyTo] = useState(initialSettings.emailReplyTo ?? "");
  const [venue, setVenue] = useState<{ name: string; email: string | null; senderAddress: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  // Bumped after every save so the preview iframe reloads with what's saved.
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    api
      .fetchRestaurant()
      .then((r) => {
        setBrandColor(r.brandColor);
        setLogoUrl(r.logoUrl ?? "");
        setVenue({ name: r.name, email: r.email, senderAddress: r.senderAddress });
      })
      .catch(() => {});
  }, []);

  const dirty = () => setSaved(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    setTestNote(null);
    try {
      const url = reviewUrl.trim();
      if (url && !/^https?:\/\//i.test(url)) throw new Error("The review link should start with https://");
      const logo = logoUrl.trim();
      if (logo && !/^https?:\/\//i.test(logo)) throw new Error("The logo link should start with https://");
      const reply = replyTo.trim();
      if (reply && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(reply)) throw new Error("The reply-to should be a valid email address");
      await Promise.all([
        api.updateSettings({
          thankYouEmailEnabled: enabled,
          thankYouEmailSubject: subject.trim() || null,
          thankYouEmailBody: body.trim() || null,
          googleReviewUrl: url || null,
          emailFromName: fromName.trim() || null,
          emailReplyTo: reply || null,
        }),
        api.updateRestaurant({ brandColor, logoUrl: logo || null }),
      ]);
      setSaved(true);
      setPreviewKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setError(null);
    setTestNote(null);
    try {
      const { to } = await api.sendThankYouTestEmail();
      setTestNote(`Test email sent to ${to} — check your inbox (and spam, the first time).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">{error}</Card>
      )}

      {!premium && (
        <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Premium</p>
          <h3 className="mt-1 text-lg font-bold">Turn every visit into a Google review</h3>
          <p className="mt-1 max-w-xl text-sm text-neutral-600 dark:text-neutral-300">
            The moment staff mark a booked table as finished, the guest gets a thank-you in your branding with a
            one-tap link to your Google review page. You can write the message and see the preview below — switching it
            on is part of the Premium plan.
          </p>
          <div className="mt-3">
            <Button variant="primary" onClick={onUpgrade}>
              Upgrade to Premium
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <SectionTitle>Sender</SectionTitle>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Every email a guest gets from you — booking confirmations and thank-yous — comes from you, not from Host Flow.
          Nothing to set up: your address is ready to go.
        </p>
        <div className="mb-4 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2.5 text-sm dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Guests see</p>
          <p className="mt-0.5 font-semibold text-neutral-900 dark:text-white">
            {fromName.trim() || venue?.name || "Your venue"}{" "}
            <span className="font-mono text-xs font-normal text-neutral-500 dark:text-neutral-400">
              &lt;{venue?.senderAddress ?? "…"}&gt;
            </span>
          </p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Replies go to{" "}
            {replyTo.trim() || venue?.email ? (
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{replyTo.trim() || venue?.email}</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">nowhere yet — add a reply-to below</span>
            )}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="From name" hint="How you appear in the guest's inbox. Leave blank to use your venue name.">
            <input
              className={inputCls}
              placeholder={venue?.name ?? "Your venue"}
              value={fromName}
              onChange={(e) => {
                setFromName(e.target.value);
                dirty();
              }}
            />
          </Field>
          <Field label="Reply-to email" hint="When a guest hits reply, it lands here.">
            <input
              className={inputCls}
              type="email"
              placeholder={venue?.email ?? "you@yourvenue.com"}
              value={replyTo}
              onChange={(e) => {
                setReplyTo(e.target.value);
                dirty();
              }}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>Thank-you email</SectionTitle>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          When staff mark a booked table as finished, the guest gets this email in your branding, asking how it went and
          linking to your Google reviews. Only guests who booked with an email address receive it — walk-ins never do.
        </p>

        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!premium}
            onChange={(e) => {
              setEnabled(e.target.checked);
              dirty();
            }}
          />
          Send a thank-you email when a booked party leaves
          {!premium && <span className="text-xs text-amber-600 dark:text-amber-400">— Premium</span>}
        </label>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <Field label="Google review link" hint='In Google Business Profile, choose "Ask for reviews" and copy the link — it looks like https://g.page/r/…/review'>
            <input
              className={inputCls}
              placeholder="https://g.page/r/…/review"
              value={reviewUrl}
              onChange={(e) => {
                setReviewUrl(e.target.value);
                dirty();
              }}
            />
          </Field>
          <Field label="Subject" hint="{name} becomes the guest's first name, {restaurant} becomes your venue's name.">
            <input
              className={inputCls}
              placeholder={DEFAULT_THANK_YOU_SUBJECT}
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                dirty();
              }}
            />
          </Field>
          <Field label="Message" hint="Written in your voice. Leave blank to use the built-in message. Blank lines start a new paragraph.">
            <textarea
              className={inputCls}
              rows={8}
              placeholder={DEFAULT_THANK_YOU_BODY}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                dirty();
              }}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>Look &amp; feel</SectionTitle>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Your colour and logo head the email. The same colour tints your booking widget.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Brand colour">
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => {
                  setBrandColor(e.target.value);
                  dirty();
                }}
                className="h-9 w-12 cursor-pointer rounded-md border border-black/10 bg-transparent p-0.5 dark:border-white/15"
              />
              <input
                className={inputCls.replace("mt-1 ", "")}
                value={brandColor}
                onChange={(e) => {
                  setBrandColor(e.target.value);
                  dirty();
                }}
              />
            </div>
          </Field>
          <Field label="Logo link" hint="A link to your logo image (PNG or JPG on a light or transparent background works best). Leave blank to show your name instead.">
            <input
              className={inputCls}
              placeholder="https://…/logo.png"
              value={logoUrl}
              onChange={(e) => {
                setLogoUrl(e.target.value);
                dirty();
              }}
            />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {premium && (
          <Button onClick={sendTest} disabled={testing}>
            {testing ? "Sending…" : "Send me a test email"}
          </Button>
        )}
        {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved ✓</span>}
        {testNote && <span className="text-sm text-neutral-500 dark:text-neutral-400">{testNote}</span>}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3 dark:border-white/10">
          <SectionTitle>Preview</SectionTitle>
          <span className="text-[11px] text-neutral-400">Shows what&apos;s saved — save to refresh</span>
        </div>
        <iframe
          key={previewKey}
          title="Thank-you email preview"
          src="/api/host/settings/thank-you-email"
          className="h-[640px] w-full bg-[#f6f4f0]"
        />
      </Card>
    </div>
  );
}
