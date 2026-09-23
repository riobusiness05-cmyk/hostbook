"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui";
import * as api from "@/lib/host/client";

// After a table is finished: one question, answered in a tap. Preview shows
// the exact email; a missing address can be added on the spot or skipped.
export function ThankYouModal({
  candidate,
  busy,
  onSend,
  onClose,
}: {
  candidate: api.ThankYouCandidate;
  busy: boolean;
  onSend: (email?: string) => void;
  onClose: () => void;
}) {
  const first = candidate.customerName.trim().split(/\s+/)[0] || candidate.customerName;
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState(false);
  const hasEmail = !!candidate.customerEmail;
  const typed = email.trim();
  const validTyped = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(typed);
  const canSend = hasEmail || validTyped;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inputCls =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-sky-500 dark:border-white/15 dark:bg-white/5 dark:text-white";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={
          "w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-900 " +
          (preview ? "max-w-3xl" : "max-w-md")
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Send {first} a thank-you email?</h2>
          {hasEmail ? (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Goes to <span className="font-medium text-neutral-700 dark:text-neutral-200">{candidate.customerEmail}</span> in your branding, with your
              Google review link.
            </p>
          ) : (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-3">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">No email on file</p>
              <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300">Add one to send the thank-you, or skip it for this visit.</p>
              <input
                autoFocus
                type="email"
                placeholder="guest@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`mt-2 ${inputCls}`}
              />
            </div>
          )}
        </div>

        {preview && (
          <div className="border-t border-black/5 bg-[#f6f4f0] dark:border-white/10">
            <iframe
              title="Email preview"
              src={api.visitThankYouPreviewUrl(candidate.visitId, hasEmail ? undefined : validTyped ? typed : undefined)}
              className="h-[520px] w-full"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-black/5 p-4 dark:border-white/10">
          <Button variant="primary" disabled={busy || !canSend} onClick={() => onSend(hasEmail ? undefined : typed)}>
            {busy ? "Sending…" : hasEmail ? "Yes, send" : "Save & send"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {hasEmail ? "Not now" : "Skip"}
          </Button>
          <Button variant="ghost" className="ml-auto" disabled={busy || (!hasEmail && !validTyped)} onClick={() => setPreview((v) => !v)}>
            {preview ? "Hide preview" : "Preview"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A brief confirmation that disappears on its own. */
export function Toast({ text, tone, onDone }: { text: string; tone: "ok" | "error"; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, tone === "ok" ? 3500 : 6000);
    return () => clearTimeout(id);
  }, [onDone, tone]);
  return (
    <div
      className={
        "fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-lg " +
        (tone === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white")
      }
    >
      {text}
    </div>
  );
}
