"use client";
import { useMemo, useState } from "react";
import { StatsCharts } from "./charts";

export interface SeriesPoint {
  code: string;
  date: string;
  cost: number;
  win: number;
  cumCost: number;
  cumWin: number;
  profit: number;
}

interface RangeOption {
  key: string;
  label: string;
  days: number | null; // null = 全部
}

const RANGES: RangeOption[] = [
  { key: "1w", label: "最近 1 周", days: 7 },
  { key: "1m", label: "最近 1 月", days: 30 },
  { key: "3m", label: "最近 3 月", days: 90 },
  { key: "6m", label: "最近半年", days: 180 },
  { key: "1y", label: "最近 1 年", days: 365 },
  { key: "all", label: "全部", days: null },
];

function fmtYuan(cents: number) {
  return (cents / 100).toLocaleString("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });
}

/** 根据 series 和 rangeKey 计算窗口内的累计汇总 */
function summarize(series: SeriesPoint[], rangeKey: string) {
  const opt = RANGES.find((r) => r.key === rangeKey) ?? RANGES[2];
  if (!series.length) {
    return { draws: 0, cost: 0, win: 0, profit: 0, roi: 0 };
  }
  let picked = series;
  if (opt.days != null) {
    const last = series[series.length - 1];
    const lastDate = parseDate(last.date);
    if (lastDate) {
      const cutoff = new Date(lastDate.getTime() - opt.days * 24 * 3600 * 1000);
      picked = series.filter((p) => {
        const d = parseDate(p.date);
        return d ? d >= cutoff : true;
      });
    }
  }
  const cost = picked.reduce((s, p) => s + p.cost, 0);
  const win = picked.reduce((s, p) => s + p.win, 0);
  return {
    draws: picked.length,
    cost,
    win,
    profit: win - cost,
    roi: cost ? (win - cost) / cost : 0,
  };
}

/** 重算窗口内的累计字段（让图表从 0 开始累加，更符合"窗口内累计"语义） */
function filterForChart(series: SeriesPoint[], rangeKey: string): SeriesPoint[] {
  const opt = RANGES.find((r) => r.key === rangeKey) ?? RANGES[2];
  if (!series.length) return [];
  if (opt.days == null) return series;
  const last = series[series.length - 1];
  const lastDate = parseDate(last.date);
  if (!lastDate) return series;
  const cutoff = new Date(lastDate.getTime() - opt.days * 24 * 3600 * 1000);
  const sliced = series.filter((p) => {
    const d = parseDate(p.date);
    return d ? d >= cutoff : true;
  });
  let cumCost = 0;
  let cumWin = 0;
  return sliced.map((p) => {
    cumCost += p.cost;
    cumWin += p.win;
    return { ...p, cumCost, cumWin, profit: cumWin - cumCost };
  });
}

function parseDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(s + "T00:00:00");
}

export function StatsChartsWithRange({ series }: { series: SeriesPoint[] }) {
  const [rangeKey, setRangeKey] = useState<string>("3m");

  const summary = useMemo(() => summarize(series, rangeKey), [series, rangeKey]);
  const filtered = useMemo(() => filterForChart(series, rangeKey), [series, rangeKey]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Stat label="参与期数" value={summary.draws.toString()} />
        <Stat label="累计花费" value={fmtYuan(summary.cost)} />
        <Stat label="累计中奖" value={fmtYuan(summary.win)} />
        <Stat label="盈亏" value={fmtYuan(summary.profit)} highlight={summary.profit >= 0 ? "pos" : "neg"} />
        <Stat label="回本率" value={(summary.roi * 100).toFixed(1) + "%"} highlight={summary.profit >= 0 ? "pos" : "neg"} />
      </div>

      <div className="border-t border-ink-300 pt-4">
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-xs text-ink-100 mr-1">走势时间范围：</span>
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRangeKey(r.key)}
              className={`px-2.5 py-1 rounded-md border text-xs transition ${
                rangeKey === r.key
                  ? "bg-ink-50 text-ink-900 border-ink-50"
                  : "bg-transparent text-ink-100 border-ink-300 hover:bg-ink-500"
              }`}
            >
              {r.label}
            </button>
          ))}
          <span className="text-xs text-ink-200 ml-2">
            {filtered.length > 0 ? `共 ${filtered.length} 期` : "无数据"}
          </span>
        </div>
        <StatsCharts series={filtered} />
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: "pos" | "neg" }) {
  return (
    <div>
      <div className="text-xs text-ink-100">{label}</div>
      <div className={`font-mono text-xl ${highlight === "pos" ? "text-emerald-400" : highlight === "neg" ? "text-rose-400" : ""}`}>
        {value}
      </div>
    </div>
  );
}
