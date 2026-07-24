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

  const tables = useMemo(
    () => allTables.filter((t) => t.section && roomBySection.get(t.section.id) === currentRoom),
    [allTables, roomBySection, currentRoom]
  );

  const sections = useMemo(() => {
    return allSections
      .filter((sec) => sec.room === currentRoom)
      .map((sec) => {
        const secTables = tables.filter((t) => t.section?.id === sec.id);
        if (secTables.length === 0) return null;
        return { ...sec, bounds: sectionBounds(secTables) };
      })
      .filter(Boolean) as Array<(typeof allSections)[number] & { bounds: ReturnType<typeof sectionBounds> }>;
  }, [allSections, tables, currentRoom]);

  // Dynamic viewBox from the visible room's tables.
  const viewBox = useMemo(() => {
    if (tables.length === 0) return "0 0 1000 700";
    const pad = 30;
    const xs = tables.flatMap((t) => [t.x, t.x + t.width]);
    const ys = tables.flatMap((t) => [t.y, t.y + t.height]);
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) - minX + pad;
    const h = Math.max(...ys) - minY + pad;
    return `${minX} ${minY} ${w} ${h}`;
  }, [tables]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-br from-neutral-50 to-neutral-100 dark:border-white/10 dark:from-neutral-900 dark:to-neutral-950">
      {/* Room switcher */}
      {rooms.length > 1 && (
        <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-xl border border-black/5 bg-white/80 p-1 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/40">
          {rooms.map((r) => (
            <button
              key={r}
              onClick={() => setRoom(r)}
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

      <svg viewBox={viewBox} className="h-full w-full" role="img" aria-label={`Floor plan — ${currentRoom}`}>
        {/* Area zones — a soft tinted background + label per section. The
            seed lays each area out in its own band (terrace left · restaurant
            top · bar bottom · back terrace right) with clear gaps, so these
            zone boxes never overlap. */}
        {sections.map((sec) => (
          <g key={sec.id}>
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

        {/* Tables */}
        {tables.map((t) => (
          <TableGlyph key={t.id} table={t} selected={t.id === selectedId} onSelect={() => onSelect(t.id)} />
        ))}
      </svg>

      <Legend />
    </div>
  );
}

function TableGlyph({ table, selected, onSelect }: { table: TableDTO; selected: boolean; onSelect: () => void }) {
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
