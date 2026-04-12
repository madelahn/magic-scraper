"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { CHART_COLORS } from "../page";

interface ChartTokens {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
}

interface BumpWeek {
  weekStart: string;
  ranks: { player: string; rank: number }[];
}

interface Props {
  data: BumpWeek[];
  players: string[];
  chartTokens: ChartTokens;
}

export default function MostLikelyBump({ data, players, chartTokens }: Props) {
  // Pivot bump data into flat rows for Recharts
  const pivoted = data.map((week) => {
    const row: Record<string, string | number> = { weekStart: week.weekStart };
    for (const r of week.ranks) {
      row[r.player] = r.rank;
    }
    return row;
  });

  // Compute max rank across all weeks
  const maxRank = Math.max(
    ...data.flatMap((w) => w.ranks.map((r) => r.rank)),
    1
  );

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={pivoted}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartTokens.border} />
        <XAxis
          dataKey="weekStart"
          tick={{ fontSize: 12, fill: chartTokens.muted }}
          axisLine={{ stroke: chartTokens.border }}
          tickFormatter={(v: string) => {
            const d = new Date(v + "T00:00:00Z");
            return d.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            });
          }}
        />
        <YAxis
          reversed={true}
          domain={[1, maxRank]}
          allowDecimals={false}
          tick={{ fontSize: 12, fill: chartTokens.muted }}
          axisLine={{ stroke: chartTokens.border }}
          label={{
            value: "Rank",
            angle: -90,
            position: "insideLeft",
            fill: chartTokens.muted,
          }}
        />
        {players.map((player, i) => (
          <Line
            key={player}
            type="monotone"
            dataKey={player}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            connectNulls={true}
          />
        ))}
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload || payload.length === 0) return null;
            // Sort entries by rank ascending
            const sorted = [...payload]
              .filter((e) => e.value != null)
              .sort((a, b) => (a.value as number) - (b.value as number));
            return (
              <div
                style={{
                  background: chartTokens.surface,
                  border: `1px solid ${chartTokens.border}`,
                  color: chartTokens.foreground,
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Week of {label}
                </div>
                {sorted.map((entry) => (
                  <div
                    key={entry.dataKey as string}
                    style={{ color: entry.color, marginBottom: 2 }}
                  >
                    #{entry.value} {entry.name}
                  </div>
                ))}
              </div>
            );
          }}
        />
        <Legend iconType="line" />
      </LineChart>
    </ResponsiveContainer>
  );
}
