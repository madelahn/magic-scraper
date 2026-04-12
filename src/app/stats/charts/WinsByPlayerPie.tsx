"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
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

interface WinsByPlayerDatum {
  player: string;
  wins: number;
}

interface Props {
  data: WinsByPlayerDatum[];
  chartTokens: ChartTokens;
}

export default function WinsByPlayerPie({ data, chartTokens }: Props) {
  const coloredData = data.map((d, i) => ({
    ...d,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const total = data.reduce((s, d) => s + d.wins, 0);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={coloredData}
          dataKey="wins"
          nameKey="player"
          cx="50%"
          cy="50%"
          outerRadius={120}
        />
        <Tooltip
          formatter={(value, name) => {
            const v = Number(value);
            return [`${v} wins (${total > 0 ? Math.round((v / total) * 100) : 0}%)`, String(name)];
          }}
          contentStyle={{
            background: chartTokens.surface,
            border: `1px solid ${chartTokens.border}`,
            color: chartTokens.foreground,
          }}
        />
        <Legend
          iconType="circle"
          formatter={(value: string) => (
            <span style={{ color: chartTokens.muted }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
