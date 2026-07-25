"use client";

import { useMemo, useState } from "react";
import type { FloorState, TableDTO } from "@/lib/hostflow/floor";
import { STATUS_META, TABLE_STATUSES, statusColor } from "@/lib/hostflow/constants";
import { cx, minutesLabel } from "@/lib/host/format";

// The live floor plan. Pure SVG so it scales crisply from phone to the host
// stand's iPad to a wall display, and so table fills can animate between
// statuses with a simple CSS transition. The venue has multiple physical
// rooms (e.g. Main Room + Lounge); one room is shown at a time, and the
// viewBox is derived from that room's tables so it always fills the frame.

function sectionBounds(tables: TableDTO[]) {
  const padX = 22;
  const padTop = 34; // extra room up top for the area label
  const padBottom = 20;
  const xs = tables.flatMap((t) => [t.x - padX, t.x + t.width + padX]);
  const minX = Math.min(...xs);
  const minY = Math.min(...tables.map((t) => t.y)) - padTop;
  const maxY = Math.max(...tables.map((t) => t.y + t.height)) + padBottom;
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: maxY - minY };
}

// Merged tables never have their stored x/y changed — "unmerge puts them
// back" is automatic because nothing was ever moved in the database. This
// only computes where a merged-in table should be *drawn* this render: right
// next to its primary, in table-number order. As soon as mergedIntoId clears
// (split), this map stops covering that table and it renders at its real,
// untouched position again.
const MERGE_GAP = 14;

function layoutMergedPositions(tables: TableDTO[]): Map<string, { x: number; y: number }> {
  const byId = new Map(tables.map((t) => [t.id, t]));
  const childrenByPrimary = new Map<string, TableDTO[]>();
  for (const t of tables) {
    if (t.mergedIntoId && byId.has(t.mergedIntoId)) {
      const list = childrenByPrimary.get(t.mergedIntoId) ?? [];
      list.push(t);
      childrenByPrimary.set(t.mergedIntoId, list);
    }
  }
  const positions = new Map<string, { x: number; y: number }>();
  for (const [primaryId, children] of childrenByPrimary) {
    const primary = byId.get(primaryId)!;
    let cursorX = primary.x + primary.width + MERGE_GAP;
    for (const child of [...children].sort((a, b) => a.tableNumber - b.tableNumber)) {
      positions.set(child.id, { x: cursorX, y: primary.y + (primary.height - child.height) / 2 });
      cursorX += child.width + MERGE_GAP;
    }
  }
  return positions;
}

