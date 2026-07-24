"use client";

import { useId } from "react";
import { cx } from "@/lib/host/format";

// Host Flow brand mark — a gradient lowercase "h" whose right leg sweeps into
// a flowing wave, mirroring the supplied logo. Rendered as inline SVG so it's
// crisp at any size, transparent, and theme-aware. Brand gradient runs blue
// (#2b5cff) → purple (#7b2ff7).

const BLUE = "#2b5cff";
const PURPLE = "#7b2ff7";

export function HostFlowMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`hf-${id}`} x1="20" y1="24" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor={BLUE} />
          <stop offset="1" stopColor={PURPLE} />
        </linearGradient>
      </defs>
      {/* stem */}
      <rect x="30" y="28" width="16" height="66" rx="8" fill={`url(#hf-${id})`} />
      {/* arch + flowing wave tail */}
      <path
        d="M38 64 C38 44 58 38 72 50 C84 60 84 80 74 92 C69 98 74 104 82 101"
        stroke={`url(#hf-${id})`}
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full lockup: mark + "hostflow" wordmark ("host" solid, "flow" gradient).
 * `tone="onDark"` forces the "host" text white (for the always-dark landing /
 * login); `tone="auto"` follows the light/dark theme (for the host header).
 */
export function HostFlowLogo({
  size = 30,
  tone = "auto",
  showWordmark = true,
  className,
}: {
  size?: number;
  tone?: "auto" | "onDark";
  showWordmark?: boolean;
  className?: string;
}) {
  const hostColor = tone === "onDark" ? "text-white" : "text-neutral-900 dark:text-white";
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <HostFlowMark size={size} />
      {showWordmark && (
        <span className="text-xl font-bold lowercase tracking-tight" style={{ letterSpacing: "-0.01em" }}>
          <span className={hostColor}>host</span>
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: `linear-gradient(90deg, ${BLUE}, ${PURPLE})` }}
          >
            flow
          </span>
        </span>
      )}
    </span>
  );
}
