"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FloorState, TableDTO } from "@/lib/hostflow/floor";
import { STATUS_META, TABLE_STATUSES, statusColor } from "@/lib/hostflow/constants";
import { cx, minutesLabel } from "@/lib/host/format";
import * as api from "@/lib/host/client";

// The live floor plan. Pure SVG so it scales crisply from phone to the host
// stand's iPad to a wall display, and so table fills can animate between
// statuses with a simple CSS transition. The venue has multiple physical
// rooms (e.g. Main Room + Lounge); one room is shown at a time, and the
// viewBox is derived from that room's tables so it always fills the frame.

// Purely cosmetic per-section widening for the tinted zone band — doesn't
// move any table, just extends how far the coloured background reads on
// one side. Keyed by section name since there's no "zone size" field on the
// Section model; this is the venue's own visual preference, not derived
// data. User feedback: Main Terrace ("the green part of the front") should
// read wider than its tables alone would draw it.
const EXTRA_ZONE_PAD: Record<string, { left?: number; right?: number }> = {
  "Main Terrace": { left: 70 },
};

function sectionBounds(tables: TableDTO[], extraPad?: { left?: number; right?: number }) {
  const padX = 22;
  const padTop = 34; // extra room up top for the area label
  const padBottom = 20;
  const xs = tables.flatMap((t) => [t.x - padX, t.x + t.width + padX]);
  const minX = Math.min(...xs) - (extraPad?.left ?? 0);
  const maxX = Math.max(...xs) + (extraPad?.right ?? 0);
  const minY = Math.min(...tables.map((t) => t.y)) - padTop;
  const maxY = Math.max(...tables.map((t) => t.y + t.height)) + padBottom;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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

type DragState =
  | { mode: "move"; id: string; startX: number; startY: number; origX: number; origY: number; rotation: number }
  | { mode: "rotate"; id: string; cx: number; cy: number; x: number; y: number };

export function FloorPlan({
  tables: allTables,
  sections: allSections,
  selectedId,
  onSelect,
  refresh,
  setPaused,
}: {
  tables: FloorState["tables"];
  sections: FloorState["sections"];
  selectedId: string | null;
  onSelect: (id: string) => void;
  refresh: (opts?: { force?: boolean }) => Promise<void>;
  setPaused: (v: boolean) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Drag position/rotation lives in a ref (not state) so pointermove doesn't
  // fight React's render cycle — `tick` just forces a re-render to pick up
  // whatever the ref currently holds.
  const overridesRef = useRef<Record<string, { x: number; y: number; rotation: number }>>({});
  const [, setTick] = useState(0);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    setPaused(editMode);
    return () => setPaused(false);
  }, [editMode, setPaused]);

  // Resolves a table's position as of *this instant* — its just-dropped spot
  // if a drag saved one this session, otherwise whatever the last floor
  // fetch had. Reading straight from `allTables` alone goes stale the moment
  // edit mode pauses live refresh: a save's own refresh() no-ops under that
  // same pause, so without this, a second drag on the same table would start
  // from its pre-drag position and jump.
  const currentPos = useCallback(
    (id: string) => {
      const ov = overridesRef.current[id];
      if (ov) return ov;
      const t = allTables.find((t) => t.id === id);
      return t ? { x: t.x, y: t.y, rotation: t.rotation } : { x: 0, y: 0, rotation: 0 };
    },
    [allTables]
  );

  const toSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: clientX, y: clientY };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const saveReposition = useCallback(
    (id: string, ov: { x: number; y: number; rotation: number }) => {
      api
        .tableAction(id, { action: "reposition", x: Math.round(ov.x), y: Math.round(ov.y), rotation: Math.round(ov.rotation) })
        // force: true — edit mode pauses live refresh so a background SSE
        // tick can't yank a table mid-drag, but that same pause would also
        // swallow this refresh, leaving `allTables` stale for the next drag.
        .then(() => refresh({ force: true }))
        .catch(() => {
          // Drop the optimistic override on failure so the table snaps back
          // to its last known-good (server) position instead of staying stuck.
          delete overridesRef.current[id];
          setTick((t) => t + 1);
        });
    },
    [refresh]
  );

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    window.removeEventListener("pointermove", handleMoveRef.current);
    window.removeEventListener("pointerup", handleUpRef.current);
    if (!d) return;
    const ov = overridesRef.current[d.id];
    if (!ov) return;

    // Dropping one table on top of another joins them, same as picking
    // "Merge" from the panel — the stationary table you dropped onto stays
    // the primary and keeps its spot; the dragged table becomes its merged
    // child (and immediately renders next to it via the existing merge
    // layout, not wherever it happened to be dropped).
    if (d.mode === "move") {
      const dragged = allTables.find((t) => t.id === d.id);
      const draggedHasChildren = allTables.some((t) => t.mergedIntoId === d.id);
      // Same exclusions as the "Merge" picker in TablePanel: a table with its
      // own upcoming reservation can't be folded into another without
      // stranding that booking.
      if (dragged && !dragged.mergedIntoId && !draggedHasChildren && !dragged.reservation) {
        const cx = ov.x + dragged.width / 2;
        const cy = ov.y + dragged.height / 2;
        const target = allTables.find((t) => {
          if (t.id === d.id || !t.isJoinable || t.mergedIntoId || t.status === "OCCUPIED" || t.reservation) {
            return false;
          }
          const p = currentPos(t.id);
          return cx >= p.x && cx <= p.x + t.width && cy >= p.y && cy <= p.y + t.height;
        });
        if (target) {
          delete overridesRef.current[d.id];
          setTick((t) => t + 1);
          api
            .tableAction(target.id, { action: "merge", otherTableId: d.id })
            .then(() => refresh({ force: true }))
            .catch(() => {
              // Merge rejected server-side (e.g. target changed mid-drag) —
              // fall back to a plain move so the drag isn't silently lost.
              saveReposition(d.id, ov);
            });
          return;
        }
      }
    }

    saveReposition(d.id, ov);
  }, [allTables, currentPos, refresh, saveReposition]);

  const handleMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      const p = toSvgPoint(e.clientX, e.clientY);
      if (d.mode === "move") {
        overridesRef.current = {
          ...overridesRef.current,
          [d.id]: { x: d.origX + (p.x - d.startX), y: d.origY + (p.y - d.startY), rotation: d.rotation },
        };
      } else {
        const angle = (Math.atan2(p.y - d.cy, p.x - d.cx) * 180) / Math.PI + 90;
        const snapped = Math.round(angle / 15) * 15;
        const rotation = ((snapped % 360) + 360) % 360;
        overridesRef.current = { ...overridesRef.current, [d.id]: { x: d.x, y: d.y, rotation } };
      }
      setTick((t) => t + 1);
    },
    [toSvgPoint]
  );

  // Refs so the stable endDrag/handleMove above can be added/removed as the
  // exact same function reference each time (addEventListener needs that to
  // dedupe correctly across repeated drags).
  const handleMoveRef = useRef(handleMove);
  const handleUpRef = useRef(endDrag);
  handleMoveRef.current = handleMove;
  handleUpRef.current = endDrag;

  const beginMove = (e: React.PointerEvent, table: TableDTO) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    // Without capture, a touch drag can get hijacked by the browser's own
    // scroll/pan gesture partway through — the table would move a little
    // then "let go" instead of following the finger freely.
    // Best-effort — some browsers reject capture for an id they don't
    // recognize as active. Never let that abort the drag itself.
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    const p = toSvgPoint(e.clientX, e.clientY);
    const cur = currentPos(table.id);
    dragRef.current = { mode: "move", id: table.id, startX: p.x, startY: p.y, origX: cur.x, origY: cur.y, rotation: cur.rotation };
    overridesRef.current = { ...overridesRef.current, [table.id]: cur };
    window.addEventListener("pointermove", handleMoveRef.current);
    window.addEventListener("pointerup", handleUpRef.current);
  };

  const beginRotate = (e: React.PointerEvent, table: TableDTO) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    // Best-effort — some browsers reject capture for an id they don't
    // recognize as active. Never let that abort the drag itself.
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    const cur = currentPos(table.id);
    dragRef.current = { mode: "rotate", id: table.id, cx: cur.x + table.width / 2, cy: cur.y + table.height / 2, x: cur.x, y: cur.y };
    overridesRef.current = { ...overridesRef.current, [table.id]: cur };
    window.addEventListener("pointermove", handleMoveRef.current);
    window.addEventListener("pointerup", handleUpRef.current);
  };

  const resetLayout = useCallback(async () => {
    if (resetting) return;
    if (!window.confirm("Reset every table to its saved layout? This undoes any dragging/rotating done since it was set up.")) {
      return;
    }
    setResetting(true);
    try {
      overridesRef.current = {};
      await api.resetFloorPlan();
      await refresh({ force: true });
    } finally {
      setResetting(false);
    }
  }, [resetting, refresh]);

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
        return { ...sec, bounds: sectionBounds(secTables, EXTRA_ZONE_PAD[sec.name]) };
      })
      .filter(Boolean) as Array<(typeof allSections)[number] & { bounds: ReturnType<typeof sectionBounds> }>;
  }, [allSections, roomTables, currentRoom]);

  const activeSection = sectionFilter ? roomSections.find((s) => s.id === sectionFilter) ?? null : null;
  const sections = useMemo(() => (activeSection ? [activeSection] : roomSections), [activeSection, roomSections]);
  const tables = activeSection ? roomTables.filter((t) => t.section?.id === activeSection.id) : roomTables;

  // Draw merged-in tables right next to their primary. Computed from the
  // whole room (not just the zoomed-in section) so a merge stays intact
  // however it's viewed; only ever affects render position, never the DTO.
  const mergedPositions = useMemo(() => layoutMergedPositions(roomTables), [roomTables]);
  // Intentionally recomputed every render (not memoized) — it needs to react
  // to overridesRef changing mid-drag, which a ref mutation can't trigger a
  // memo dependency on; the `tick` state above is what forces the re-render.
  const positionedTables = tables.map((t) => {
    const ov = overridesRef.current[t.id];
    if (ov) return { ...t, x: ov.x, y: ov.y, rotation: ov.rotation };
    const pos = mergedPositions.get(t.id);
    return pos ? { ...t, x: pos.x, y: pos.y } : t;
  });
  const tableNumberById = useMemo(() => new Map(allTables.map((t) => [t.id, t.tableNumber])), [allTables]);
  // Drags must originate from the table's real stored position, never the
  // merge-shifted render position, or dragging a merged-in child would
  // permanently bake its temporary "next to primary" spot into the DB.
  const rawById = useMemo(() => new Map(allTables.map((t) => [t.id, t])), [allTables]);

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
  // never renders clipped — also includes each zone's own bounds, since a
  // cosmetically widened zone (EXTRA_ZONE_PAD) can extend past its tables.
  const viewBox = useMemo(() => {
    if (positionedTables.length === 0) return "0 0 1000 700";
    const pad = 30;
    const xs = [
      ...positionedTables.flatMap((t) => [t.x, t.x + t.width]),
      ...sections.flatMap((sec) => [sec.bounds.x, sec.bounds.x + sec.bounds.w]),
    ];
    const ys = [
      ...positionedTables.flatMap((t) => [t.y, t.y + t.height]),
      ...sections.flatMap((sec) => [sec.bounds.y, sec.bounds.y + sec.bounds.h]),
    ];
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) - minX + pad;
    const h = Math.max(...ys) - minY + pad;
    return `${minX} ${minY} ${w} ${h}`;
  }, [positionedTables, sections]);

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

        {editMode && (
          <button
            onClick={resetLayout}
            disabled={resetting}
            className="shrink-0 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-900 disabled:opacity-50 dark:border-white/15 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {resetting ? "Resetting…" : "↺ Reset layout"}
          </button>
        )}

        <button
          onClick={() => setEditMode((v) => !v)}
          className={cx(
            "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            editMode
              ? "bg-sky-500 text-white"
              : "border border-black/10 text-neutral-500 hover:bg-black/5 hover:text-neutral-900 dark:border-white/15 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          )}
        >
          {editMode ? "Done editing" : "✏️ Edit layout"}
        </button>
      </div>

      {editMode && (
        <p className="shrink-0 border-b border-black/5 bg-sky-500/10 px-3 py-1.5 text-center text-xs font-medium text-sky-700 dark:border-white/10 dark:text-sky-300">
          Drag a table to move it · drag its handle to turn it
        </p>
      )}

      <div className="relative min-h-0 flex-1">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="h-full w-full"
          role="img"
          aria-label={`Floor plan — ${activeSection?.name ?? currentRoom}`}
        >
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
              editMode={editMode}
              onDragStart={(e) => beginMove(e, rawById.get(t.id) ?? t)}
              onRotateStart={(e) => beginRotate(e, rawById.get(t.id) ?? t)}
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
  editMode,
  onDragStart,
  onRotateStart,
}: {
  table: TableDTO;
  selected: boolean;
  onSelect: () => void;
  mergedIntoNumber?: number;
  editMode?: boolean;
  onDragStart?: (e: React.PointerEvent) => void;
  onRotateStart?: (e: React.PointerEvent) => void;
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
      onClick={editMode ? undefined : onSelect}
      onPointerDown={editMode ? onDragStart : undefined}
      className={cx(editMode ? "cursor-grab touch-none" : "cursor-pointer", pulse && !editMode && "hf-pulse")}
      style={{ transformOrigin: `${cxp}px ${cyp}px`, touchAction: editMode ? "none" : undefined }}
      transform={table.rotation ? `rotate(${table.rotation} ${cxp} ${cyp})` : undefined}
      role="button"
      aria-label={`Table ${table.tableNumber}, ${STATUS_META[table.status]?.label ?? table.status}`}
    >
      {/* Edit-mode outline + rotate handle */}
      {editMode && (
        <>
          <rect
            x={table.x - 4}
            y={table.y - 4}
            width={table.width + 8}
            height={table.height + 8}
            rx={round ? table.width / 2 + 4 : 14}
            fill="none"
            stroke="#0ea5e9"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
          <line x1={cxp} y1={table.y - 4} x2={cxp} y2={table.y - 22} stroke="#0ea5e9" strokeWidth={2} />
          <circle
            cx={cxp}
            cy={table.y - 26}
            r={7}
            fill="#0ea5e9"
            stroke="#ffffff"
            strokeWidth={2}
            className="cursor-grab touch-none"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onRotateStart?.(e);
            }}
          />
        </>
      )}

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
