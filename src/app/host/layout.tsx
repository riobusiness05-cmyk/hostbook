import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerHostSession } from "@/lib/hostAuth";

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
  return children;
}
