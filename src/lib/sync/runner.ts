/**
 * 自动同步：拉取最新开奖 → 入库 → 对所有启用守号做命中结算 → 写 hit_records
 *
 * 同步策略：
 * 1. 历史回填（一次性）：首次启动 / 库里为空时，分页拉取 2003 年至今所有期号入库。
 *    回填完成后写入 meta: history_backfilled=1，下次不再回填。
 * 2. 增量同步（定时）：进程内每 30 分钟拉取最近 20 期（增量，按 code 主键 upsert）。
 * 3. 命中结算：每条入库的开奖都会和所有 active=1 且 buy_enabled=1 的守号核对。
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

/** 启动时异步触发一次（best-effort）
 *  1. 库里为空：先做历史回填（拉全量历史期），回填完后同步一遍命中
 *  2. 库里已有数据：只做一次增量同步
 *  回填过的不再回填，标志写入 app_meta.history_backfilled
 */
export function ensureLatestSeed(): void {
  void (async () => {
    try {
      const { getMeta } = await import("../db");
      const backfilled = getMeta("history_backfilled") === "1";
      const haveAny = listDraws(1).length > 0;
      if (!backfilled && !haveAny) {
        console.log("[sync] 历史回填开始...");
        const r = await backfillHistory();
        console.log(`[sync] 历史回填完成: 拉取 ${r.fetched} 期，入库 ${r.saved} 期`);
        // 回填完成后立即和现有守号核对一次
        await settleAllBets();
      } else {
        await syncLatest();
      }
    } catch (e) {
      console.error("[ensureLatestSeed] failed:", e);
    }
  })();
}

/**
 * 历史回填：分页拉取所有期号入库
 * 中彩网接口不返回总数，但 pageSize=30 的接口连续翻页直到返回 < 30 即结束
 * 双色球 2003 年至今约 3600+ 期，按 30/页约 120 页
 * 单页失败不中断整体流程，跳过继续下一页
 */
export async function backfillHistory(): Promise<{ fetched: number; saved: number; pages: number; errors: string[] }> {
  const report = { fetched: 0, saved: 0, pages: 0, errors: [] as string[] };
  const pageSize = 30;
  let page = 1;
  const maxPages = 200; // 安全上限（约 6000 期，远超历史总数）

  while (page <= maxPages) {
    let rows;
    try {
      const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&pageNo=${page}&pageSize=${pageSize}`;
      const headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36",
        Referer: "https://www.cwl.gov.cn/",
        Accept: "application/json, text/plain, */*",
      };
      const r = await fetch(url, { headers, cache: "no-store" });
      if (!r.ok) {
        report.errors.push(`page ${page} http ${r.status}`);
        page++;
        continue;
      }
      const j = (await r.json()) as { state: number; message?: string; result?: any[] };
      if (j.state !== 0 || !j.result) {
        report.errors.push(`page ${page} state=${j.state} ${j.message ?? ""}`);
        page++;
        continue;
      }
      rows = j.result;
    } catch (e: any) {
      report.errors.push(`page ${page}: ${e?.message ?? e}`);
      page++;
      continue;
    }

    report.pages++;
    // 接口默认升序（旧→新），保留原序以便断点续拉时去重
    for (const raw of rows) {
      try {
        const parsed = parseDrawRow(raw);
        // 检查是否已存在，存在则跳过（支持断点续拉）
        if (getDraw(parsed.code)) continue;
        upsertDraw(parsed as any);
        report.saved++;
      } catch (e: any) {
        report.errors.push(`page ${page} ${raw?.code}: ${e?.message ?? e}`);
      }
    }
    report.fetched += rows.length;

    if (rows.length < pageSize) break; // 最后一页
    page++;

    // 翻页间加一点间隔，避免被反爬
    await sleep(150);
  }

  setMeta("history_backfilled", "1");
  setMeta("last_backfill_at", new Date().toISOString());
  return report;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * 对所有启用守号、按当前 start_code 重新结算库内全部历史开奖
 * 用于：历史回填后批量核对、用户改 start_code 后追溯
 */
export function settleAllBets(): Promise<{ bet: number; recalc: number }> {
  return Promise.resolve().then(() => {
    const bets = listBets(true); // 只处理 active=1
    let totalRecalc = 0;
    for (const b of bets) {
      const r = resyncBet(b.id);
      totalRecalc += r.recalc;
    }
    return { bet: bets.length, recalc: totalRecalc };
  });
}

/**
 * 进程内定时器：每 30 分钟拉一次最新开奖
 * 模块级单例，多次 import 只启动一次
 */
let _schedulerStarted = false;
const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 分钟

export function startScheduler(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;
  console.log(`[sync] 定时器已启动：每 ${SYNC_INTERVAL_MS / 60000} 分钟拉取一次最新开奖`);

  // 延迟 5 秒首次启动，避免和 ensureLatestSeed 撞车
  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, SYNC_INTERVAL_MS);
  }, 5000);
}

async function tick(): Promise<void> {
  try {
    const r = await syncLatest();
    if (r.saved > 0) {
      console.log(`[sync] 定时同步完成: 拉取 ${r.fetched} 期，新增/更新 ${r.saved} 期`);
    } else {
      console.log(`[sync] 定时同步完成: 无新数据`);
    }
  } catch (e: any) {
    console.error("[sync] 定时同步失败:", e?.message ?? e);
  }
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
