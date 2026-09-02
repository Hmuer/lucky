import { NextResponse } from "next/server";
import { listBets, listHitsByBet } from "@/lib/db";

/**
 * 统计所有守号的历史中奖情况
 * 输出每个守号的 6 级奖命中次数 + 总花费/中奖/盈亏/参与的期数
 */
export async function GET() {
  const bets = listBets(false);
  const result = bets.map((b) => {
    const hits = listHitsByBet(b.id!);
    // 累加 6 级奖命中注数
    const tierCounts: Record<1 | 2 | 3 | 4 | 5 | 6, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let cost = 0;
    let win = 0;
    let winsCount = 0; // 至少中过一次（注：含六等）
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
            tierCounts[e.tier as 1 | 2 | 3 | 4 | 5 | 6] += e.count || 0;
          }
        }
      } catch {}
    }
    return {
      bet_id: b.id,
      name: b.name,
      type: b.type,
      unit_price: b.unit_price,
      start_code: b.start_code,
      active: b.active,
      buy_enabled: b.buy_enabled,
      periods: hits.length,        // 参与核对的期数
      wins_count: winsCount,        // 中过奖的期数
      cost,                        // 分
      win_amount: win,             // 分
      profit: win - cost,          // 分
      best_win: bestWin,           // 分（单期最大奖金）
      tier_counts: tierCounts,     // 1~6 等各中几注
    };
  });
  return NextResponse.json({ stats: result });
}
