import type { Metadata } from "next";

// Without this, the page falls back to the root layout's generateMetadata,
// which resolves via getActiveRestaurant() — showing "The Colonial" as the
// tab title while a guest of a totally different restaurant manages their
// booking (same class of leak fixed for /host and /widget).
export const metadata: Metadata = {
  title: "Manage your booking — Host Flow",
};

// Standalone neutral layout for guest booking-management pages, isolated
// from both the Colonial demo site's dark theme (root layout) and the Host
// Flow marketing theme — a guest could be managing a booking for any
// restaurant, so this page must never carry another tenant's branding.
export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        background: "#fafafa",
        color: "#171717",
        minHeight: "100vh",
      }}
    >
      {children}
    </div>
  );
}
