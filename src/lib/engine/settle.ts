/**
 * 投注结算：把投注展开为单注，与开奖比对，按官方奖级表累计奖金
 * 金额来源：
 *  - 优先用 prizeAmounts[tier]（来自开奖公告里的 typemoney）
 *  - 否则回退到奖级固定金额
 */

import { expandToTickets, countUnits } from "./expand";
import { judgeTicket, PRIZE_TABLE } from "./prize";
import type { Bet, BetResult, Draw, PrizeTier, TicketPrize } from "./types";

export interface SettleOptions {
  /** 期号对应的各级单注金额（来自开奖公告 prizegrades）；key=1..6，value=该级单注金额 */
  prizeAmounts?: Partial<Record<PrizeTier, number>>;
}

export function settle(bet: Bet, draw: Draw, opts: SettleOptions = {}): BetResult {
  const tickets = expandToTickets(bet);
  const tierBreakdown: BetResult["tierBreakdown"] = {};
  const hits: TicketPrize[] = [];

  for (const t of tickets) {
    const j = judgeTicket(t.red, t.blue[0], draw.red, draw.blue);
    if (j.tier === 0) continue;
    const entry = PRIZE_TABLE.find((e) => e.redHit === j.redHit && e.blueHit === j.blueHit && e.tier === j.tier)!;
    const amount = opts.prizeAmounts?.[j.tier] ?? entry.fixedAmount ?? 0;
    const cur = tierBreakdown[j.tier] ?? { count: 0, amount: 0, unit: amount };
    cur.count += 1;
    cur.amount += amount;
    tierBreakdown[j.tier] = cur;
    hits.push({ tier: j.tier, redHit: j.redHit, blueHit: j.blueHit, amount });
  }

  const totalAmount = Object.values(tierBreakdown).reduce((s, v) => s + (v?.amount ?? 0), 0);
  return {
    betType: bet.type,
    units: countUnits(bet),
    totalAmount,
    tierBreakdown,
    hits,
  };
}
