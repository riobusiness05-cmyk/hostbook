import { describe, expect, it } from "vitest";
import { composeThankYou } from "@/lib/hostflow/thankYouCopy";
import type { Language, Tone } from "@/lib/brandKit";

const TZ = "Atlantic/Canary";
const TONES: Tone[] = ["WARM_FAMILY", "UPSCALE", "FUN_LIVELY", "BEACH_BAR"];
const LANGS: Language[] = ["en", "es"];
const CLICHES = [/hope this (email|message) finds you/i, /valued (customer|guest)/i, /dear customer/i];

function at(hour: number, dayOffset = 0): Date {
  const d = new Date("2026-09-22T00:00:00Z");
  d.setUTCHours(hour + dayOffset * 24);
  return d;
}

describe("composeThankYou", () => {
  it("always lands in 60–110 words with one review ask, for every tone, language, daypart and guest type", () => {
    const cases: { hour: number; occasion: string | null; visitCount: number; partySize: number }[] = [
      { hour: 10, occasion: null, visitCount: 1, partySize: 2 },
      { hour: 13, occasion: "Birthday", visitCount: 4, partySize: 6 },
      { hour: 20, occasion: null, visitCount: 2, partySize: 3 },
      { hour: 23, occasion: "Anniversary", visitCount: 1, partySize: 8 },
    ];
    for (const tone of TONES) for (const language of LANGS) for (const c of cases) for (const sameDay of [true, false]) {
      const visitAt = at(c.hour);
      const now = sameDay ? at(c.hour + 1) : at(10, 1);
      const out = composeThankYou({
        firstName: "Sarah", venueName: "The Colonial", partySize: c.partySize, visitAt, now, timezone: TZ,
        occasion: c.occasion, visitCount: c.visitCount, tone, signOff: "Maria & the team", language, seed: `${tone}-${language}-${c.hour}`,
      });
      const body = out.paragraphs.join(" ");
      expect(out.wordCount, `${tone}/${language}/${c.hour}`).toBeGreaterThanOrEqual(60);
      expect(out.wordCount, `${tone}/${language}/${c.hour}`).toBeLessThanOrEqual(110);
      expect(body).toContain("Sarah");
      expect((body.match(/Google/g) ?? []).length).toBe(1);
      for (const re of CLICHES) expect(body).not.toMatch(re);
      if (tone !== "FUN_LIVELY") expect(body).not.toMatch(/[!¡]/);
      expect(out.subject.length).toBeLessThanOrEqual(45);
      expect(out.subject).toContain("Sarah");
    }
  });

  it("references the occasion and the guest being a regular, and never invents details", () => {
    const out = composeThankYou({
      firstName: "James", venueName: "Mantra", partySize: 6, visitAt: at(20), now: at(21), timezone: TZ,
      occasion: "Birthday", visitCount: 4, tone: "WARM_FAMILY", signOff: "The team", language: "en", seed: "x",
    });
    const body = out.paragraphs.join(" ");
    expect(body.toLowerCase()).toContain("birthday");
    expect(body).toMatch(/back|familiar|regular/i);
    expect(body).not.toMatch(/paella|steak|chef/i);
  });

  it("speaks the guest's language and uses formal address for the upscale tone in Spanish", () => {
    const out = composeThankYou({
      firstName: "Lucía", venueName: "Mantra", partySize: 2, visitAt: at(21), now: at(22), timezone: TZ,
      occasion: null, visitCount: 1, tone: "UPSCALE", signOff: "El equipo", language: "es", seed: "y",
    });
    expect(out.paragraphs[0]).toMatch(/^Estimado\/a Lucía,/);
    expect(out.paragraphs.join(" ")).toMatch(/recibirle|su /);
    expect(out.subject).toMatch(/^Gracias/);
  });

  it("says 'last night' rather than 'tonight' when the email goes the next morning", () => {
    const out = composeThankYou({
      firstName: "Sam", venueName: "V", partySize: 2, visitAt: at(21), now: at(10, 1), timezone: TZ,
      occasion: null, visitCount: 1, tone: "BEACH_BAR", signOff: "S", language: "en", seed: "z",
    });
    expect(out.paragraphs.join(" ")).toMatch(/last night/);
    expect(out.subject).toBe("Thanks for last night, Sam");
  });

  it("lets an owner's own message win, with placeholders filled", () => {
    const out = composeThankYou({
      firstName: "Ana", venueName: "V", partySize: 2, visitAt: at(20), now: at(21), timezone: TZ,
      occasion: null, visitCount: 1, tone: "FUN_LIVELY", signOff: "S", language: "en", seed: "w",
      customBody: "Hi {name},\n\nThanks for coming to {restaurant}.", customSubject: "Cheers, {name}",
    });
    expect(out.paragraphs).toEqual(["Hi Ana,", "Thanks for coming to V."]);
    expect(out.subject).toBe("Cheers, Ana");
  });

  it("varies wording between guests but is stable for the same visit", () => {
    const make = (seed: string) => composeThankYou({
      firstName: "A", venueName: "V", partySize: 2, visitAt: at(20), now: at(21), timezone: TZ,
      occasion: null, visitCount: 1, tone: "WARM_FAMILY", signOff: "S", language: "en", seed,
    }).paragraphs.join(" ");
    expect(make("visit-1")).toBe(make("visit-1"));
    const distinct = new Set(["a", "b", "c", "d", "e", "f"].map(make));
    expect(distinct.size).toBeGreaterThan(1);
  });
});
