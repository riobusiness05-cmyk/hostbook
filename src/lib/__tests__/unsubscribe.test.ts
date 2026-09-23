import { describe, expect, it } from "vitest";
import { unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from "@/lib/unsubscribe";

describe("unsubscribe links", () => {
  it("verifies its own token and nothing else", () => {
    const t = unsubscribeToken("venue1", "Guest@Example.com");
    expect(verifyUnsubscribeToken("venue1", "guest@example.com", t)).toBe(true);
    expect(verifyUnsubscribeToken("venue2", "guest@example.com", t)).toBe(false);
    expect(verifyUnsubscribeToken("venue1", "other@example.com", t)).toBe(false);
    expect(verifyUnsubscribeToken("venue1", "guest@example.com", t.slice(1) + "0")).toBe(false);
    expect(verifyUnsubscribeToken("venue1", "guest@example.com", "")).toBe(false);
  });
  it("builds a link carrying venue, address and token", () => {
    const url = new URL(unsubscribeUrl("https://hostflow.space", "venue1", "Guest@Example.com"));
    expect(url.pathname).toBe("/email/unsubscribe");
    expect(url.searchParams.get("r")).toBe("venue1");
    expect(url.searchParams.get("e")).toBe("guest@example.com");
    expect(verifyUnsubscribeToken("venue1", "guest@example.com", url.searchParams.get("t")!)).toBe(true);
  });
});
