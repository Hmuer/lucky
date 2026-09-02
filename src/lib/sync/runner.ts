/**
 * 自动同步：拉取最新开奖 → 入库 → 对所有启用守号做命中结算 → 写 hit_records
 */

import { fetchLatestDraws, parseDrawRow } from "../crawler/cwl";
import { getDraw, listBets, setMeta, upsertDraw, upsertHitRecord } from "../db";
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
        if (!b.buy_enabled) continue;
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
      if (!b.buy_enabled) continue;
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
