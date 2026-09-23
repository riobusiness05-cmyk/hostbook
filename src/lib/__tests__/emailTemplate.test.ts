import { describe, expect, it } from "vitest";
import { renderTemplate, validateTemplate } from "@/lib/emailTemplate";

describe("renderTemplate", () => {
  it("fills placeholders, escapes by default, and inserts raw with triple braces", () => {
    const out = renderTemplate("<h1>{{venue}}</h1>{{{message}}}<i>{{name}}</i>", { venue: "Tom & Jerry's", message: "<p>Hi</p>", name: "<b>x</b>" });
    expect(out).toBe("<h1>Tom &amp; Jerry&#039;s</h1><p>Hi</p><i>&lt;b&gt;x&lt;/b&gt;</i>".replace("&#039;", "'"));
  });

  it("keeps a section only when its value is set", () => {
    const t = "A{{#review_url}}[<a href=\"{{review_url}}\">go</a>]{{/review_url}}B";
    expect(renderTemplate(t, { review_url: "https://r" })).toBe('A[<a href="https://r">go</a>]B');
    expect(renderTemplate(t, { review_url: null })).toBe("AB");
    expect(renderTemplate(t, {})).toBe("AB");
  });

  it("leaves unknown placeholders empty rather than printing braces", () => {
    expect(renderTemplate("x{{nope}}y", {})).toBe("xy");
  });
});

describe("validateTemplate", () => {
  it("insists on an unsubscribe link and the message", () => {
    expect(validateTemplate("<p>hello</p>")).toEqual(expect.arrayContaining([expect.stringContaining("unsubscribe_url"), expect.stringContaining("message")]));
    expect(validateTemplate("{{{message}}} <a href=\"{{unsubscribe_url}}\">x</a>")).toEqual([]);
  });
  it("catches unclosed sections and typos", () => {
    const p = validateTemplate("{{#review_url}}{{{message}}}{{unsubscribe_url}} {{reveiw_url}}");
    expect(p.some((x) => x.includes("never closed"))).toBe(true);
    expect(p.some((x) => x.includes("Unknown placeholder"))).toBe(true);
  });
});
