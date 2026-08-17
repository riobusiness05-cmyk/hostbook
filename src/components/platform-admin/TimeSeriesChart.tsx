"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { SeriesPoint } from "@/lib/platformAdmin";

// Shared shape for all three "value per month, last N months" charts on the
// platform admin dashboard (restaurant growth, booking volume, MRR) — one
// wrapper instead of three near-identical chart blocks.
export function TimeSeriesChart({
  data,
  color = "#3b82f6",
  formatValue = (v: number) => String(v),
  height = 220,
}: {
  data: SeriesPoint[];
  color?: string;
  formatValue?: (v: number) => string;
  height?: number;
}) {
  const gradientId = `ts-gradient-${color.replace("#", "")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
        <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} width={40} tickFormatter={formatValue} />
        <Tooltip
          formatter={(value) => [formatValue(Number(value)), ""]}
          contentStyle={{ background: "#171717", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#e5e5e5" }}
          itemStyle={{ color }}
        />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
