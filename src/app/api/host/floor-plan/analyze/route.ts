import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { analyzeFloorPlanImage } from "@/lib/floorPlanVision";
import { HostFlowError } from "@/lib/hostflow/actions";

const MAX_BASE64_LENGTH = 6_000_000; // ~4.5MB decoded, comfortably under Vercel's request body cap

const bodySchema = z.object({
  imageBase64: z.string().min(1).max(MAX_BASE64_LENGTH),
  mediaType: z.string().min(1),
});

// Detection only — never writes to the database. The host reviews/edits the
// result client-side and only real tables get created via the /apply route.
export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please upload a valid image", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const analysis = await analyzeFloorPlanImage(parsed.data.imageBase64, parsed.data.mediaType);
    if (analysis.tables.length === 0) {
      throw new HostFlowError("Couldn't find any tables in that image — try a clearer or more direct photo of the floor plan.", 422);
    }
    return NextResponse.json({ analysis });
  } catch (err) {
    return handleActionError(err);
  }
}
