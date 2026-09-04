"use client";
import { useEffect, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

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

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(640);

  // 用 ResizeObserver 跟踪容器宽度，避免 ResponsiveContainer 在移动端首屏 0 宽度的已知问题
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
  }, []);

  if (data.length === 0) {
    return <div className="text-sm text-ink-100">还没有数据，先到首页同步几期开奖并核对。</div>;
  }

  const height = 320;
  // 移动端额外压一压文字 + 加大左右留白防止 Y 轴文字被裁
  const isMobile = width < 480;
  const xTickFontSize = isMobile ? 9 : 11;
  const yTickFontSize = isMobile ? 9 : 11;
  const margin = isMobile
    ? { top: 8, right: 8, bottom: 0, left: 0 }
    : { top: 10, right: 16, bottom: 0, left: 0 };

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <LineChart
        width={Math.max(280, width)}
        height={height}
        data={data}
        margin={margin}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#3a3630" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: xTickFontSize, fill: "#a09b8c" }}
          stroke="#3a3630"
          interval={isMobile ? Math.ceil(data.length / 6) : Math.ceil(data.length / 10)}
        />
        <YAxis
          tick={{ fontSize: yTickFontSize, fill: "#a09b8c" }}
          stroke="#3a3630"
          width={isMobile ? 36 : 50}
          tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
        />
        <Tooltip
          contentStyle={{ background: "#2a2724", border: "1px solid #3a3630", borderRadius: 8, fontSize: 12, color: "#e8e3d8" }}
          labelStyle={{ color: "#a09b8c" }}
          itemStyle={{ color: "#e8e3d8" }}
          labelFormatter={(v, p: any) => p?.[0]?.payload?.code ?? v}
          formatter={(v: number) => `¥ ${v.toLocaleString()}`}
        />
        <Legend wrapperStyle={{ fontSize: isMobile ? 10 : 12, color: "#a09b8c" }} />
        <Line type="monotone" dataKey="累计花费" stroke="#a09b8c" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="累计中奖" stroke="#5a9ae8" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="累计盈亏" stroke="#e87c75" strokeWidth={2} dot={false} />
      </LineChart>
    </div>
  );
}
