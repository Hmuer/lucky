"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface Point {
  code: string;
  date: string;
  cost: number;
  win: number;
  cumCost: number;
  cumWin: number;
  profit: number;
}

export function StatsCharts({ series }: { series: Point[] }) {
  const data = series.map((s) => ({
    code: s.code,
    label: s.date.slice(5),
    累计花费: s.cumCost / 100,
    累计中奖: s.cumWin / 100,
    累计盈亏: s.profit / 100,
  }));

  if (data.length === 0) {
    return <div className="text-sm text-ink-100">还没有数据，先到首页同步几期开奖并核对。</div>;
  }

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3630" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a09b8c" }} stroke="#3a3630" />
          <YAxis tick={{ fontSize: 11, fill: "#a09b8c" }} stroke="#3a3630" />
          <Tooltip
            contentStyle={{ background: "#2a2724", border: "1px solid #3a3630", borderRadius: 8, fontSize: 12, color: "#e8e3d8" }}
            labelStyle={{ color: "#a09b8c" }}
            itemStyle={{ color: "#e8e3d8" }}
            labelFormatter={(v, p: any) => p?.[0]?.payload?.code ?? v}
            formatter={(v: number) => `¥ ${v.toLocaleString()}`}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#a09b8c" }} />
          <Line type="monotone" dataKey="累计花费" stroke="#a09b8c" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="累计中奖" stroke="#5a9ae8" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="累计盈亏" stroke="#e87c75" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
