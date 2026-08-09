"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HostFlowLogo } from "@/components/HostFlowLogo";

const inputCls =
  "w-full rounded-lg border border-hf-line bg-hf-surfaceHi px-3 py-2.5 text-sm text-hf-ink placeholder:text-hf-inkFaint outline-none focus:border-brand-400";

export default function HostFlowSignup() {
  const router = useRouter();
  const [restaurantName, setRestaurantName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hostflow/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantName, ownerName, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't create your account.");
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
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-6 py-12">
      <div className="hf-blueprint pointer-events-none fixed inset-0 opacity-60 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_30%,black,transparent)]" />
      <div className="pointer-events-none fixed -top-32 left-1/3 h-[480px] w-[480px] rounded-full bg-brand-500/[0.12] blur-[140px]" />

      <div className="animate-fade-up relative w-full max-w-sm">
        <Link href="/hostflow" className="mb-8 flex items-center justify-center">
          <HostFlowLogo tone="onDark" size={34} />
        </Link>

        <div className="rounded-2xl border border-hf-line bg-hf-surface/80 p-6 backdrop-blur">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-brand-400/30 bg-brand-500/10 px-2.5 py-1 font-mono text-[11px] text-brand-300">
            7-day free trial
          </span>
          <h1 className="mt-3 font-display text-2xl">Start your free trial</h1>
          <p className="mt-1 text-sm text-hf-inkMuted">Set up your venue in under a minute.</p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <input
              required
              placeholder="Restaurant or bar name"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              className={inputCls}
            />
            <input
              required
              placeholder="Your name"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className={inputCls}
            />
            <input
              type="email"
              required
              placeholder="you@yourbar.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Password (min. 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brand-400 py-2.5 text-sm font-semibold text-hf-bg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Setting up your venue…" : "Start Free Trial"}
            </button>
            <p className="text-center text-[11px] leading-relaxed text-hf-inkFaint">
              By continuing you agree to be contacted about your account. You can cancel anytime.
            </p>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-hf-inkMuted">
          Already have an account?{" "}
          <Link href="/hostflow/login" className="font-medium text-brand-300 hover:text-brand-200">
            Sign in
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-hf-inkFaint">
          <Link href="/hostflow" className="hover:text-hf-ink">← Back to Host Flow</Link>
        </p>
      </div>
    </div>
  );
}
