"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { HostFlowLogo } from "@/components/HostFlowLogo";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"checking" | "ok" | "error">("checking");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Missing verification token.");
      return;
    }
    fetch(`/api/hostflow/verify-email?token=${encodeURIComponent(token)}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        setState(ok ? "ok" : "error");
        setMessage(data.error ?? null);
      })
      .catch(() => {
        setState("error");
        setMessage("Couldn't reach the server.");
      });
  }, [token]);

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      <div className="hf-blueprint pointer-events-none fixed inset-0 opacity-60 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_30%,black,transparent)]" />
      <div className="pointer-events-none fixed -top-32 left-1/3 h-[480px] w-[480px] rounded-full bg-brand-500/[0.12] blur-[140px]" />
      <div className="animate-fade-up relative w-full max-w-sm text-center">
        <Link href="/hostflow" className="mb-8 flex items-center justify-center">
          <HostFlowLogo tone="onDark" size={34} />
        </Link>
        <div className="rounded-2xl border border-hf-line bg-hf-surface/80 p-6 backdrop-blur">
          {state === "checking" && <p className="text-sm text-hf-inkMuted">Verifying your email…</p>}
          {state === "ok" && (
            <>
              <h1 className="font-display text-xl text-emerald-400">Email verified ✓</h1>
              <p className="mt-2 text-sm text-hf-inkMuted">You&apos;re all set.</p>
            </>
          )}
          {state === "error" && (
            <>
              <h1 className="font-display text-xl text-red-400">Verification failed</h1>
              <p className="mt-2 text-sm text-hf-inkMuted">{message ?? "That link isn't valid."}</p>
            </>
          )}
          <Link
            href="/host"
            className="mt-5 inline-block w-full rounded-lg bg-brand-400 py-2.5 text-sm font-semibold text-hf-bg transition-opacity hover:opacity-90"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
