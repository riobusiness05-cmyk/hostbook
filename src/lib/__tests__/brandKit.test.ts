import { describe, expect, it } from "vitest";
import { buildReviewUrl, contrastText, extractPlaceId, isReviewLink, resolveBrandKit, readableOn } from "@/lib/brandKit";

const bare = {
  restaurant: { name: "The Harbour", slug: "the-harbour", brandColor: "#0ea5e9", address: null, phone: null, email: null },
  settings: {
    brandPrimary: null, brandFont: "nonsense", brandTone: "nonsense",
    brandVoiceNotes: null, brandSignOff: null, googlePlaceId: null, googleReviewUrl: null, instagramUrl: null, websiteUrl: null,
    defaultLanguage: "fr", emailFromName: null, emailReplyTo: null,
  },
  appUrl: "https://hostflow.space",
  senderAddress: "the-harbour@hostflow.space",
};

describe("resolveBrandKit", () => {
  it("gives a venue with no brand kit a complete, sensible one", () => {
    const kit = resolveBrandKit(bare);
    expect(kit.primary).toBe("#0ea5e9");
    expect(kit.font).toBe("MODERN_SANS");
    expect(kit.tone).toBe("WARM_FAMILY");
    expect(kit.signOff).toBe("The team at The Harbour");
    expect(kit.fromName).toBe("The Harbour");
    expect(kit.defaultLanguage).toBe("en");
    expect(kit.reviewUrl).toBeNull();
    expect(kit.bookingUrl).toBe("https://hostflow.space/widget/the-harbour");
  });

  it("prefers explicit settings", () => {
    const kit = resolveBrandKit({
      ...bare,
      settings: { ...bare.settings, brandPrimary: "#112233", brandSignOff: "Maria & the team", googlePlaceId: "ChIJabcdefghijklmnopqrstuv", defaultLanguage: "es" },
    });
    expect(kit.primary).toBe("#112233");
    expect(kit.signOff).toBe("Maria & the team");
    expect(kit.reviewUrl).toBe("https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnopqrstuv");
    expect(kit.defaultLanguage).toBe("es");
  });
});

describe("Google review links", () => {
  it("extracts a Place ID from a bare id or a Maps URL", () => {
    expect(extractPlaceId("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
    expect(extractPlaceId("https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4")).toBeNull();
    expect(extractPlaceId("https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
    expect(extractPlaceId("not a place")).toBeNull();
  });
  it("accepts a pasted review link as-is", () => {
    expect(isReviewLink("https://g.page/r/CTESTcolonial/review")).toBe(true);
    expect(isReviewLink("https://example.com")).toBe(false);
    expect(buildReviewUrl(null, "https://g.page/r/CTESTcolonial/review")).toBe("https://g.page/r/CTESTcolonial/review");
    expect(buildReviewUrl("ChIJx", null)).toBe("https://search.google.com/local/writereview?placeid=ChIJx");
  });
});

describe("colour helpers", () => {
  it("keeps button text legible", () => {
    expect(contrastText("#ffffff")).toBe("#1a1a1a");
    expect(contrastText("#000000")).toBe("#ffffff");
    expect(readableOn("#e8bb60")).not.toBe("#e8bb60"); // too light for white text — darkened
    expect(readableOn("#1f3a5f")).toBe("#1f3a5f");
    expect(readableOn("garbage")).toMatch(/^#[0-9a-f]{6}$/);
  });
});
