import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isAdminRequest } from "@/lib/adminGuard";

// The designs kept in the repo under email-designs/ (one HTML file per
// venue), so a prepared design can be dropped into the editor with one
// click instead of copy-pasting a few hundred lines of HTML.
// next.config.mjs traces that folder into this route's bundle.
export const dynamic = "force-dynamic";

const DIR = path.join(process.cwd(), "email-designs");

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = new URL(req.url).searchParams.get("name");
  try {
    if (!name) {
      const files = await fs.readdir(DIR);
      const names = files.filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5)).sort();
      return NextResponse.json({ names });
    }
    if (!/^[a-z0-9-]{1,80}$/.test(name)) return NextResponse.json({ error: "Unknown design" }, { status: 404 });
    const html = await fs.readFile(path.join(DIR, `${name}.html`), "utf8");
    return NextResponse.json({ name, html });
  } catch {
    return name ? NextResponse.json({ error: "Unknown design" }, { status: 404 }) : NextResponse.json({ names: [] });
  }
}
