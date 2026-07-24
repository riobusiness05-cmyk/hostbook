import type { Metadata } from "next";

// Without this, pages here that don't set their own metadata (login, signup,
// verify) fall back to the root layout's generateMetadata, which is scoped
// to whichever restaurant NEXT_PUBLIC_RESTAURANT_SLUG points to — showing
// that restaurant's name/tagline as the page title on Host Flow's own pages.
export const metadata: Metadata = {
  title: "Host Flow — The operating system for your floor",
  description: "Live floor management, smart seating, and an AI host assistant for independent restaurants and bars.",
};

export default function HostFlowMarketingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
