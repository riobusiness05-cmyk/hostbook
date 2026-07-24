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
    <div className="relative grid min-h-screen place-items-center bg-neutral-950 px-6 text-neutral-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[480px] w-[480px] rounded-full bg-sky-500/20 blur-[140px]" />
      </div>
      <div className="relative w-full max-w-sm text-center">
        <Link href="/hostflow" className="mb-8 flex items-center justify-center">
          <HostFlowLogo tone="onDark" size={34} />
        </Link>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
          {state === "checking" && <p className="text-sm text-neutral-400">Verifying your email…</p>}
          {state === "ok" && (
            <>
              <h1 className="text-xl font-semibold text-emerald-400">Email verified ✓</h1>
              <p className="mt-2 text-sm text-neutral-400">You&apos;re all set.</p>
            </>
          )}
          {state === "error" && (
            <>
              <h1 className="text-xl font-semibold text-red-400">Verification failed</h1>
              <p className="mt-2 text-sm text-neutral-400">{message ?? "That link isn't valid."}</p>
            </>
          )}
          <Link
            href="/host"
            className="mt-5 inline-block w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-neutral-900 transition-opacity hover:opacity-90"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
