"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/state";

const GOLD = "#c19a3c";
const INK = "#3a352f";
const SLICE_COLORS = ["#c19a3c", "#3a352f", "#8b8378", "#d3b25f", "#6b6459"];

export function LeadsByDayChart({ data }: { data: { date: string; total: number }[] }) {
  const hasData = data.some((d) => d.total > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Solicitudes por día</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4dfd4" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: INK }}
                axisLine={{ stroke: "#e4dfd4" }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: INK }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e4dfd4",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="total" fill={GOLD} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="Sin solicitudes en el periodo" />
        )}
      </CardContent>
    </Card>
  );
}

export function LeadsByOriginChart({ data }: { data: { name: string; value: number }[] }) {
  const filtered = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = filtered.reduce((sum, d) => sum + d.value, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Origen de leads</CardTitle>
      </CardHeader>
      <CardContent>
        {filtered.length > 0 ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ResponsiveContainer width="100%" height={220} className="sm:max-w-[220px]">
              <PieChart>
                <Pie
                  data={filtered}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {filtered.map((entry, index) => (
                    <Cell key={entry.name} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e4dfd4",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <ul className="w-full min-w-0 flex-1 space-y-1.5">
              {filtered.map((entry, index) => (
                <li key={entry.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length] }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-ink-700">{entry.name}</span>
                  <span className="shrink-0 font-medium text-ink-900">{entry.value}</span>
                  <span className="w-10 shrink-0 text-right text-xs text-ink-400">
                    {total > 0 ? Math.round((entry.value / total) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState title="Sin datos de origen" />
        )}
      </CardContent>
    </Card>
  );
}
