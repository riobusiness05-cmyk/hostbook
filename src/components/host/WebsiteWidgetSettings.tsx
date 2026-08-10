"use client";

import { useState } from "react";
import { Card, SectionTitle, Button } from "./ui";

// Lets a host self-serve the embed code for their own website instead of
// needing this handed to them — the actual booking widget (public/widget.js
// + src/app/widget/[slug]) already works standalone; this is purely the
// "how do I install it" surface.
export function WebsiteWidgetSettings({ restaurantSlug }: { restaurantSlug: string }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<div data-hostflow-restaurant="${restaurantSlug}"></div>\n<script src="${origin}/widget.js" async></script>`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (permissions, non-HTTPS embed context)
      // — the code is still selectable/copyable by hand right below.
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <SectionTitle>Add booking to your website</SectionTitle>
        <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
          Paste this snippet anywhere on your own site — a &quot;Reservations&quot; page, your homepage, wherever makes sense.
          It renders a live booking form that checks real availability and books straight onto your floor plan, the
          same as a booking taken any other way.
        </p>

        <div className="relative">
          <pre className="overflow-x-auto rounded-lg border border-black/10 bg-neutral-950 p-3 text-xs text-neutral-200 dark:border-white/10">
            <code>{snippet}</code>
          </pre>
          <Button variant="secondary" size="sm" className="absolute right-2 top-2" onClick={copy}>
            {copied ? "Copied ✓" : "Copy"}
          </Button>
        </div>

        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          Want to see it before you add it?{" "}
          <a
            href={`/widget/${restaurantSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sky-600 hover:underline dark:text-sky-400"
          >
            Open a live preview ↗
          </a>
        </p>
      </Card>

      <Card className="p-5">
        <SectionTitle>How it works</SectionTitle>
        <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
          <li>• A guest picks a date and party size — checked against your real floor plan and opening hours, live.</li>
          <li>• If a party&apos;s too big for one table, it&apos;s automatically combined across nearby tables, same as a booking taken any other way.</li>
          <li>• The reservation appears on your dashboard immediately — no import, no manual entry.</li>
          <li>• The widget only ever creates ordinary web bookings; it can&apos;t change settings, tables, or anything else on your account.</li>
        </ul>
      </Card>
    </div>
  );
}
