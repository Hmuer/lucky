import { listBets, listHitsByBet } from "@/lib/db";
import { requireUid } from "@/lib/wx/auth";
import { ok } from "@/lib/wx/response";

export const dynamic = "force-dynamic";

type TierCounts = { 1: number; 2: number; 3: number; 4: number; 5: number; 6: number };
const ZERO_TIER: TierCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

/** GET /api/wx/stats — 当前用户守号中奖统计（金额单位：分） */
export async function GET(req: Request) {
  const auth = await requireUid(req);
  if (typeof auth !== "number") return auth;

  const bets = await listBets(true, auth);
  const rows = await Promise.all(
    bets.map(async (b) => {
      const hits = await listHitsByBet(b.id, auth);
      const tierCounts: TierCounts = { ...ZERO_TIER };
      let cost = 0;
      let winAmount = 0;
      let winsCount = 0;
      let bestWin = 0;

      for (const h of hits) {
        cost += h.cost;
        winAmount += h.win_amount;
        if (h.win_amount > 0) {
          winsCount++;
          if (h.win_amount > bestWin) bestWin = h.win_amount;
        }
        try {
          const bd = JSON.parse(h.breakdown) as Record<string, { count?: number }>;
          for (const [k, v] of Object.entries(bd)) {
            const tier = parseInt(k, 10);
            if (tier >= 1 && tier <= 6) {
              tierCounts[tier as 1 | 2 | 3 | 4 | 5 | 6] += v?.count || 0;
            }
          }
        } catch {}
      }

      return {
        betId: b.id,
        name: b.name,
        type: b.type,
        periods: hits.length,
        winsCount,
        cost,
        winAmount,
        profit: winAmount - cost,
        bestWin,
        tierCounts,
      };
    })
  );

  const summary = rows.reduce(
    (acc, r) => {
      acc.periods += r.periods;
      acc.winsCount += r.winsCount;
      acc.cost += r.cost;
      acc.winAmount += r.winAmount;
      acc.profit += r.profit;
      for (const t of [1, 2, 3, 4, 5, 6] as const) acc.tierCounts[t] += r.tierCounts[t];
      return acc;
    },
    {
      periods: 0,
      winsCount: 0,
      cost: 0,
      winAmount: 0,
      profit: 0,
      tierCounts: { ...ZERO_TIER },
    }
  );

  return ok({ summary, bets: rows });
}
