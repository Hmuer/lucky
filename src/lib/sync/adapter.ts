/**
 * 守号（DB row） ↔ 引擎 Bet 适配 + 合法性校验
 */

import type { Bet } from "../engine/types";
import type { BetRow } from "../db";

export function rowToBet(row: BetRow): Bet {
  const p = JSON.parse(row.payload) as any;
  switch (row.type) {
    case "single":
      return { type: "single", red: p.red, blue: p.blue };
    case "complex":
      return { type: "complex", red: p.red, blue: p.blue };
    case "danTuo":
      return { type: "danTuo", redDan: p.redDan, redTuo: p.redTuo, blue: p.blue };
    default:
      throw new Error(`unknown bet type: ${row.type}`);
  }
}

export function validateBet(b: Bet): string | null {
  const inRange = (xs: number[], lo: number, hi: number) => xs.every((x) => Number.isInteger(x) && x >= lo && x <= hi);
  switch (b.type) {
    case "single":
      if (b.red.length !== 6) return "单式红球必须 6 个";
      if (b.blue.length !== 1) return "单式蓝球必须 1 个";
      if (!inRange(b.red, 1, 33)) return "红球范围 1..33";
      if (!inRange(b.blue, 1, 16)) return "蓝球范围 1..16";
      break;
    case "complex":
      if (b.red.length < 6 || b.red.length > 20) return "复式红球 6..20 个（6 红即单式红 + 多蓝复式）";
      if (b.blue.length < 1 || b.blue.length > 16) return "复式蓝球 1..16 个";
      if (!inRange(b.red, 1, 33) || !inRange(b.blue, 1, 16)) return "号码超出范围";
      break;
    case "danTuo": {
      const all = new Set([...b.redDan, ...b.redTuo]);
      if (all.size !== b.redDan.length + b.redTuo.length) return "胆码与拖码不能重叠";
      if (b.redDan.length < 1 || b.redDan.length > 5) return "红胆 1..5 个";
      const need = 6 - b.redDan.length;
      if (b.redTuo.length < need || b.redTuo.length > 29) return `红拖至少 ${need} 个`;
      if (!inRange([...b.redDan, ...b.redTuo], 1, 33) || !inRange(b.blue, 1, 16)) return "号码超出范围";
      break;
    }
  }
  return null;
}

export function normalizeBetPayload(b: Bet): unknown {
  const uniq = (xs: number[]) => Array.from(new Set(xs)).sort((a, b) => a - b);
  switch (b.type) {
    case "single":
      return { red: uniq(b.red), blue: uniq(b.blue) };
    case "complex":
      return { red: uniq(b.red), blue: uniq(b.blue) };
    case "danTuo":
      return { redDan: uniq(b.redDan), redTuo: uniq(b.redTuo), blue: uniq(b.blue) };
  }
}
