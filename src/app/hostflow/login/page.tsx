"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HostFlowLogo } from "@/components/HostFlowLogo";

const DEMOS = [
  { label: "The Colonial", email: "colonial@hostflow.app", password: "colonial123" },
  { label: "The Harbour", email: "harbour@hostflow.app", password: "harbour123" },
];

export default function HostFlowLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hostflow/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't sign in.");
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
          <h1 className="font-display text-2xl">Sign in to your venue</h1>
          <p className="mt-1 text-sm text-hf-inkMuted">Open your live floor dashboard.</p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <input
              type="email"
              required
              placeholder="you@yourbar.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-hf-line bg-hf-surfaceHi px-3 py-2.5 text-sm text-hf-ink placeholder:text-hf-inkFaint outline-none focus:border-brand-400"
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-hf-line bg-hf-surfaceHi px-3 py-2.5 text-sm text-hf-ink placeholder:text-hf-inkFaint outline-none focus:border-brand-400"
            />
            <div className="text-right">
              <Link href="/hostflow/forgot-password" className="text-xs text-hf-inkFaint hover:text-hf-ink">
                Forgot password?
              </Link>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brand-400 py-2.5 text-sm font-semibold text-hf-bg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        {/* Demo venues */}
        <div className="mt-5 rounded-2xl border border-hf-line bg-hf-surface/40 p-4">
          <p className="mb-2 font-mono text-xs uppercase tracking-wide text-hf-inkFaint">Demo venues — tap to fill</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMOS.map((d) => (
              <button
                key={d.email}
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                  setError(null);
                }}
                className="rounded-lg border border-hf-line px-3 py-2 text-left text-xs text-hf-inkMuted transition-colors hover:border-brand-400/50 hover:bg-hf-surfaceHi"
              >
                <div className="font-semibold text-hf-ink">{d.label}</div>
                <div className="mt-0.5 truncate text-hf-inkFaint">{d.email}</div>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-hf-inkMuted">
          New restaurant?{" "}
          <Link href="/hostflow/signup" className="font-medium text-brand-300 hover:text-brand-200">
            Start your free trial
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-hf-inkFaint">
          <Link href="/hostflow" className="hover:text-hf-ink">← Back to Host Flow</Link>
        </p>
      </div>
    </div>
  );
}
