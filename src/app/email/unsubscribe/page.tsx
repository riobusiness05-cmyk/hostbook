import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe" };

// The page behind the unsubscribe link in a venue's guest emails. A button,
// not an automatic action — see the API route for why.
export default async function UnsubscribePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const restaurantId = searchParams.r ?? "";
  const email = (searchParams.e ?? "").trim().toLowerCase();
  const token = searchParams.t ?? "";
  const done = searchParams.done === "1";
  const valid = !!restaurantId && !!email && !!token && verifyUnsubscribeToken(restaurantId, email, token);
  const venue = valid ? await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true, brandColor: true } }) : null;
  const params = new URLSearchParams({ r: restaurantId, e: email, t: token }).toString();

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f6f4f0", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif", color: "#1a1a1a" }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 12, border: "1px solid #e8e4dd", padding: 32, textAlign: "center" }}>
        {!valid || !venue ? (
          <>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>This link isn&apos;t valid</h1>
            <p style={{ color: "#5b5b5b", margin: 0 }}>Please use the unsubscribe link from the bottom of the email you received.</p>
          </>
        ) : done ? (
          <>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>You&apos;re unsubscribed</h1>
            <p style={{ color: "#5b5b5b", margin: 0 }}>
              {venue.name} won&apos;t send any more emails to <strong>{email}</strong>. Booking confirmations for tables you reserve are unaffected.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Unsubscribe from {venue.name}?</h1>
            <p style={{ color: "#5b5b5b", margin: "0 0 20px" }}>
              We&apos;ll stop sending post-visit emails to <strong>{email}</strong>.
            </p>
            <form method="post" action={`/api/email/unsubscribe?${params}`}>
              <button type="submit" style={{ background: venue.brandColor, color: "#fff", border: 0, borderRadius: 8, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                Unsubscribe
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
