import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hostContext } from "@/lib/hostflow/apiContext";
import { extractPalette, prepareEmailPhoto, prepareLogo, storePublicFile, deletePublicFile } from "@/lib/storage";

// Brand kit uploads: the venue's logo (one, replaces the previous) and up to
// five hero photos, processed for email and stored publicly. Each upload
// also returns a palette pulled from the image, to suggest brand colours.
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_PHOTOS = 5;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const RASTER = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;
  const assets = await prisma.brandAsset.findMany({ where: { restaurantId: ctx.restaurantId }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] });
  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  const form = await req.formData().catch(() => null);
  const kind = String(form?.get("kind") ?? "");
  const file = form?.get("file");
  if (!form || (kind !== "LOGO" && kind !== "PHOTO") || !(file instanceof File)) {
    return NextResponse.json({ error: "Send a file and a kind (LOGO or PHOTO)." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "That file is over 12MB — please use a smaller image." }, { status: 413 });
  const type = file.type;
  if (!(RASTER.has(type) || (kind === "LOGO" && type === "image/svg+xml"))) {
    return NextResponse.json({ error: kind === "LOGO" ? "Logos can be PNG, JPG, WebP or SVG." : "Photos can be PNG, JPG or WebP." }, { status: 415 });
  }
  if (kind === "PHOTO") {
    const count = await prisma.brandAsset.count({ where: { restaurantId: ctx.restaurantId, kind: "PHOTO" } });
    if (count >= MAX_PHOTOS) return NextResponse.json({ error: `You can have up to ${MAX_PHOTOS} photos — remove one first.` }, { status: 409 });
  }

  const input = Buffer.from(await file.arrayBuffer());
  let processed;
  try {
    processed = kind === "LOGO" ? await prepareLogo(input, type) : await prepareEmailPhoto(input);
  } catch {
    return NextResponse.json({ error: "That image couldn't be read — try a different file." }, { status: 422 });
  }
  let stored;
  try {
    stored = await storePublicFile(`brand/${ctx.restaurantId}/${kind.toLowerCase()}-${Date.now()}.${processed.ext}`, processed.buffer, processed.contentType);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
  const palette = await extractPalette(processed.buffer).catch(() => ({ primary: null, secondary: null, swatches: [] }));

  if (kind === "LOGO") {
    // One logo per venue: the old one goes, and the restaurant row's logoUrl
    // (used by the booking widget) follows the new one.
    const old = await prisma.brandAsset.findMany({ where: { restaurantId: ctx.restaurantId, kind: "LOGO" } });
    for (const o of old) await deletePublicFile(o.url);
    await prisma.brandAsset.deleteMany({ where: { restaurantId: ctx.restaurantId, kind: "LOGO" } });
    await prisma.restaurant.update({ where: { id: ctx.restaurantId }, data: { logoUrl: stored.url } });
  }
  const sortOrder = kind === "PHOTO" ? await prisma.brandAsset.count({ where: { restaurantId: ctx.restaurantId, kind: "PHOTO" } }) : 0;
  const asset = await prisma.brandAsset.create({
    data: {
      restaurantId: ctx.restaurantId,
      kind,
      url: stored.url,
      width: processed.width || null,
      height: processed.height || null,
      bytes: stored.bytes,
      sortOrder,
    },
  });
  return NextResponse.json({ asset, palette });
}
