/**
 * 双色球官方奖级表（中国福利彩票双色球游戏规则）
 * 一/二等单注金额为浮动，由开奖公告给出；三等及以下为固定金额。
 */

import type { PrizeTier, BetHit } from "./types";

export interface PrizeTableEntry {
  tier: PrizeTier;
  redHit: number;
  blueHit: 0 | 1;
  /** 默认固定金额（用于无浮动数据时）；一/二等无固定值 */
  fixedAmount?: number;
  description: string;
}

export const PRIZE_TABLE: PrizeTableEntry[] = [
  { tier: 1, redHit: 6, blueHit: 1, description: "一等奖 6+1" },
  { tier: 2, redHit: 6, blueHit: 0, description: "二等奖 6+0" },
  { tier: 3, redHit: 5, blueHit: 1, fixedAmount: 3000, description: "三等奖 5+1" },
  { tier: 4, redHit: 5, blueHit: 0, fixedAmount: 200, description: "四等奖 5+0" },
  { tier: 4, redHit: 4, blueHit: 1, fixedAmount: 200, description: "四等奖 4+1" },
  { tier: 5, redHit: 4, blueHit: 0, fixedAmount: 10, description: "五等奖 4+0" },
  { tier: 5, redHit: 3, blueHit: 1, fixedAmount: 10, description: "五等奖 3+1" },
  { tier: 6, redHit: 2, blueHit: 1, fixedAmount: 5, description: "六等奖 2+1" },
  { tier: 6, redHit: 1, blueHit: 1, fixedAmount: 5, description: "六等奖 1+1" },
  { tier: 6, redHit: 0, blueHit: 1, fixedAmount: 5, description: "六等奖 0+1" },
];

/** 给定一注与开奖，判定奖级（0 = 未中奖） */
export function judgeTicket(red: number[], blue: number, drawRed: number[], drawBlue: number): BetHit {
  const drawRedSet = new Set(drawRed);
  const drawBlueSet = new Set([drawBlue]);
  let redHit = 0;
  for (const r of red) if (drawRedSet.has(r)) redHit++;
  const blueHit = drawBlueSet.has(blue) ? 1 : 0;
  for (const entry of PRIZE_TABLE) {
    if (entry.redHit === redHit && entry.blueHit === blueHit) {
      return { redHit, blueHit, tier: entry.tier };
    }
  }
  return { redHit, blueHit, tier: 0 };
}
