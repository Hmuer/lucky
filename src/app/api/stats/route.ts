import { NextResponse } from "next/server";
import { listAllHits, listDraws } from "@/lib/db";

/** 聚合统计：累计成本 / 累计中奖 / 盈亏 / 回本率 + 走势 */
export async function GET() {
  const hits = listAllHits();
  const draws = listDraws(500);

  // 按 draw_code 排序
  const drawMap = new Map(draws.map((d) => [d.code, d]));
  const orderedCodes = Array.from(new Set(hits.map((h) => h.draw_code)))
    .sort((a, b) => (drawMap.get(a)?.date ?? a).localeCompare(drawMap.get(b)?.date ?? b));

  let cumCost = 0;
  let cumWin = 0;
  const series: { code: string; date: string; cost: number; win: number; cumCost: number; cumWin: number; profit: number }[] = [];

  for (const code of orderedCodes) {
    const draw = drawMap.get(code);
    const rowHits = hits.filter((h) => h.draw_code === code);
    const cost = rowHits.reduce((s, h) => s + h.cost, 0);
    const win = rowHits.reduce((s, h) => s + h.win_amount, 0);
    cumCost += cost;
    cumWin += win;
    series.push({
      code,
      date: draw?.date ?? code,
      cost,
      win,
      cumCost,
      cumWin,
      profit: cumWin - cumCost,
    });
  }

  const summary = {
    draws: series.length,
    cost: cumCost,
    win: cumWin,
    profit: cumWin - cumCost,
    roi: cumCost ? (cumWin - cumCost) / cumCost : 0,
  };

  return NextResponse.json({ summary, series });
}
