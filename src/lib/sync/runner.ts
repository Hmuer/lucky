/**
 * 自动同步：拉取最新开奖 → 入库 → 对所有启用守号做命中结算 → 写 hit_records
 */

import { fetchLatestDraws, parseDrawRow } from "../crawler/cwl";
import { db, getDraw, listBets, listDraws, setMeta, upsertDraw, upsertHitRecord } from "../db";
import type { DrawRow } from "../db";
import { settle } from "../engine/settle";
import type { PrizeTier } from "../engine/types";
import { rowToBet } from "./adapter";

export interface SyncReport {
  fetched: number;
  saved: number;
  hits: number;
  errors: string[];
}

/**
 * 判断该守号是否在当前期参与核对
 * - 停用（active=0）：完全不参与
 * - 该期不购买（buy_enabled=0）：跳过当期
 */
function shouldSettle(b: { active: number; buy_enabled: number }): boolean {
  if (!b.active) return false;
  if (!b.buy_enabled) return false;
  return true;
}

function prizeAmountsFrom(drawRow: DrawRow): Partial<Record<PrizeTier, number>> {
  return {
    1: drawRow.prize1_amount ?? undefined,
    2: drawRow.prize2_amount ?? undefined,
    3: drawRow.prize3_amount ?? undefined,
    4: drawRow.prize4_amount ?? undefined,
    5: drawRow.prize5_amount ?? undefined,
    6: drawRow.prize6_amount ?? undefined,
  } as any;
}

export async function syncLatest(): Promise<SyncReport> {
  const report: SyncReport = { fetched: 0, saved: 0, hits: 0, errors: [] };
  let rows;
  try {
    rows = await fetchLatestDraws(20);
  } catch (e: any) {
    report.errors.push(`fetch failed: ${e?.message ?? e}`);
    return report;
  }
  report.fetched = rows.length;
  const bets = listBets(true);

  for (const r of rows) {
    try {
      const parsed = parseDrawRow(r);
      upsertDraw(parsed as any);
      report.saved++;

      const drawRow = getDraw(parsed.code) as DrawRow;
      const draw = {
        red: drawRow.red.split(",").map((x) => parseInt(x, 10)),
        blue: parseInt(drawRow.blue, 10),
      };
      const prizeAmounts = prizeAmountsFrom(drawRow);

      for (const b of bets) {
        if (!shouldSettle(b)) continue;
        // start_code 过滤：只在开始期及之后才结算
        if (b.start_code && parsed.code < b.start_code) continue;
        const bet = rowToBet(b);
        const result = settle(bet, draw, { prizeAmounts });
        const cost = result.units * b.unit_price;
        upsertHitRecord({
          draw_code: parsed.code,
          bet_id: b.id,
          units: result.units,
          cost,
          win_amount: result.totalAmount * 100, // engine 用「元」，入库转分
          breakdown: JSON.stringify(result.tierBreakdown),
        });
        report.hits++;
      }
    } catch (e: any) {
      report.errors.push(`draw ${r.code}: ${e?.message ?? e}`);
    }
  }
  setMeta("last_sync_at", new Date().toISOString());
  return report;
}

export async function syncOne(code: string): Promise<SyncReport> {
  const report: SyncReport = { fetched: 0, saved: 0, hits: 0, errors: [] };
  try {
    const all = await fetchLatestDraws(50);
    const r = all.find((x) => x.code === code);
    if (!r) {
      report.errors.push(`not found ${code}`);
      return report;
    }
    report.fetched = 1;
    const parsed = parseDrawRow(r);
    upsertDraw(parsed as any);
    report.saved++;
    const drawRow = getDraw(parsed.code) as DrawRow;
    const draw = {
      red: drawRow.red.split(",").map((x) => parseInt(x, 10)),
      blue: parseInt(drawRow.blue, 10),
    };
    const prizeAmounts = prizeAmountsFrom(drawRow);
    const bets = listBets(true);
    for (const b of bets) {
      if (!shouldSettle(b)) continue;
      if (b.start_code && parsed.code < b.start_code) continue;
      const bet = rowToBet(b);
      const result = settle(bet, draw, { prizeAmounts });
      upsertHitRecord({
        draw_code: parsed.code,
        bet_id: b.id,
        units: result.units,
        cost: result.units * b.unit_price,
        win_amount: result.totalAmount * 100,
        breakdown: JSON.stringify(result.tierBreakdown),
      });
      report.hits++;
    }
    setMeta("last_sync_at", new Date().toISOString());
  } catch (e: any) {
    report.errors.push(e?.message ?? String(e));
  }
  return report;
}

/** 启动时异步触发一次（best-effort） */
export function ensureLatestSeed(): void {
  void (async () => {
    try {
      await syncLatest();
    } catch (e) {
      console.error("[ensureLatestSeed] failed:", e);
    }
  })();
}

/**
 * 对单个守号按当前 start_code 重新结算所有已入库的开奖
 * 用于：新增守号（默认 start_code = 当前最新期，追溯从该期开始）、
 *       用户修改了 start_code 想追溯历史
 */
export function resyncBet(betId: number): { recalc: number; deleted: number } {
  const bet = db().prepare(`SELECT * FROM bets WHERE id = ?`).get(betId) as any;
  if (!bet) throw new Error(`bet ${betId} not found`);
  // 先清掉该守号的全部历史记录，再按 start_code 重算
  const del = db().prepare(`DELETE FROM hit_records WHERE bet_id = ?`).run(betId);
  const draws = listDraws(10000);
  let recalc = 0;
  const startCode = bet.start_code ?? "0000000";
  for (const drawRow of draws) {
    if (drawRow.code < startCode) continue;
    if (!shouldSettle(bet)) continue;
    const draw = {
      red: drawRow.red.split(",").map((x) => parseInt(x, 10)),
      blue: parseInt(drawRow.blue, 10),
    };
    const prizeAmounts = prizeAmountsFrom(drawRow);
    const engineBet = rowToBet(bet);
    const result = settle(engineBet, draw, { prizeAmounts });
    upsertHitRecord({
      draw_code: drawRow.code,
      bet_id: betId,
      units: result.units,
      cost: result.units * bet.unit_price,
      win_amount: result.totalAmount * 100,
      breakdown: JSON.stringify(result.tierBreakdown),
    });
    recalc++;
  }
  return { recalc, deleted: del.changes };
}

/** 计算下一个预期期号 = 最新期号 + 1（按年递增 + 期内顺序） */
export function nextDrawCode(): string | null {
  const latest = db().prepare(`SELECT code FROM draws ORDER BY date DESC, code DESC LIMIT 1`).get() as { code: string } | undefined;
  if (!latest) return null;
  const year = parseInt(latest.code.slice(0, 4), 10);
  const seq = parseInt(latest.code.slice(4), 10);
  // 年内最大期号双色球约 156
  if (seq >= 156) return `${year + 1}001`;
  return `${year}${String(seq + 1).padStart(3, "0")}`;
}
