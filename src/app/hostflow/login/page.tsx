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
    <div className="relative grid min-h-screen place-items-center bg-neutral-950 px-6 text-neutral-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[480px] w-[480px] rounded-full bg-sky-500/20 blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 h-[380px] w-[380px] rounded-full bg-indigo-500/20 blur-[130px]" />
      </div>

      <div className="relative w-full max-w-sm">
        <Link href="/hostflow" className="mb-8 flex items-center justify-center">
          <HostFlowLogo tone="onDark" size={34} />
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
          <h1 className="text-xl font-semibold">Sign in to your venue</h1>
          <p className="mt-1 text-sm text-neutral-400">Open your live floor dashboard.</p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <input
              type="email"
              required
              placeholder="you@yourbar.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-sky-400"
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-sky-400"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-neutral-900 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        {/* Demo venues */}
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Demo venues — tap to fill</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMOS.map((d) => (
              <button
                key={d.email}
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                  setError(null);
                }}
                className="rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-neutral-300 transition-colors hover:border-sky-400/50 hover:bg-white/5"
              >
                <div className="font-semibold text-white">{d.label}</div>
                <div className="mt-0.5 truncate text-neutral-500">{d.email}</div>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-neutral-400">
          New restaurant?{" "}
          <Link href="/hostflow/signup" className="font-medium text-sky-400 hover:text-sky-300">
            Start your free trial
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-neutral-500">
          <Link href="/hostflow" className="hover:text-neutral-300">← Back to Host Flow</Link>
        </p>
      </div>
    </div>
  );
}
