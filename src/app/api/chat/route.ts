import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveRestaurant } from "@/lib/restaurant";
import { runChatTurn } from "@/lib/claude";

const chatRequestSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1).max(2000),
  channel: z.enum(["WEB", "SMS", "WHATSAPP"]).default("WEB"),
});

const HISTORY_TURNS = 12; // messages of context sent back to the model

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const restaurant = await getActiveRestaurant();
  const { sessionId, message, channel } = parsed.data;

  let session = sessionId
    ? await prisma.chatSession.findUnique({ where: { id: sessionId } })
    : null;

  if (!session || session.restaurantId !== restaurant.id) {
    session = await prisma.chatSession.create({
      data: { restaurantId: restaurant.id, channel },
    });
  }

  const priorMessages = await prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    take: HISTORY_TURNS,
  });

  const history = priorMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  let reply: string;
  try {
    const result = await runChatTurn({ restaurant, history, userMessage: message });
    reply = result.reply;
  } catch (err) {
    console.error("Chat error:", err);
    const hint =
      err instanceof Error && err.message.includes("ANTHROPIC_API_KEY")
        ? " (ANTHROPIC_API_KEY isn't configured yet.)"
        : "";
    return NextResponse.json(
      { error: `Sorry, I'm having trouble right now. Please try again shortly.${hint}` },
      { status: 500 }
    );
  }

  await prisma.chatMessage.createMany({
    data: [
      { sessionId: session.id, role: "user", content: message },
      { sessionId: session.id, role: "assistant", content: reply },
    ],
  });

  return NextResponse.json({ sessionId: session.id, reply });
}
