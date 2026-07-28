import { NextRequest, NextResponse } from "next/server";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { assistantSchema } from "@/lib/hostflow/schemas";
import { runAssistant } from "@/lib/hostflow/assistant";
import { getSettings } from "@/lib/hostflow/floor";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  const settings = await getSettings(ctx.restaurantId);
  if (!settings.aiAssistantEnabled) {
    return NextResponse.json({ error: "The AI assistant is turned off in settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = assistantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }
  try {
    const result = await runAssistant(ctx.restaurantId, parsed.data.message, parsed.data.history);
    return NextResponse.json(result);
  } catch (err) {
    return handleActionError(err);
  }
}
