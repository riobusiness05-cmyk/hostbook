import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";
import { getServerHostSession } from "@/lib/hostAuth";

// Host Flow's own type system — the same set /hostflow uses. Without this the
// staff floor app inherited the root layout's Cormorant/Jost, which belong to
// the demo tenant's public restaurant site: the product was literally wearing
// another brand's typefaces all night. Fraunces carries table numbers and
// figures, Manrope the UI text, JetBrains Mono anything that should read as a
// live reading rather than prose.
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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

// Without this, pages here fall back to the root layout's generateMetadata,
// which is scoped to whichever restaurant NEXT_PUBLIC_RESTAURANT_SLUG points
// to — showing that restaurant's name/tagline as the tab title on the staff
// dashboard instead of Host Flow's own branding.
export const metadata: Metadata = {
  title: "Host Flow — Dashboard",
};

// The host floor app is staff-only and multi-tenant: the session determines
// which bar's floor is shown. Unauthenticated staff are sent to the Host Flow
// sign-in (not the customer site).
export default function HostLayout({ children }: { children: React.ReactNode }) {
  const session = getServerHostSession();
  if (!session) {
    redirect("/hostflow/login");
  }
  return <div className={`${display.variable} ${sans.variable} ${mono.variable} font-body`}>{children}</div>;
}
