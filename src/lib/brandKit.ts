// A venue's brand kit: everything the guest email needs to look like it came
// from the venue's own agency. Client-safe (no Prisma, no env) so the
// settings page and the server render from the same definitions.

export const FONT_STYLES = {
  CLASSIC_SERIF: {
    label: "Classic serif",
    heading: "Georgia, 'Times New Roman', Times, serif",
    body: "Georgia, 'Times New Roman', Times, serif",
  },
  MODERN_SANS: {
    label: "Modern sans",
    heading: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    body: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  ELEGANT_SCRIPT: {
    label: "Elegant script headings",
    heading: "'Apple Chancery', 'Snell Roundhand', 'URW Chancery L', 'Brush Script MT', cursive, Georgia, serif",
    body: "Georgia, 'Times New Roman', Times, serif",
  },
} as const;
export type FontStyle = keyof typeof FONT_STYLES;

export const TONES = {
  WARM_FAMILY: { label: "Warm & family", hint: "Friendly, personal, like a family-run place." },
  UPSCALE: { label: "Upscale & refined", hint: "Polished and understated. Formal address in Spanish." },
  FUN_LIVELY: { label: "Fun & lively", hint: "Energetic and playful — the only tone that allows an exclamation mark." },
  BEACH_BAR: { label: "Relaxed beach bar", hint: "Easy-going, short sentences, no fuss." },
} as const;
export type Tone = keyof typeof TONES;

export const THANK_YOU_MODES = {
  ASK: { label: "Ask every time", hint: "When a table is finished, staff are asked whether to send." },
  AUTO: { label: "Send automatically", hint: "Queued the moment the table is finished, after the delay below." },
  OFF: { label: "Off", hint: "Never send post-visit emails." },
} as const;
export type ThankYouMode = keyof typeof THANK_YOU_MODES;

export const THANK_YOU_DELAYS = {
  IMMEDIATE: { label: "Straight away", minutes: 0 },
  MIN_30: { label: "30 minutes later", minutes: 30 },
  HOUR_2: { label: "2 hours later", minutes: 120 },
  NEXT_MORNING: { label: "Next morning at 10:00", minutes: -1 },
} as const;
export type ThankYouDelay = keyof typeof THANK_YOU_DELAYS;

export const LANGUAGES = { en: "English", es: "Español" } as const;
export type Language = keyof typeof LANGUAGES;

// ── Colour helpers ───────────────────────────────────────────────────────

export function parseHex(hex: string | null | undefined): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** White or near-black, whichever reads on `bg`. */
export function contrastText(bg: string): string {
  return luminance(bg) < 0.58 ? "#ffffff" : "#1a1a1a";
}

export function shade(hex: string, factor: number): string {
  const rgb = parseHex(hex) ?? [201, 97, 31];
  return "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c * factor))).toString(16).padStart(2, "0")).join("");
}

/** A hex colour dark enough that white text stays legible on it. */
export function readableOn(hex: string): string {
  if (!parseHex(hex)) return "#c9611f";
  return luminance(hex) < 0.6 ? hex.toLowerCase() : shade(hex, 0.6);
}

// ── Google review link ───────────────────────────────────────────────────

/** Pulls a Place ID out of whatever the owner pasted: a bare ID, a Maps URL
 *  with placeid= / place_id=, or a writereview link. */
export function extractPlaceId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^ChIJ[\w-]{16,}$/.test(s)) return s;
  const m = /[?&](?:placeid|place_id)=([\w-]+)/i.exec(s);
  return m ? m[1] : null;
}

/** A pasted g.page/…/review or Google short link is already a review link. */
export function isReviewLink(input: string): boolean {
  return /^https?:\/\/(g\.page\/r\/[\w-]+\/review|search\.google\.com\/local\/writereview|maps\.app\.goo\.gl\/)/i.test(input.trim());
}

export function buildReviewUrl(placeId: string | null | undefined, fallbackUrl: string | null | undefined): string | null {
  if (placeId) return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
  const f = fallbackUrl?.trim();
  return f || null;
}

// ── The resolved kit ─────────────────────────────────────────────────────

export type BrandKit = {
  venueName: string;
  slug: string;
  primary: string;
  font: FontStyle;
  tone: Tone;
  voiceNotes: string | null;
  signOff: string;
  reviewUrl: string | null;
  replyTo: string | null;
  fromName: string;
  address: string | null;
  phone: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
  bookingUrl: string;
  defaultLanguage: Language;
  senderAddress: string;
};

export type BrandKitSource = {
  restaurant: { name: string; slug: string; brandColor: string; address: string | null; phone: string | null; email: string | null };
  settings: {
    brandPrimary: string | null;
    brandFont: string;
    brandTone: string;
    brandVoiceNotes: string | null;
    brandSignOff: string | null;
    googlePlaceId: string | null;
    googleReviewUrl: string | null;
    instagramUrl: string | null;
    websiteUrl: string | null;
    defaultLanguage: string;
    emailFromName: string | null;
    emailReplyTo: string | null;
  };
  appUrl: string;
  senderAddress: string;
};

/** Every field filled: a venue with nothing set up still gets a clean,
 *  correct email in its own name and colour. */
export function resolveBrandKit(src: BrandKitSource): BrandKit {
  const { restaurant: r, settings: s } = src;
  const primary = parseHex(s.brandPrimary) ? s.brandPrimary! : r.brandColor;
  const font = (s.brandFont in FONT_STYLES ? s.brandFont : "MODERN_SANS") as FontStyle;
  const tone = (s.brandTone in TONES ? s.brandTone : "WARM_FAMILY") as Tone;
  return {
    venueName: r.name,
    slug: r.slug,
    primary,
    font,
    tone,
    voiceNotes: s.brandVoiceNotes?.trim() || null,
    signOff: s.brandSignOff?.trim() || `The team at ${r.name}`,
    reviewUrl: buildReviewUrl(s.googlePlaceId, s.googleReviewUrl),
    replyTo: s.emailReplyTo?.trim() || r.email?.trim() || null,
    fromName: s.emailFromName?.trim() || r.name,
    address: r.address?.trim() || null,
    phone: r.phone?.trim() || null,
    instagramUrl: s.instagramUrl?.trim() || null,
    websiteUrl: s.websiteUrl?.trim() || null,
    bookingUrl: `${src.appUrl}/widget/${r.slug}`,
    defaultLanguage: (s.defaultLanguage === "es" ? "es" : "en") as Language,
    senderAddress: src.senderAddress,
  };
}
