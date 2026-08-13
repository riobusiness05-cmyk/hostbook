"use client";

import { useState } from "react";
import Link from "next/link";
import { HostFlowLogo } from "@/components/HostFlowLogo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hostflow/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't reach the server.");
        return;
      }
      // Deliberately shown even if the account doesn't exist — the API
      // itself never reveals that, so neither should this page.
      setSent(true);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      <div className="hf-blueprint pointer-events-none fixed inset-0 opacity-60 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_30%,black,transparent)]" />
      <div className="pointer-events-none fixed -top-32 left-1/3 h-[480px] w-[480px] rounded-full bg-brand-500/[0.12] blur-[140px]" />

      <div className="animate-fade-up relative w-full max-w-sm">
        <Link href="/hostflow" className="mb-8 flex items-center justify-center">
          <HostFlowLogo tone="onDark" size={34} />
        </Link>

        <div className="rounded-2xl border border-hf-line bg-hf-surface/80 p-6 backdrop-blur">
          {sent ? (
            <>
              <h1 className="font-display text-2xl">Check your email</h1>
              <p className="mt-2 text-sm text-hf-inkMuted">
                If an account exists for <span className="text-hf-ink">{email}</span>, we&apos;ve sent a link to reset your
                password. It expires in 1 hour.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl">Reset your password</h1>
              <p className="mt-1 text-sm text-hf-inkMuted">We&apos;ll email you a link to set a new one.</p>

              <form onSubmit={submit} className="mt-5 space-y-3">
                <input
                  type="email"
                  required
                  placeholder="you@yourbar.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-hf-line bg-hf-surfaceHi px-3 py-2.5 text-sm text-hf-ink placeholder:text-hf-inkFaint outline-none focus:border-brand-400"
                />
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-brand-400 py-2.5 text-sm font-semibold text-hf-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-hf-inkMuted">
          <Link href="/hostflow/login" className="font-medium text-brand-300 hover:text-brand-200">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
