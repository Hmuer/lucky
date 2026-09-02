/**
 * 把投注展开为单注数组
 * - 单式：1 注
 * - 复式：C(红数,6) × 蓝数 注
 * - 胆拖：C(红拖数, 6-红胆数) × 蓝数 注
 */

import { combinations, comb } from "./combinations";
import type { Bet, SingleBet } from "./types";

export function expandToTickets(bet: Bet): SingleBet[] {
  switch (bet.type) {
    case "single":
      return [{ type: "single", red: [...bet.red].sort((a, b) => a - b), blue: [bet.blue[0]] }];
    case "complex": {
      const redSubsets = combinations([...bet.red].sort((a, b) => a - b), 6);
      const tickets: SingleBet[] = [];
      for (const sub of redSubsets) {
        for (const b of bet.blue) tickets.push({ type: "single", red: sub, blue: [b] });
      }
      return tickets;
    }
    case "danTuo": {
      const need = 6 - bet.redDan.length;
      if (need <= 0) throw new Error("胆码数必须小于 6");
      const tuoSubsets = combinations([...bet.redTuo].sort((a, b) => a - b), need);
      const tickets: SingleBet[] = [];
      for (const tuo of tuoSubsets) {
        for (const b of bet.blue) {
          tickets.push({ type: "single", red: [...bet.redDan, ...tuo].sort((a, b) => a - b), blue: [b] });
        }
      }
      return tickets;
    }
  }
}

/** 仅返回总注数，不展开（性能版） */
export function countUnits(bet: Bet): number {
  switch (bet.type) {
    case "single":
      return 1;
    case "complex":
      return comb(bet.red.length, 6) * bet.blue.length;
    case "danTuo":
      return comb(bet.redTuo.length, 6 - bet.redDan.length) * bet.blue.length;
  }
}
