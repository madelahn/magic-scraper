"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { CHART_COLORS } from "../page";

interface ChartTokens {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
}

interface PlayerWinRateDatum {
  player: string;
  wins: number;
  played: number;
  rate: number;
}

interface Props {
  data: PlayerWinRateDatum[];
  chartTokens: ChartTokens;
}

export default function PlayerWinRateBar({ data, chartTokens }: Props) {
  const coloredData = data.map((d, i) => ({
    ...d,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const height = Math.max(300, data.length * 28 + 60);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={coloredData}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chartTokens.border}
          horizontal={false}
        />
        <XAxis
          type="number"
          domain={[0, 1]}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          tick={{ fontSize: 12, fill: chartTokens.muted }}
          axisLine={{ stroke: chartTokens.border }}
        />
        <YAxis
          type="category"
          dataKey="player"
          width={100}
          tick={{ fontSize: 12, fill: chartTokens.muted }}
          axisLine={{ stroke: chartTokens.border }}
          tickFormatter={(v: string) =>
            v.length > 14 ? v.slice(0, 14) + "..." : v
          }
        />
        <Bar dataKey="rate" />
        <Tooltip
          formatter={(value, _name, props) => {
            const v = Number(value);
            const p = (props as unknown as { payload: PlayerWinRateDatum }).payload;
            return [`${Math.round(v * 100)}% (${p.wins}W / ${p.played}G)`, "Win rate"];
          }}
          contentStyle={{
            background: chartTokens.surface,
            border: `1px solid ${chartTokens.border}`,
            color: chartTokens.foreground,
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
