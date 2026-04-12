"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { CHART_COLORS } from "../page";

interface ChartTokens {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
}

interface WeeklyFrequencyDatum {
  weekStart: string;
  gameCount: number;
}

interface Props {
  data: WeeklyFrequencyDatum[];
  chartTokens: ChartTokens;
}

export default function WeeklyFrequencyLine({ data, chartTokens }: Props) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
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
          allowDecimals={false}
          tick={{ fontSize: 12, fill: chartTokens.muted }}
          axisLine={{ stroke: chartTokens.border }}
        />
        <Line
          type="monotone"
          dataKey="gameCount"
          stroke={CHART_COLORS[0]}
          strokeWidth={2}
          dot={false}
        />
        <Tooltip
          contentStyle={{
            background: chartTokens.surface,
            border: `1px solid ${chartTokens.border}`,
            color: chartTokens.foreground,
          }}
          formatter={(value) => [`${Number(value)} games`, "Games"]}
          labelFormatter={(label) => `Week of ${String(label)}`}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
