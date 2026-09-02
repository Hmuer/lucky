import { StatsCharts } from "./charts";
import { listAllHits, listDraws } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";

function fmtYuan(cents: number) {
  return (cents / 100).toLocaleString("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });
}

export default async function StatsPage() {
  noStore();
  const hits = listAllHits();
  const draws = listDraws(500);
  const drawMap = new Map(draws.map((d) => [d.code, d]));

  const orderedCodes = Array.from(new Set(hits.map((h) => h.draw_code)))
    .sort((a, b) => (drawMap.get(a)?.date ?? a).localeCompare(drawMap.get(b)?.date ?? b));

  let cumCost = 0, cumWin = 0;
  const series: { code: string; date: string; cost: number; win: number; cumCost: number; cumWin: number; profit: number }[] = [];
  for (const code of orderedCodes) {
    const draw = drawMap.get(code);
    const rowHits = hits.filter((h) => h.draw_code === code);
    const cost = rowHits.reduce((s, h) => s + h.cost, 0);
    const win = rowHits.reduce((s, h) => s + h.win_amount, 0);
    cumCost += cost;
    cumWin += win;
    series.push({ code, date: draw?.date ?? code, cost, win, cumCost, cumWin, profit: cumWin - cumCost });
  }

  const summary = {
    draws: series.length,
    cost: cumCost,
    win: cumWin,
    profit: cumWin - cumCost,
    roi: cumCost ? (cumWin - cumCost) / cumCost : 0,
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h1 className="text-lg font-semibold">统计</h1>
        <p className="text-sm text-ink-100 mt-1">基于已勾选"每期购买"的守号，按每期实际花费和中奖金额汇总。</p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Stat label="参与期数" value={summary.draws.toString()} />
          <Stat label="累计花费" value={fmtYuan(summary.cost)} />
          <Stat label="累计中奖" value={fmtYuan(summary.win)} />
          <Stat label="盈亏" value={fmtYuan(summary.profit)} highlight={summary.profit >= 0 ? "pos" : "neg"} />
          <Stat label="回本率" value={(summary.roi * 100).toFixed(1) + "%"} highlight={summary.profit >= 0 ? "pos" : "neg"} />
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-3">走势</h2>
        <StatsCharts series={series} />
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: "pos" | "neg" }) {
  return (
    <div>
      <div className="text-xs text-ink-100">{label}</div>
      <div className={`font-mono text-xl ${highlight === "pos" ? "text-emerald-400" : highlight === "neg" ? "text-rose-400" : ""}`}>{value}</div>
    </div>
  );
}
