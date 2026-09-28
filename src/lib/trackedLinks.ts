import crypto from "crypto";

// First-party click tracking for the review button: the email links to
// /r/<ref>/<sig> on our own domain, we note the click, and send the guest
// straight on to Google. No link rewriting through a third-party tracking
// subdomain, which inbox providers read as a marketing signal.
//
// `ref` is "v:<visitId>" for a real thank-you (resolved to that visit's
// email log row) or "l:<emailLogId>" for a test send.

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET || "dev-only-unsubscribe-secret";
}

export function trackedLinkToken(ref: string): string {
  return crypto.createHmac("sha256", secret()).update(`review:${ref}`).digest("hex").slice(0, 24);
}

export function verifyTrackedLinkToken(ref: string, token: string): boolean {
  const expected = Buffer.from(trackedLinkToken(ref));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export function reviewRedirectUrl(appUrl: string, ref: string): string {
  return `${appUrl}/r/${encodeURIComponent(ref)}/${trackedLinkToken(ref)}`;
}
