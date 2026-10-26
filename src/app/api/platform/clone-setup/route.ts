import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { emitFloorChange } from "@/lib/hostflow/events";

// Copies one venue's setup onto another: floor plan (areas + tables), opening
// hours, settings (areas, pacing, no-show, thank-you/brand kit) and the custom
// email design. For "the real account is signing up, make it look like the
// one we prepared". Never touches accounts, bookings, billing or identity
// (name, slug, email). The target's existing areas/tables/hours are replaced
// only for the parts chosen; refused if the target already has bookings on
// tables, since those rows would be orphaned.
const schema = z.object({
  fromRestaurantId: z.string().min(1),
  toRestaurantId: z.string().min(1),
  parts: z.object({
    floorPlan: z.boolean().default(true),
    hours: z.boolean().default(true),
    settings: z.boolean().default(true),
    emailDesign: z.boolean().default(true),
    profile: z.boolean().default(true),
  }),
});

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Venues that can be copied from, newest first.
  const venues = await prisma.restaurant.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, slug: true, _count: { select: { tables: true, sections: true } } },
  });
  return NextResponse.json({ venues: venues.map((v) => ({ id: v.id, name: v.name, slug: v.slug, tables: v._count.tables, sections: v._count.sections })) });
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { fromRestaurantId: from, toRestaurantId: to, parts } = parsed.data;
  if (from === to) return NextResponse.json({ error: "Pick a different venue to copy from." }, { status: 400 });

  const [source, target] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: from }, include: { sections: true, tables: true, openingHours: true, settings: true } }),
    prisma.restaurant.findUnique({ where: { id: to }, include: { _count: { select: { reservations: true, tableSessions: true } } } }),
  ]);
  if (!source || !target) return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  if (parts.floorPlan && (target._count.reservations > 0 || target._count.tableSessions > 0)) {
    return NextResponse.json(
      { error: `${target.name} already has ${target._count.reservations} bookings — copying a floor plan over them would orphan them. Untick "Floor plan" or clear the bookings first.` },
      { status: 409 }
    );
  }

  const done: Record<string, string> = {};
  await prisma.$transaction(async (tx) => {
    if (parts.floorPlan) {
      await tx.diningTable.deleteMany({ where: { restaurantId: to } });
      await tx.section.deleteMany({ where: { restaurantId: to } });
      const sectionIdMap = new Map<string, string>();
      for (const s of source.sections) {
        const created = await tx.section.create({
          data: { restaurantId: to, name: s.name, color: s.color, sortOrder: s.sortOrder, isOutdoor: s.isOutdoor, room: s.room, bookableOnline: s.bookableOnline, note: s.note },
        });
        sectionIdMap.set(s.id, created.id);
      }
      for (const t of source.tables) {
        await tx.diningTable.create({
          data: {
            restaurantId: to,
            name: t.name, tableNumber: t.tableNumber, capacityMin: t.capacityMin, capacityMax: t.capacityMax, isActive: t.isActive,
            x: t.x, y: t.y, width: t.width, height: t.height, shape: t.shape, rotation: t.rotation,
            defaultX: t.defaultX ?? t.x, defaultY: t.defaultY ?? t.y, defaultRotation: t.defaultRotation ?? t.rotation,
            status: "AVAILABLE", notes: null, isJoinable: t.isJoinable,
            sectionId: t.sectionId ? sectionIdMap.get(t.sectionId) ?? null : null,
          },
        });
      }
      done.floorPlan = `${source.sections.length} areas, ${source.tables.length} tables`;
    }
    if (parts.hours) {
      await tx.openingHour.deleteMany({ where: { restaurantId: to } });
      for (const h of source.openingHours) {
        await tx.openingHour.create({ data: { restaurantId: to, dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed } });
      }
      done.hours = `${source.openingHours.length} days`;
    }
    if ((parts.settings || parts.emailDesign) && source.settings) {
      const { id: _id, restaurantId: _rid, thankYouEmailHtml, ...rest } = source.settings as typeof source.settings & { id?: string };
      void _id; void _rid;
      const data: Record<string, unknown> = {};
      if (parts.settings) Object.assign(data, rest);
      if (parts.emailDesign) data.thankYouEmailHtml = thankYouEmailHtml;
      await tx.restaurantSettings.upsert({ where: { restaurantId: to }, create: { restaurantId: to, ...data }, update: data });
      done.settings = parts.settings ? "copied" : "kept";
      done.emailDesign = parts.emailDesign ? (thankYouEmailHtml ? "copied" : "source has none") : "kept";
    }
    if (parts.profile) {
      await tx.restaurant.update({
        where: { id: to },
        data: {
          tagline: source.tagline, timezone: source.timezone, brandColor: source.brandColor, logoUrl: source.logoUrl,
          welcomeMessage: source.welcomeMessage, defaultReservationMinutes: source.defaultReservationMinutes, maxPartySize: source.maxPartySize,
          onboardingCompletedAt: target.onboardingCompletedAt ?? new Date(),
        },
      });
      done.profile = "look & feel, timezone, party size";
    }
  });
  emitFloorChange(to, "table");
  console.warn(`[platform] cloned setup ${source.slug} → ${target.slug}: ${JSON.stringify(done)}`);
  return NextResponse.json({ ok: true, done });
}
