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
  const filtered = data.filter((d) => d.value > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Origen de leads</CardTitle>
      </CardHeader>
      <CardContent>
        {filtered.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
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
        ) : (
          <EmptyState title="Sin datos de origen" />
        )}
      </CardContent>
    </Card>
  );
}
