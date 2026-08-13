"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { HostFlowLogo } from "@/components/HostFlowLogo";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hostflow/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't reach the server.");
        return;
      }
      router.push("/host");
      router.refresh();
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
          {!token ? (
            <>
              <h1 className="font-display text-xl text-red-400">Invalid link</h1>
              <p className="mt-2 text-sm text-hf-inkMuted">
                This reset link is missing its token.{" "}
                <Link href="/hostflow/forgot-password" className="text-brand-300 hover:text-brand-200">
                  Request a new one
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl">Set a new password</h1>
              <p className="mt-1 text-sm text-hf-inkMuted">At least 8 characters.</p>

              <form onSubmit={submit} className="mt-5 space-y-3">
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-hf-line bg-hf-surfaceHi px-3 py-2.5 text-sm text-hf-ink placeholder:text-hf-inkFaint outline-none focus:border-brand-400"
                />
                {error && (
                  <p className="text-sm text-red-400">
                    {error}{" "}
                    {/label|expired|invalid/i.test(error) && (
                      <Link href="/hostflow/forgot-password" className="underline">
                        Request a new link
                      </Link>
                    )}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-brand-400 py-2.5 text-sm font-semibold text-hf-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Set new password"}
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
