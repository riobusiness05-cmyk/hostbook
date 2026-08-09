import type { Metadata } from "next";
import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";

// Without this, pages here that don't set their own metadata (login, signup,
// verify) fall back to the root layout's generateMetadata, which is scoped
// to whichever restaurant NEXT_PUBLIC_RESTAURANT_SLUG points to — showing
// that restaurant's name/tagline as the page title on Host Flow's own pages.
export const metadata: Metadata = {
  title: "Host Flow — The operating system for your floor",
  description: "Live floor management, smart seating, and an AI host assistant for independent restaurants and bars.",
};

// Host Flow's own type system — deliberately separate from the root
// layout's Cormorant/Jost pair, which belongs to the demo tenant's public
// restaurant site (see src/app/layout.tsx). Without this, everything under
// /hostflow silently inherited that other product's fonts via the shared
// body font-family. Fraunces (a warm, characterful display serif — menus
// and maître d' books, not another dashboard headline font) carries hero
// copy and big numbers; Manrope handles UI text; JetBrains Mono is used for
// data — table counts, stats, timestamps — anywhere the copy should read
// as a live figure rather than prose.
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-hf-display",
  display: "swap",
});
const sans = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-hf-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-hf-mono",
  display: "swap",
});

export default function HostFlowMarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${sans.variable} ${mono.variable} min-h-screen bg-hf-bg font-body text-hf-ink`}>
      {children}
    </div>
  );
}
