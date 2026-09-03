import { StatsCharts } from "./charts";
import { listAllHits, listBets, listDraws, listHitsByBet } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";

function fmtYuan(cents: number) {
  return (cents / 100).toLocaleString("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });
}

type TierCounts = { 1: number; 2: number; 3: number; 4: number; 5: number; 6: number };
const ZERO_TIER: TierCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

interface BetStatRow {
  bet_id: number;
  name: string;
  type: string;
  periods: number;
  wins_count: number;
  cost: number;
  win_amount: number;
  profit: number;
  best_win: number;
  tier_counts: TierCounts;
}

function buildBetStats(): BetStatRow[] {
  const bets = listBets(true); // 只统计启用守号
  return bets.map((b) => {
    const hits = listHitsByBet(b.id!);
    const tier_counts: TierCounts = { ...ZERO_TIER };
    let cost = 0;
    let win = 0;
    let winsCount = 0;
    let bestWin = 0;
    for (const h of hits) {
      cost += h.cost;
      win += h.win_amount;
      if (h.win_amount > 0) {
        winsCount++;
        if (h.win_amount > bestWin) bestWin = h.win_amount;
      }
      try {
        const bd = JSON.parse(h.breakdown);
        for (const e of bd) {
          if (e.tier >= 1 && e.tier <= 6) {
            tier_counts[e.tier as 1 | 2 | 3 | 4 | 5 | 6] += e.count || 0;
          }
        }
      } catch {}
    }
    return {
      bet_id: b.id!,
      name: b.name,
      type: b.type,
      periods: hits.length,
      wins_count: winsCount,
      cost,
      win_amount: win,
      profit: win - cost,
      best_win: bestWin,
      tier_counts,
    };
  });
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

  const betStats = buildBetStats().sort((a, b) => {
    // 按最高奖级命中次数降序，再按盈亏降序
    const tierRankA = a.tier_counts[1] * 1e6 + a.tier_counts[2] * 1e4 + a.tier_counts[3] * 100 + a.tier_counts[4];
    const tierRankB = b.tier_counts[1] * 1e6 + b.tier_counts[2] * 1e4 + b.tier_counts[3] * 100 + b.tier_counts[4];
    if (tierRankA !== tierRankB) return tierRankB - tierRankA;
    return b.profit - a.profit;
  });

  const tierTotals: TierCounts = betStats.reduce(
    (acc, s) => {
      acc[1] += s.tier_counts[1];
      acc[2] += s.tier_counts[2];
      acc[3] += s.tier_counts[3];
      acc[4] += s.tier_counts[4];
      acc[5] += s.tier_counts[5];
      acc[6] += s.tier_counts[6];
      return acc;
    },
    { ...ZERO_TIER },
  );

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

      <div className="card p-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold">各守号中奖统计</h2>
          <div className="text-xs text-ink-100">
            合计：
            <TierSumCell counts={tierTotals} />
          </div>
        </div>
        {betStats.length === 0 ? (
          <div className="text-sm text-ink-100">还没有守号，请先到"守号"页添加。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>守号</th>
                  <th>类型</th>
                  <th>参与期数</th>
                  <th title="一等奖">一等</th>
                  <th title="二等奖">二等</th>
                  <th title="三等奖">三等</th>
                  <th title="四等奖">四等</th>
                  <th title="五等奖">五等</th>
                  <th title="六等奖">六等</th>
                  <th>中奖期数</th>
                  <th>累计花费</th>
                  <th>累计中奖</th>
                  <th>盈亏</th>
                  <th>单期最高</th>
                </tr>
              </thead>
              <tbody>
                {betStats.map((s) => (
                  <tr key={s.bet_id}>
                    <td className="font-medium">{s.name}</td>
                    <td>{s.type === "single" ? "单式" : s.type === "complex" ? "复式" : "胆拖"}</td>
                    <td className="font-mono">{s.periods}</td>
                    <td><TierCell tier={1} count={s.tier_counts[1]} /></td>
                    <td><TierCell tier={2} count={s.tier_counts[2]} /></td>
                    <td><TierCell tier={3} count={s.tier_counts[3]} /></td>
                    <td><TierCell tier={4} count={s.tier_counts[4]} /></td>
                    <td><TierCell tier={5} count={s.tier_counts[5]} /></td>
                    <td><TierCell tier={6} count={s.tier_counts[6]} /></td>
                    <td className="font-mono">{s.wins_count}</td>
                    <td className="font-mono">{fmtYuan(s.cost)}</td>
                    <td className="font-mono text-emerald-400">{fmtYuan(s.win_amount)}</td>
                    <td className={`font-mono ${s.profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtYuan(s.profit)}</td>
                    <td className="font-mono">{s.best_win > 0 ? fmtYuan(s.best_win) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const TIER_STYLE: Record<1 | 2 | 3 | 4 | 5 | 6, { on: string; off: string; label: string }> = {
  1: { on: "bg-rose-500/20 text-rose-300 border-rose-500/40", off: "text-ink-200", label: "一" },
  2: { on: "bg-orange-500/20 text-orange-300 border-orange-500/40", off: "text-ink-200", label: "二" },
  3: { on: "bg-amber-500/20 text-amber-300 border-amber-500/40", off: "text-ink-200", label: "三" },
  4: { on: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", off: "text-ink-200", label: "四" },
  5: { on: "bg-sky-500/20 text-sky-300 border-sky-500/40", off: "text-ink-200", label: "五" },
  6: { on: "bg-teal-500/20 text-teal-300 border-teal-500/40", off: "text-ink-200", label: "六" },
};

function TierCell({ tier, count }: { tier: 1 | 2 | 3 | 4 | 5 | 6; count: number }) {
  if (!count) {
    return <span className={`font-mono text-xs ${TIER_STYLE[tier].off}`}>0</span>;
  }
  return (
    <span className={`inline-block min-w-[36px] text-center px-2 py-0.5 rounded border font-mono text-xs font-semibold ${TIER_STYLE[tier].on}`}>
      ×{count}
    </span>
  );
}

function TierSumCell({ counts }: { counts: TierCounts }) {
  const tiers: (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6];
  return (
    <span className="inline-flex items-center gap-1 ml-2">
      {tiers.map((t) => {
        const c = counts[t];
        if (!c) return <span key={t} className="font-mono text-xs text-ink-200">{TIER_STYLE[t].label}:0</span>;
        return (
          <span key={t} className={`px-1.5 py-0.5 rounded border font-mono text-[11px] font-semibold ${TIER_STYLE[t].on}`}>
            {TIER_STYLE[t].label}×{c}
          </span>
        );
      })}
    </span>
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
