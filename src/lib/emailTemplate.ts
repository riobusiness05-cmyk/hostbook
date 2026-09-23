// A tiny template language for bespoke, hand-designed guest emails:
//   {{name}}                 — inserted, HTML-escaped
//   {{{message}}}            — inserted raw (already HTML)
//   {{#review_url}}…{{/review_url}}  — kept only when that value is non-empty
// Nothing else: no logic, no loops, no code. A designer writes real HTML
// and drops these in where the venue's words and links belong.

export type TemplateVars = Record<string, string | null | undefined>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  let out = template;
  // Sections first, innermost-last so nesting works: repeat until none remain.
  const section = /\{\{#([a-z_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  for (let guard = 0; guard < 10 && section.test(out); guard++) {
    section.lastIndex = 0;
    out = out.replace(section, (_m, key: string, body: string) => (vars[key] ? body : ""));
  }
  out = out.replace(/\{\{\{([a-z_]+)\}\}\}/g, (_m, key: string) => vars[key] ?? "");
  out = out.replace(/\{\{([a-z_]+)\}\}/g, (_m, key: string) => escapeHtml(vars[key] ?? ""));
  return out;
}

/** The placeholders a thank-you template may use, with what each holds. */
export const THANK_YOU_PLACEHOLDERS: { key: string; raw?: boolean; about: string }[] = [
  { key: "name", about: "Guest's first name" },
  { key: "venue", about: "Venue name" },
  { key: "subject", about: "The generated subject line" },
  { key: "message", raw: true, about: "The personal note as <p> paragraphs — use {{{message}}} (three braces)" },
  { key: "message_text", about: "The note as plain text, paragraphs separated by blank lines" },
  { key: "sign_off", about: "Sign-off, e.g. “Maria & the team at The Colonial”" },
  { key: "review_url", about: "Google review link (empty if none set — wrap the button in {{#review_url}}…{{/review_url}})" },
  { key: "review_label", about: "“Leave us a Google review” in the guest's language" },
  { key: "booking_url", about: "The venue's booking page" },
  { key: "book_label", about: "“Book a table” in the guest's language" },
  { key: "book_line", about: "“Whenever you'd like to come back…” in the guest's language" },
  { key: "unsubscribe_url", about: "Required — the unsubscribe link" },
  { key: "unsubscribe_label", about: "“Unsubscribe from these emails” in the guest's language" },
  { key: "address", about: "Venue address (may be empty)" },
  { key: "phone", about: "Venue phone (may be empty)" },
  { key: "instagram_url", about: "Instagram link (may be empty)" },
  { key: "website_url", about: "Website link (may be empty)" },
  { key: "primary", about: "Brand colour, e.g. #7f6921" },
  { key: "font_heading", about: "Heading font stack for the venue's chosen style" },
  { key: "font_body", about: "Body font stack" },
  { key: "year", about: "Current year" },
  { key: "language", about: "en or es" },
];

/** What's wrong with a template before it's allowed to be saved. */
export function validateTemplate(html: string): string[] {
  const problems: string[] = [];
  if (!html.trim()) problems.push("The template is empty.");
  if (!/\{\{unsubscribe_url\}\}/.test(html)) problems.push("Add {{unsubscribe_url}} — every guest email must carry an unsubscribe link.");
  if (!/\{\{\{message\}\}\}|\{\{message_text\}\}/.test(html)) problems.push("Add {{{message}}} (or {{message_text}}) so the guest's personal note appears.");
  const opened = [...html.matchAll(/\{\{#([a-z_]+)\}\}/g)].map((m) => m[1]);
  for (const key of opened) if (!html.includes(`{{/${key}}}`)) problems.push(`{{#${key}}} is never closed with {{/${key}}}.`);
  const known = new Set(THANK_YOU_PLACEHOLDERS.map((p) => p.key));
  for (const m of html.matchAll(/\{\{\{?#?\/?([a-z_]+)\}?\}\}/g)) if (!known.has(m[1])) problems.push(`Unknown placeholder {{${m[1]}}}.`);
  return [...new Set(problems)];
}
