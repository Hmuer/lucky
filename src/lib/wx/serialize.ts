import type { BetRow, DrawRow, HitRow } from "../db";

/** 金额单位：分（与数据库一致）；开奖公告的奖池/销售额/一二等单注金额单位为元 */
export function betJson(b: BetRow) {
  return {
    id: b.id,
    name: b.name,
    type: b.type,
    payload: JSON.parse(b.payload),
    unitPrice: b.unit_price,
    buyEnabled: !!b.buy_enabled,
    active: !!b.active,
    startCode: b.start_code,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

export function hitJson(h: HitRow, bet?: BetRow) {
  const raw = JSON.parse(h.breakdown || "{}") as Record<string, { count?: number }>;
  const tierCounts: Record<string, number> = {};
  for (const [tier, value] of Object.entries(raw)) {
    if (value?.count) tierCounts[tier] = value.count;
  }
  return {
    betId: h.bet_id,
    name: bet?.name ?? "",
    type: bet?.type ?? "",
    units: h.units,
    cost: h.cost,
    tierCounts,
    winAmount: h.win_amount,
    profit: h.win_amount - h.cost,
  };
}

export function drawJson(d: DrawRow) {
  return {
    code: d.code,
    date: d.date,
    week: d.week,
    red: d.red.split(",").map((x) => parseInt(x, 10)),
    blue: parseInt(d.blue, 10),
    sales: d.sales,
    poolmoney: d.poolmoney,
    firstPrize: { count: d.prize1_count, amount: d.prize1_amount },
    secondPrize: { count: d.prize2_count, amount: d.prize2_amount },
  };
}
