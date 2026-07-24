"use client";

import { ReactNode } from "react";
import { cx } from "@/lib/host/format";

// ── Reusable host-UI atoms ──────────────────────────────────────────────────
// A tiny design system so every surface (dashboard, panels, floor plan) shares
// the same card, chip, button and gauge language in both light and dark mode.

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-black/5 bg-white/80 shadow-sm backdrop-blur",
        "dark:border-white/10 dark:bg-white/[0.03]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneRing =
    tone === "good"
      ? "ring-emerald-500/20"
      : tone === "warn"
      ? "ring-amber-500/20"
      : tone === "bad"
      ? "ring-red-500/20"
      : "ring-transparent";
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-xl border border-black/5 bg-white/70 p-3 ring-1 sm:p-4",
        "dark:border-white/10 dark:bg-white/[0.03]",
        toneRing
      )}
    >
      {accent && <span className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: accent }} />}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 sm:text-xs">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-white sm:text-3xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{sub}</p>}
    </div>
  );
}

export function Chip({
  children,
  className,
  color,
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        !color && "bg-black/5 text-neutral-700 dark:bg-white/10 dark:text-neutral-200",
        className
      )}
      style={color ? { backgroundColor: `${color}22`, color } : undefined}
    >
      {children}
    </span>
  );
}

type BtnProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  title?: string;
};

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled,
  className,
  type = "button",
  title,
}: BtnProps) {
  const variants: Record<string, string> = {
    primary: "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200",
    secondary:
      "border border-black/10 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-white/15 dark:bg-white/5 dark:text-neutral-100 dark:hover:bg-white/10",
    ghost: "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10",
    danger: "border border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

// Circular 0..100 gauge used for the Service Health score.
export function Gauge({ value, label }: { value: number; label?: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const offset = c - (pct / 100) * c;
  const color = pct >= 80 ? "#22c55e" : pct >= 55 ? "#eab308" : "#ef4444";
  return (
    <div className="relative grid h-24 w-24 place-items-center">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-black/10 dark:stroke-white/10" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="8"
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-xl font-bold tabular-nums text-neutral-900 dark:text-white">{pct}</div>
        {label && <div className="text-[9px] uppercase tracking-wide text-neutral-500">{label}</div>}
      </div>
    </div>
  );
}

// Compact occupancy sparkline/area for the rush prediction.
export function Sparkline({
  points,
  maxPct,
  peakMinute,
}: {
  points: { minute: number; label: string; occupancyPct: number }[];
  maxPct: number;
  peakMinute: number;
}) {
  if (points.length === 0) return null;
  const W = 260;
  const H = 64;
  const maxMin = points[points.length - 1].minute || 1;
  const xy = (p: { minute: number; occupancyPct: number }) => {
    const x = (p.minute / maxMin) * W;
    const y = H - (p.occupancyPct / 100) * (H - 6) - 3;
    return [x, y] as const;
  };
  const line = points.map((p) => xy(p).join(",")).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  const capY = H - (maxPct / 100) * (H - 6) - 3;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="rushfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1={capY} x2={W} y2={capY} className="stroke-red-500/40" strokeWidth="1" strokeDasharray="4 4" />
      <polygon points={area} fill="url(#rushfill)" />
      <polyline points={line} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
      {points
        .filter((p) => p.minute === peakMinute)
        .map((p) => {
          const [x, y] = xy(p);
          return <circle key={p.minute} cx={x} cy={y} r="3.5" fill="#f59e0b" />;
        })}
    </svg>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {children}
      </h2>
      {action}
    </div>
  );
}
