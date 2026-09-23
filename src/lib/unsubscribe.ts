import crypto from "crypto";

// Unsubscribe links carry no database id — just the venue, the address and
// an HMAC over both, so a link can't be forged for someone else's address
// and needs nothing stored to be verified.

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET || "dev-only-unsubscribe-secret";
}

export function unsubscribeToken(restaurantId: string, email: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`${restaurantId}:${email.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyUnsubscribeToken(restaurantId: string, email: string, token: string): boolean {
  const expected = Buffer.from(unsubscribeToken(restaurantId, email));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export function unsubscribeUrl(appUrl: string, restaurantId: string, email: string): string {
  const params = new URLSearchParams({ r: restaurantId, e: email.trim().toLowerCase(), t: unsubscribeToken(restaurantId, email) });
  return `${appUrl}/email/unsubscribe?${params.toString()}`;
}