export function FloorPlan({
  tables: allTables,
  sections: allSections,
  selectedId,
  onSelect,
}: {
  tables: FloorState["tables"];
  sections: FloorState["sections"];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {

  // Section id → room, and the ordered list of rooms.
  const roomBySection = useMemo(
    () => new Map(allSections.map((s) => [s.id, s.room])),
    [allSections]
  );
  const rooms = useMemo(() => {
    const seen: string[] = [];
    for (const s of allSections) if (!seen.includes(s.room)) seen.push(s.room);
    return seen;
  }, [allSections]);

  const [room, setRoom] = useState<string>(rooms[0] ?? "Main Room");
  const currentRoom = rooms.includes(room) ? room : rooms[0] ?? "Main Room";

  // Which single section to zoom into, if any — null shows every section in
  // the room at once (the original behaviour). Reset whenever the room
  // changes so a stale section from another room can't stay selected.
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const selectRoom = (r: string) => {
    setRoom(r);
    setSectionFilter(null);
  };

  const roomTables = useMemo(
    () => allTables.filter((t) => t.section && roomBySection.get(t.section.id) === currentRoom),
    [allTables, roomBySection, currentRoom]
  );

  const roomSections = useMemo(() => {
    return allSections
      .filter((sec) => sec.room === currentRoom)
      .map((sec) => {
        const secTables = roomTables.filter((t) => t.section?.id === sec.id);
        if (secTables.length === 0) return null;
        return { ...sec, bounds: sectionBounds(secTables) };
      })
      .filter(Boolean) as Array<(typeof allSections)[number] & { bounds: ReturnType<typeof sectionBounds> }>;
  }, [allSections, roomTables, currentRoom]);

  const activeSection = sectionFilter ? roomSections.find((s) => s.id === sectionFilter) ?? null : null;
  const sections = activeSection ? [activeSection] : roomSections;
  const tables = activeSection ? roomTables.filter((t) => t.section?.id === activeSection.id) : roomTables;

  // Draw merged-in tables right next to their primary. Computed from the
  // whole room (not just the zoomed-in section) so a merge stays intact
  // however it's viewed; only ever affects render position, never the DTO.
  const mergedPositions = useMemo(() => layoutMergedPositions(roomTables), [roomTables]);
  const positionedTables = useMemo(
    () =>
      tables.map((t) => {
        const pos = mergedPositions.get(t.id);
        return pos ? { ...t, x: pos.x, y: pos.y } : t;
      }),
    [tables, mergedPositions]
  );
  const tableNumberById = useMemo(() => new Map(allTables.map((t) => [t.id, t.tableNumber])), [allTables]);

  // Dashed link outline drawn behind each merged cluster so the group reads
  // as one combined table at a glance.
  const mergedGroups = useMemo(() => {
    const byPrimary = new Map<string, TableDTO[]>();
    for (const t of positionedTables) {
      if (t.mergedIntoId) {
        const list = byPrimary.get(t.mergedIntoId) ?? [];
        list.push(t);
        byPrimary.set(t.mergedIntoId, list);
      }
    }
    const groups: Array<{ primaryId: string; x: number; y: number; w: number; h: number }> = [];
    for (const [primaryId, children] of byPrimary) {
      const primary = positionedTables.find((t) => t.id === primaryId);
      if (!primary) continue;
      const all = [primary, ...children];
      const minX = Math.min(...all.map((t) => t.x));
      const minY = Math.min(...all.map((t) => t.y));
      const maxX = Math.max(...all.map((t) => t.x + t.width));
      const maxY = Math.max(...all.map((t) => t.y + t.height));
      groups.push({ primaryId, x: minX - 10, y: minY - 10, w: maxX - minX + 20, h: maxY - minY + 20 });
    }
    return groups;
  }, [positionedTables]);

  // Dynamic viewBox from whatever's visible — the whole room, or just the
  // zoomed-in section. Isolating a section gives it the full frame instead
  // of sharing space with the others, which is what makes it worth tapping
  // into on a phone. Uses the merge-adjusted positions so a combined group
  // never renders clipped.
  const viewBox = useMemo(() => {
    if (positionedTables.length === 0) return "0 0 1000 700";
    const pad = 30;
    const xs = positionedTables.flatMap((t) => [t.x, t.x + t.width]);
    const ys = positionedTables.flatMap((t) => [t.y, t.y + t.height]);
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) - minX + pad;
    const h = Math.max(...ys) - minY + pad;
    return `${minX} ${minY} ${w} ${h}`;
  }, [positionedTables]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-br from-neutral-50 to-neutral-100 dark:border-white/10 dark:from-neutral-900 dark:to-neutral-950">
      {/* Toolbar: section chips (zoom into one area, or "All") + room switcher */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-black/5 p-2 dark:border-white/10">
        <div className="flex flex-1 flex-wrap gap-1">
          <button
            onClick={() => setSectionFilter(null)}
            className={cx(
              "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
              !sectionFilter
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
            )}
          >
            All
          </button>
          {roomSections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setSectionFilter(sec.id)}
              className={cx(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                sectionFilter === sec.id
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: sec.color }} />
              {sec.name}
            </button>
          ))}
        </div>

        {rooms.length > 1 && (
          <div className="flex shrink-0 gap-1 rounded-xl border border-black/5 bg-white/80 p-1 dark:border-white/10 dark:bg-black/40">
            {rooms.map((r) => (
              <button
                key={r}
                onClick={() => selectRoom(r)}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  r === currentRoom
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                )}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <svg viewBox={viewBox} className="h-full w-full" role="img" aria-label={`Floor plan — ${activeSection?.name ?? currentRoom}`}>
          {/* Area zones — a soft tinted background + label per section. The
              seed lays each area out in its own band (terrace left · restaurant
              top · bar bottom · back terrace right) with clear gaps, so these
              zone boxes never overlap. Tapping a zone (when more than one is
              visible) zooms straight into it, same as its chip above. */}
          {sections.map((sec) => (
            <g
              key={sec.id}
              onClick={roomSections.length > 1 && !activeSection ? () => setSectionFilter(sec.id) : undefined}
              className={roomSections.length > 1 && !activeSection ? "cursor-pointer" : undefined}
            >
              <rect
                x={sec.bounds.x}
                y={sec.bounds.y}
                width={sec.bounds.w}
                height={sec.bounds.h}
                rx={20}
                fill={`${sec.color}12`}
                stroke={`${sec.color}66`}
                strokeWidth={1.5}
              />
              <circle cx={sec.bounds.x + 16} cy={sec.bounds.y + 17} r={5} fill={sec.color} />
              <text
                x={sec.bounds.x + 28}
                y={sec.bounds.y + 22}
                fontSize={15}
                fontWeight={800}
                fill={sec.color}
                className="uppercase"
                style={{ letterSpacing: "0.09em" }}
              >
                {sec.name}
              </text>
            </g>
          ))}

          {/* Merged-group link outlines — drawn behind the tables so a
              combined group reads as one unit. */}
          {mergedGroups.map((g) => (
            <rect
              key={g.primaryId}
              x={g.x}
              y={g.y}
              width={g.w}
              height={g.h}
              rx={16}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth={2}
              strokeDasharray="6 4"
              opacity={0.6}
            />
          ))}

          {/* Tables */}
          {positionedTables.map((t) => (
            <TableGlyph
              key={t.id}
              table={t}
              selected={t.id === selectedId}
              onSelect={() => onSelect(t.id)}
              mergedIntoNumber={t.mergedIntoId ? tableNumberById.get(t.mergedIntoId) : undefined}
            />
          ))}
        </svg>

        <Legend />
      </div>
    </div>
  );
}

function TableGlyph({
  table,
  selected,
  onSelect,
  mergedIntoNumber,
}: {
  table: TableDTO;
  selected: boolean;
  onSelect: () => void;
  mergedIntoNumber?: number;
}) {
  const cxp = table.x + table.width / 2;
  const cyp = table.y + table.height / 2;
  const fill = statusColor(table.status);
  const round = table.shape === "ROUND";
  const s = table.session;
  const r = table.reservation;
  const pulse = table.status === "LATE" || s?.isOverrun;
  const textFill = "#ffffff";

  return (
    <g
      onClick={onSelect}
      className={cx("cursor-pointer", pulse && "hf-pulse")}
      style={{ transformOrigin: `${cxp}px ${cyp}px` }}
      role="button"
      aria-label={`Table ${table.tableNumber}, ${STATUS_META[table.status]?.label ?? table.status}`}
    >
      {/* Server accent ring */}
      {table.server && (
        round ? (
          <circle cx={cxp} cy={cyp} r={table.width / 2 + 5} fill="none" stroke={table.server.color} strokeWidth={2} opacity={0.55} />
        ) : (
          <rect x={table.x - 5} y={table.y - 5} width={table.width + 10} height={table.height + 10} rx={14} fill="none" stroke={table.server.color} strokeWidth={2} opacity={0.55} />
        )
      )}

      {round ? (
        <circle
          cx={cxp}
          cy={cyp}
          r={table.width / 2}
          fill={fill}
          stroke={selected ? "#0ea5e9" : "rgba(0,0,0,0.15)"}
          strokeWidth={selected ? 4 : 1.5}
          style={{ transition: "fill 0.5s ease, stroke 0.2s ease" }}
        />
      ) : (
        <rect
          x={table.x}
          y={table.y}
          width={table.width}
          height={table.height}
          rx={12}
          fill={fill}
          stroke={selected ? "#0ea5e9" : "rgba(0,0,0,0.15)"}
          strokeWidth={selected ? 4 : 1.5}
          style={{ transition: "fill 0.5s ease, stroke 0.2s ease" }}
        />
      )}

      {/* Waiting-to-move-outside marker: a party (usually at the bar) waiting
          for an outdoor table to free up so they can move outside to eat. */}
      {s?.waitingForOutdoor && (
        <g>
          <rect x={cxp - 34} y={table.y - 17} width={68} height={16} rx={8} fill="#0f766e" />
          <text x={cxp} y={table.y - 5} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#ffffff" style={{ letterSpacing: "0.02em" }}>
            → outside
          </text>
        </g>
      )}

      {/* Table number */}
      <text x={cxp} y={cyp - (s || r ? 8 : -1)} textAnchor="middle" fontSize={17} fontWeight={800} fill={textFill}>
        {table.tableNumber}
      </text>

      {/* Contextual line */}
      {s ? (
        <>
          <text x={cxp} y={cyp + 9} textAnchor="middle" fontSize={11} fontWeight={600} fill={textFill} opacity={0.95}>
            {truncate(s.guestName, 12)}
          </text>
          <text x={cxp} y={cyp + 22} textAnchor="middle" fontSize={10} fill={textFill} opacity={0.85}>
            {s.partySize}p · {s.isOverrun ? "over" : minutesLabel(s.minutesRemaining)}
          </text>
        </>
      ) : r ? (
        <>
          <text x={cxp} y={cyp + 9} textAnchor="middle" fontSize={11} fontWeight={600} fill={textFill} opacity={0.95}>
            {truncate(r.customerName, 12)}
          </text>
          <text x={cxp} y={cyp + 22} textAnchor="middle" fontSize={10} fill={textFill} opacity={0.85}>
            {r.isLate ? `${minutesLabel(Math.abs(r.minutesUntil))} late` : `in ${minutesLabel(r.minutesUntil)}`}
          </text>
        </>
      ) : mergedIntoNumber ? (
        <text x={cxp} y={cyp + 14} textAnchor="middle" fontSize={10} fontWeight={700} fill={textFill} opacity={0.9}>
          → Table {mergedIntoNumber}
        </text>
      ) : table.bookingCount && table.bookingCount > 0 ? (
        <text x={cxp} y={cyp + 14} textAnchor="middle" fontSize={10} fontWeight={600} fill={textFill} opacity={0.9}>
          {table.bookingCount} booking{table.bookingCount === 1 ? "" : "s"}
        </text>
      ) : (
        <text x={cxp} y={cyp + 14} textAnchor="middle" fontSize={10} fill={textFill} opacity={0.85}>
          {table.seatsMax} seats
        </text>
      )}
    </g>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-white/70 px-3 py-1.5 text-[10px] font-medium text-neutral-600 backdrop-blur dark:bg-black/40 dark:text-neutral-300">
      {TABLE_STATUSES.map((st) => (
        <span key={st} className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_META[st].color }} />
          {STATUS_META[st].label}
        </span>
      ))}
    </div>
  );
}
