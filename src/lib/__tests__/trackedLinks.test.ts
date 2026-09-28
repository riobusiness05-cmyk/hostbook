import { describe, expect, it } from "vitest";
import { reviewRedirectUrl, trackedLinkToken, verifyTrackedLinkToken } from "@/lib/trackedLinks";

describe("tracked review links", () => {
  it("signs a reference and rejects anything else", () => {
    const t = trackedLinkToken("v:visit-1");
    expect(verifyTrackedLinkToken("v:visit-1", t)).toBe(true);
    expect(verifyTrackedLinkToken("v:visit-2", t)).toBe(false);
    expect(verifyTrackedLinkToken("v:visit-1", t.slice(0, -1) + "0")).toBe(false);
    expect(verifyTrackedLinkToken("v:visit-1", "")).toBe(false);
  });
  it("builds a first-party URL", () => {
    const u = new URL(reviewRedirectUrl("https://hostflow.space", "l:abc"));
    expect(u.host).toBe("hostflow.space");
    expect(u.pathname).toBe(`/r/l%3Aabc/${trackedLinkToken("l:abc")}`);
  });
});
