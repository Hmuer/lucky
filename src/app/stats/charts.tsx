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
    return <div className="text-sm text-ink-500">还没有数据，先到首页同步几期开奖并核对。</div>;
  }

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eeede8" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: "#fff", border: "1px solid #dcd9cf", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(v, p: any) => p?.[0]?.payload?.code ?? v}
            formatter={(v: number) => `¥ ${v.toLocaleString()}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="累计花费" stroke="#7a7363" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="累计中奖" stroke="#2a72d8" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="累计盈亏" stroke="#d9342b" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
