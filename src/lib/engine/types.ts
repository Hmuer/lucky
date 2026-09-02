/**
 * 投注类型与引擎类型定义
 * - single: 单式（6 红 + 1 蓝）
 * - complex: 复式（N 红 + M 蓝）
 * - danTuo:  胆拖（红胆 + 红拖 + 蓝）
 */

export type BetType = "single" | "complex" | "danTuo";

export interface SingleBet {
  type: "single";
  red: number[]; // 6 个红球，范围 1..33
  blue: number[]; // 1 个蓝球，范围 1..16
}

export interface ComplexBet {
  type: "complex";
  red: number[]; // 7..20 个红球
  blue: number[]; // 1..16 个蓝球
}

export interface DanTuoBet {
  type: "danTuo";
  redDan: number[]; // 1..5 个红胆
  redTuo: number[]; // 2..29 个红拖（红胆 ∩ 红拖 = ∅，红胆+红拖 ∈ 1..33）
  blue: number[]; // 1..16 个蓝球
}

export type Bet = SingleBet | ComplexBet | DanTuoBet;

export interface Draw {
  red: number[]; // 6 个开奖红球
  blue: number; // 1 个开奖蓝球
}

export type PrizeTier = 1 | 2 | 3 | 4 | 5 | 6;

export interface BetHit {
  redHit: number; // 命中红球数
  blueHit: 0 | 1; // 命中蓝球数
  tier: PrizeTier | 0; // 0 = 未中奖
}

export interface TicketPrize {
  tier: PrizeTier | 0;
  redHit: number;
  blueHit: 0 | 1;
  /** 当期该奖级官方单注金额（浮动奖级也尽量取 typemoney） */
  amount: number;
}

export interface BetResult {
  betType: BetType;
  /** 投注总注数 */
  units: number;
  /** 总奖金 */
  totalAmount: number;
  /** 各级命中注数汇总 */
  tierBreakdown: Partial<Record<PrizeTier, { count: number; amount: number; unit: number }>>;
  /** 命中的所有单注明细（可选，调试/详情用） */
  hits: TicketPrize[];
}
