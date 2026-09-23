import { put, del } from "@vercel/blob";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";

// Public file storage for brand assets. Production uses Vercel Blob: either
// a classic BLOB_READ_WRITE_TOKEN, or (newer stores) BLOB_STORE_ID plus the
// VERCEL_OIDC_TOKEN Vercel injects into functions — the SDK works out which.
// Without either — local dev — files land in public/uploads so the whole
// flow still works end to end offline.

function blobConfigured(): boolean {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export type StoredFile = { url: string; bytes: number; contentType: string };

export async function storePublicFile(relativePath: string, data: Buffer, contentType: string): Promise<StoredFile> {
  if (blobConfigured()) {
    const blob = await put(relativePath, data, { access: "public", contentType, addRandomSuffix: true });
    return { url: blob.url, bytes: data.length, contentType };
  }
  // On Vercel the filesystem is read-only, so without a Blob token there is
  // nowhere to put the file — say so plainly instead of failing deep inside.
  if (process.env.VERCEL) {
    throw new Error("Image storage isn't set up yet — connect a Blob store to this project (Vercel → Storage → Blob) and redeploy.");
  }
  const local = path.join(process.cwd(), "public", "uploads", relativePath);
  await fs.mkdir(path.dirname(local), { recursive: true });
  await fs.writeFile(local, data);
  console.log(`[storage:local] wrote ${local} (connect a Vercel Blob store to use it instead)`);
  // Absolute, because these URLs end up inside emails, where a relative
  // path means nothing.
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return { url: `${base}/uploads/${relativePath}`, bytes: data.length, contentType };
}

export async function deletePublicFile(url: string): Promise<void> {
  const local = url.match(/\/uploads\/(.+)$/);
  if (local && !url.includes("blob.vercel-storage.com")) {
    await fs.rm(path.join(process.cwd(), "public", "uploads", local[1]), { force: true });
    return;
  }
  if (blobConfigured()) await del(url).catch(() => {});
}

// ── Image processing for email ───────────────────────────────────────────

export type ProcessedImage = { buffer: Buffer; width: number; height: number; contentType: string; ext: string };

/** A hero photo: at most 1200px wide and ~200KB, JPEG, orientation fixed. */
export async function prepareEmailPhoto(input: Buffer): Promise<ProcessedImage> {
  const base = sharp(input).rotate().resize({ width: 1200, withoutEnlargement: true });
  let quality = 82;
  let out = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  while (out.data.length > 200 * 1024 && quality > 45) {
    quality -= 8;
    out = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  }
  return { buffer: out.data, width: out.info.width, height: out.info.height, contentType: "image/jpeg", ext: "jpg" };
}

/** A logo: SVG passes through; raster is shrunk to ≤600px wide, PNG kept for transparency. */
export async function prepareLogo(input: Buffer, contentType: string): Promise<ProcessedImage> {
  if (contentType === "image/svg+xml") {
    return { buffer: input, width: 0, height: 0, contentType, ext: "svg" };
  }
  const meta = await sharp(input).metadata();
  const base = sharp(input).rotate().resize({ width: 600, withoutEnlargement: true });
  if (meta.hasAlpha) {
    const out = await base.png({ compressionLevel: 9, palette: true }).toBuffer({ resolveWithObject: true });
    return { buffer: out.data, width: out.info.width, height: out.info.height, contentType: "image/png", ext: "png" };
  }
  const out = await base.jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height, contentType: "image/jpeg", ext: "jpg" };
}

// ── Palette extraction ───────────────────────────────────────────────────

function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

function hsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/**
 * The colours that matter in an image: the most common vivid tones first
 * (a logo's brand colour, a terrace's blue), then neutrals. Works on a tiny
 * downsample so it's fast enough to run on upload. SVGs are rasterised by
 * sharp like anything else.
 */
export async function extractPalette(input: Buffer): Promise<{ primary: string | null; secondary: string | null; swatches: string[] }> {
  const { data, info } = await sharp(input).resize(48, 48, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3];
    if (a < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    cur.r += r; cur.g += g; cur.b += b; cur.n += 1;
    buckets.set(key, cur);
  }
  const colours = [...buckets.values()]
    .map((c) => ({ r: c.r / c.n, g: c.g / c.n, b: c.b / c.n, n: c.n }))
    .sort((a, b) => b.n - a.n);

  const vivid = colours.filter((c) => {
    const { s, l } = hsl(c.r, c.g, c.b);
    return s >= 0.3 && l >= 0.18 && l <= 0.82;
  });
  const hueOf = (c: { r: number; g: number; b: number }) => hsl(c.r, c.g, c.b).h;
  const primary = vivid[0] ?? null;
  const secondary =
    vivid.find((c) => primary && Math.abs(hueOf(c) - hueOf(primary)) > 40 && Math.abs(hueOf(c) - hueOf(primary)) < 320) ??
    vivid[1] ??
    null;
  const swatches: string[] = [];
  for (const c of [...vivid, ...colours]) {
    const hex = toHex(c.r, c.g, c.b);
    if (!swatches.includes(hex)) swatches.push(hex);
    if (swatches.length >= 6) break;
  }
  return {
    primary: primary ? toHex(primary.r, primary.g, primary.b) : null,
    secondary: secondary ? toHex(secondary.r, secondary.g, secondary.b) : null,
    swatches,
  };
}
