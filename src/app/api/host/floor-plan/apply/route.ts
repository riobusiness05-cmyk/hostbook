import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hostContext, handleActionError } from "@/lib/hostflow/apiContext";
import { emitFloorChange } from "@/lib/hostflow/events";

// Turns a (host-reviewed, possibly edited) detection result into real
// Section/DiningTable rows. Coordinates arrive normalized 0..1 from the
// vision model; scaled here onto the same canvas range the floor plan
// editor already works in, so everything lands fully editable immediately
// (drag/rotate/merge all just work — no special-casing for AI-created rows).
const CANVAS_W = 1100;
const CANVAS_H = 800;
const PAD = 60;

const tableSchema = z.object({
  tempId: z.string(),
  number: z.number().int().min(0).nullable(),
  shape: z.enum(["ROUND", "SQUARE", "RECT"]),
  seats: z.number().int().min(1).max(30),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  rotation: z.number(),
  mergedWithTempId: z.string().nullable(),
  sectionTempId: z.string(),
});

const bodySchema = z.object({
  room: z.string().min(1).max(60).default("Main Room"),
  sections: z.array(z.object({ tempId: z.string(), name: z.string().min(1).max(60), isOutdoor: z.boolean() })).min(1),
  tables: z.array(tableSchema).min(1),
});

function dimensionsFor(shape: "ROUND" | "SQUARE" | "RECT", seats: number): { width: number; height: number } {
  if (shape === "ROUND") {
    const d = seats <= 2 ? 70 : seats <= 4 ? 86 : 112;
    return { width: d, height: d };
  }
  if (shape === "RECT") {
    return { width: 92, height: Math.max(90, Math.min(220, seats * 25)) };
  }
  const s = seats <= 2 ? 70 : seats <= 4 ? 90 : 112;
  return { width: s, height: s };
}

export async function POST(req: NextRequest) {
  const ctx = await hostContext(req);
  if ("error" in ctx) return ctx.error;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid floor plan data", details: parsed.error.flatten() }, { status: 400 });
  }
  const { room, sections, tables } = parsed.data;

  try {
    const existingCount = await prisma.diningTable.count({ where: { restaurantId: ctx.restaurantId } });
    let nextAutoNumber = 1000 + existingCount; // guaranteed-free-looking range for tables the AI couldn't read a number on

    const created = await prisma.$transaction(async (tx) => {
      // Sections are @@unique([restaurantId, name]) — upsert so re-running
      // the wizard (or importing a second photo later) can't collide.
      const sectionIdByTemp = new Map<string, string>();
      for (const [i, sec] of sections.entries()) {
        const row = await tx.section.upsert({
          where: { restaurantId_name: { restaurantId: ctx.restaurantId, name: sec.name } },
          create: { restaurantId: ctx.restaurantId, name: sec.name, isOutdoor: sec.isOutdoor, room, sortOrder: i },
          update: { isOutdoor: sec.isOutdoor, room },
        });
        sectionIdByTemp.set(sec.tempId, row.id);
      }

      const tableIdByTemp = new Map<string, string>();
      for (const t of tables) {
        const { width, height } = dimensionsFor(t.shape, t.seats);
        const tableNumber = t.number ?? nextAutoNumber++;
        const x = Math.round(t.x * CANVAS_W + PAD - width / 2);
        const y = Math.round(t.y * CANVAS_H + PAD - height / 2);
        const row = await tx.diningTable.create({
          data: {
            restaurantId: ctx.restaurantId,
            name: `Table ${tableNumber}`,
            tableNumber,
            capacityMin: Math.max(1, t.seats - 1),
            capacityMax: t.seats,
            shape: t.shape,
            x,
            y,
            defaultX: x,
            defaultY: y,
            defaultRotation: t.rotation,
            width,
            height,
            rotation: t.rotation,
            sectionId: sectionIdByTemp.get(t.sectionTempId) ?? null,
          },
        });
        tableIdByTemp.set(t.tempId, row.id);
      }

      // Second pass: apply merges now that every table has a real id. A
      // merged-in child's own capacityMin/Max stay as detected — matches
      // how a live merge only grows the primary, never touches the child.
      for (const t of tables) {
        if (!t.mergedWithTempId) continue;
        const childId = tableIdByTemp.get(t.tempId);
        const primaryId = tableIdByTemp.get(t.mergedWithTempId);
        if (!childId || !primaryId || childId === primaryId) continue;
        const child = await tx.diningTable.findUnique({ where: { id: childId } });
        if (!child) continue;
        await tx.diningTable.update({ where: { id: childId }, data: { mergedIntoId: primaryId, status: "BLOCKED" } });
        await tx.diningTable.update({
          where: { id: primaryId },
          data: { capacityMax: { increment: child.capacityMax } },
        });
      }

      return { tableCount: tables.length, sectionCount: sections.length };
    });

    emitFloorChange(ctx.restaurantId, "table");
    return NextResponse.json({ ok: true, ...created });
  } catch (err) {
    return handleActionError(err);
  }
}
