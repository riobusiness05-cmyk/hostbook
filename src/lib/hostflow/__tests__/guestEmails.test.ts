import { describe, expect, it, vi } from "vitest";
import { nextSendAt, renderThankYou, sendThankYouWithDeps, visitEmail, type SendDeps, type VisitForEmail } from "@/lib/hostflow/guestEmails";
import { resolveBrandKit } from "@/lib/brandKit";

function visit(over: Partial<VisitForEmail> = {}): VisitForEmail {
  return {
    id: "visit-1", restaurantId: "venue1", guestName: "Maria García", guestEmail: null, language: null, partySize: 2,
    seatedAt: new Date("2026-09-22T19:00:00Z"), occasion: null, thankYouEmailSentAt: null, reservationId: "res-1",
    reservation: { customerEmail: "maria@example.com", language: "es", occasion: null }, ...over,
  };
}

/** Fake persistence: the same rules as the Prisma-backed deps, in memory. */
function fakeDeps(over: Partial<SendDeps> = {}) {
  const state = { sentAt: null as Date | null, savedEmail: null as string | null, suppressed: new Set<string>() };
  const send = vi.fn(async () => ({ ok: true }));
  const deps: SendDeps = {
    canSend: async () => ({ ok: true }),
    loadVisit: async (_r, id) => (id === "visit-1" ? visit({ thankYouEmailSentAt: state.sentAt, guestEmail: state.savedEmail }) : null),
    saveVisitEmail: async (_id, email) => { state.savedEmail = email; },
    isSuppressed: async (_r, email) => state.suppressed.has(email),
    claim: async () => { if (state.sentAt) return false; state.sentAt = new Date(); return true; },
    unclaim: async () => { state.sentAt = null; },
    render: async () => ({ subject: "s", html: "<p>h</p>", text: "t", language: "en", headers: {} }),
    send,
    ...over,
  };
  return { deps, state, send };
}

describe("sendThankYouWithDeps", () => {
  it("sends once and refuses a second send for the same visit", async () => {
    const { deps, send } = fakeDeps();
    expect(await sendThankYouWithDeps(deps, "venue1", "visit-1")).toEqual({ sent: true, to: "maria@example.com" });
    expect(await sendThankYouWithDeps(deps, "venue1", "visit-1")).toEqual({ sent: false, reason: "ALREADY_SENT" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("refuses when there is no email, and accepts one typed by staff", async () => {
    const { deps, state, send } = fakeDeps({ loadVisit: async () => visit({ reservation: null, guestEmail: state.savedEmail }) });
    expect(await sendThankYouWithDeps(deps, "venue1", "visit-1")).toEqual({ sent: false, reason: "NO_EMAIL" });
    expect(send).not.toHaveBeenCalled();
    expect((await sendThankYouWithDeps(deps, "venue1", "visit-1", { email: "not-an-email" })).sent).toBe(false);
    expect(await sendThankYouWithDeps(deps, "venue1", "visit-1", { email: " Maria@Example.com " })).toEqual({ sent: true, to: "maria@example.com" });
    expect(state.savedEmail).toBe("maria@example.com");
  });

  it("honours an unsubscribe forever for that venue", async () => {
    const { deps, state, send } = fakeDeps();
    state.suppressed.add("maria@example.com");
    expect(await sendThankYouWithDeps(deps, "venue1", "visit-1")).toEqual({ sent: false, reason: "UNSUBSCRIBED" });
    expect(send).not.toHaveBeenCalled();
    expect(state.sentAt).toBeNull();
  });

  it("releases the claim when the provider fails, so it can be retried", async () => {
    const { deps, state } = fakeDeps({ send: vi.fn(async () => ({ ok: false, error: "503 down" })) });
    const out = await sendThankYouWithDeps(deps, "venue1", "visit-1");
    expect(out).toEqual({ sent: false, reason: "SEND_FAILED", detail: "503 down" });
    expect(state.sentAt).toBeNull();
  });

  it("respects the venue's switch and plan", async () => {
    const off = fakeDeps({ canSend: async () => ({ ok: false, reason: "OFF" }) });
    expect(await sendThankYouWithDeps(off.deps, "venue1", "visit-1")).toEqual({ sent: false, reason: "OFF" });
    const plan = fakeDeps({ canSend: async () => ({ ok: false, reason: "PLAN" }) });
    expect(await sendThankYouWithDeps(plan.deps, "venue1", "visit-1")).toEqual({ sent: false, reason: "PLAN" });
    expect(off.send).not.toHaveBeenCalled();
  });

  it("prefers the address staff typed over the booking's", () => {
    expect(visitEmail(visit())).toBe("maria@example.com");
    expect(visitEmail(visit({ guestEmail: "Other@Example.com" }))).toBe("other@example.com");
    expect(visitEmail(visit({ guestEmail: null, reservation: null }))).toBeNull();
  });
});

describe("renderThankYou", () => {
  const kit = resolveBrandKit({
    restaurant: { name: "Bare Bar", slug: "bare-bar", brandColor: "#c9611f", address: null, phone: null, email: null },
    settings: {
      brandPrimary: null, brandFont: "MODERN_SANS", brandTone: "BEACH_BAR",
      brandVoiceNotes: null, brandSignOff: null, googlePlaceId: null, googleReviewUrl: null, instagramUrl: null, websiteUrl: null,
      defaultLanguage: "en", emailFromName: null, emailReplyTo: null,
    },
    appUrl: "https://hostflow.space", senderAddress: "bare-bar@hostflow.space",
  });

  it("always produces a complete email, even with no brand kit at all", () => {
    const r = renderThankYou(kit, { thankYouEmailSubject: null, thankYouEmailBody: null }, "venue1", "Atlantic/Canary", {
      firstName: "Sam", email: "sam@example.com", partySize: 2, visitAt: new Date("2026-09-22T20:00:00Z"), occasion: null, visitCount: 1, language: "en", seed: "v",
    }, new Date("2026-09-22T22:00:00Z"));
    expect(r.subject).toContain("Sam");
    expect(r.html).toContain("Bare Bar");
    expect(r.html).toContain("/email/unsubscribe?");
    expect(r.html).not.toMatch(/undefined|null|\[object/);
    expect(r.html).not.toMatch(/writereview|g\.page/); // no review link configured → no button
    expect(r.text).toContain("Sam");
    expect(r.html).toContain("/widget/bare-bar"); // the "book again" link
    expect(r.headers["List-Unsubscribe"]).toMatch(/^<https?:\/\/[^/]+\/api\/email\/unsubscribe\?/);
    expect(r.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("nextSendAt", () => {
  it("queues 'next morning' for 10:00 in the venue's own time", () => {
    const late = new Date("2026-09-22T22:30:00Z"); // 23:30 in Canary (UTC+1 in September)
    const at = nextSendAt("NEXT_MORNING", "Atlantic/Canary", late);
    expect(at.toISOString()).toBe("2026-09-23T09:00:00.000Z"); // 10:00 Canary
    const early = new Date("2026-09-23T07:00:00Z"); // 08:00 Canary — today's 10:00 is still ahead
    expect(nextSendAt("NEXT_MORNING", "Atlantic/Canary", early).toISOString()).toBe("2026-09-23T09:00:00.000Z");
    expect(nextSendAt("MIN_30", "UTC", late).getTime()).toBe(late.getTime() + 30 * 60000);
  });
});
