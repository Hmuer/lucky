/**
 * 自动同步：拉取最新开奖 → 只在有新期时入库并结算
 *
 * 成本策略（TDSQL-C 按量付费）：
 * 1. 不再每 30 分钟轮询；只在双色球开奖日（周二/四/日）21:35 检查，
 *    结果未出时最多重试 3 次（每次间隔 30 分钟）。
 * 2. 每次检查先比较库内最新期号；没有新期时只读 1 次、不写任何表。
 * 3. 新期只写这一期：draws upsert + hit_records 批量 upsert，单事务提交。
 * 4. 历史回填只在库为空时执行一次，批量写入。
 */

import { fetchLatestDraws, parseDrawRow } from "../crawler/cwl";
import {
  deleteHitsByBet,
  getBet,
  getMeta,
  latestDraw,
  listBets,
  listDraws,
  listDrawsSince,
  setMeta,
  upsertDraws,
  upsertHitRecords,
  withTransaction,
} from "../db";
import type { BetRow, DrawRow } from "../db";
import { settle } from "../engine/settle";
import type { PrizeTier } from "../engine/types";
import { rowToBet } from "./adapter";

export interface SyncReport {
  fetched: number;
  saved: number;
  hits: number;
  errors: string[];
  skipped: boolean;
}

interface HitWrite {
  draw_code: string;
  bet_id: number;
  units: number;
  cost: number;
  win_amount: number;
  breakdown: string;
}

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

function buildHit(drawRow: DrawRow, bet: BetRow): HitWrite | null {
  if (!shouldSettle(bet)) return null;
  if (bet.start_code && drawRow.code < bet.start_code) return null;
  const draw = {
    red: drawRow.red.split(",").map((x) => parseInt(x, 10)),
    blue: parseInt(drawRow.blue, 10),
  };
  const result = settle(rowToBet(bet), draw, { prizeAmounts: prizeAmountsFrom(drawRow) });
  return {
    draw_code: drawRow.code,
    bet_id: bet.id,
    units: result.units,
    cost: result.units * bet.unit_price,
    win_amount: result.totalAmount * 100, // engine 用「元」，入库转分
    breakdown: JSON.stringify(result.tierBreakdown),
  };
}

function buildHits(drawRows: DrawRow[], bets: BetRow[]): HitWrite[] {
  const out: HitWrite[] = [];
  for (const drawRow of drawRows) {
    for (const bet of bets) {
      const hit = buildHit(drawRow, bet);
      if (hit) out.push(hit);
    }
  }
  return out;
}

/**
 * 增量同步：只在发现新期时写入。
 * 没有新期时不写 draws / hit_records / app_meta，直接返回 skipped。
 */
export async function syncLatest(): Promise<SyncReport> {
  const report: SyncReport = { fetched: 0, saved: 0, hits: 0, errors: [], skipped: false };

  let rows;
  try {
    rows = await fetchLatestDraws(100);
  } catch (e: any) {
    report.errors.push(`fetch failed: ${e?.message ?? e}`);
    return report;
  }
  report.fetched = rows.length;
  if (!rows.length) return report;

  try {
    const dbLatest = await latestDraw();
    if (dbLatest && rows[0].code <= dbLatest.code) {
      report.skipped = true;
      return report;
    }

    // rows 已按最新在前排序；只解析比库内最新期更新的期，按旧→新处理
    const fresh = rows.filter((r) => !dbLatest || r.code > dbLatest.code).reverse();
    const parsed: DrawRow[] = [];
    for (const r of fresh) {
      try {
        parsed.push({ ...parseDrawRow(r), fetched_at: Date.now() } as DrawRow);
      } catch (e: any) {
        report.errors.push(`parse ${r.code}: ${e?.message ?? e}`);
      }
    }
    if (!parsed.length) {
      report.skipped = true;
      return report;
    }

    const bets = await listBets(true);
    const hits = buildHits(parsed, bets);

    await withTransaction(async (conn) => {
      await upsertDraws(parsed, conn);
      await upsertHitRecords(hits, conn);
    });

    report.saved = parsed.length;
    report.hits = hits.length;
    await setMeta("last_sync_at", new Date().toISOString());
    return report;
  } catch (e: any) {
    report.errors.push(e?.message ?? String(e));
    return report;
  }
}

/** 手动补录/修复指定期：始终重新写这一期及其命中 */
export async function syncOne(code: string): Promise<SyncReport> {
  const report: SyncReport = { fetched: 0, saved: 0, hits: 0, errors: [], skipped: false };
  try {
    const all = await fetchLatestDraws(100);
    const r = all.find((x) => x.code === code);
    if (!r) {
      report.errors.push(`not found ${code}`);
      return report;
    }
    report.fetched = 1;
    const parsed = { ...parseDrawRow(r), fetched_at: Date.now() } as DrawRow;
    const bets = await listBets(true);
    const hits = buildHits([parsed], bets);

    await withTransaction(async (conn) => {
      await upsertDraws([parsed], conn);
      await upsertHitRecords(hits, conn);
    });

    report.saved = 1;
    report.hits = hits.length;
    await setMeta("last_sync_at", new Date().toISOString());
  } catch (e: any) {
    report.errors.push(e?.message ?? String(e));
  }
  return report;
}

/**
 * 启动时触发一次（best-effort，模块级去重）：
 * - 库为空且未回填过 → 拉全部历史期，批量入库并结算
 * - 否则 → 做一次增量检查（无新期不写库）
 */
let _seedPromise: Promise<void> | null = null;

export function ensureLatestSeed(): Promise<void> {
  if (!_seedPromise) {
    _seedPromise = doEnsureLatestSeed().catch((e) => {
      console.error("[ensureLatestSeed] failed:", e);
      _seedPromise = null;
    });
  }
  return _seedPromise;
}

async function doEnsureLatestSeed(): Promise<void> {
  const [backfilled, recent] = await Promise.all([getMeta("history_backfilled"), listDraws(1)]);
  if (backfilled !== "1" && recent.length === 0) {
    console.log("[sync] 历史回填开始...");
    const r = await backfillHistory();
    console.log(`[sync] 历史回填完成: 拉取 ${r.fetched} 期，入库 ${r.saved} 期`);
    await settleAllBets();
  } else {
    const r = await syncLatest();
    console.log(
      `[sync] 启动检查: 拉取 ${r.fetched} 期，新增 ${r.saved} 期，结算 ${r.hits} 条${r.skipped ? "（无新开奖）" : ""}`
    );
  }
}

/**
 * 历史回填：中彩网接口当前忽略 pageSize，一次返回其可提供的全部期（约 2000 期）。
 * 只为库内不存在的期写库，批量 upsert，避免逐期往返。
 */
export async function backfillHistory(): Promise<{ fetched: number; saved: number; pages: number; errors: string[] }> {
  const report = { fetched: 0, saved: 0, pages: 0, errors: [] as string[] };

  let rows;
  try {
    rows = await fetchLatestDraws(10000);
  } catch (e: any) {
    report.errors.push(`fetch failed: ${e?.message ?? e}`);
    return report;
  }

  report.pages = 1;
  report.fetched = rows.length;

  const existing = new Set((await listDraws(10000)).map((d) => d.code));
  const parsed: DrawRow[] = [];
  for (const r of rows) {
    if (existing.has(r.code)) continue;
    try {
      parsed.push({ ...parseDrawRow(r), fetched_at: Date.now() } as DrawRow);
    } catch (e: any) {
      report.errors.push(`${r?.code}: ${e?.message ?? e}`);
    }
  }

  if (parsed.length) {
    await withTransaction(async (conn) => {
      await upsertDraws(parsed, conn);
    });
    report.saved = parsed.length;
  }

  // 有数据且无解析错误才标记完成；失败时下次启动会重试（upsert 幂等）
  if (report.fetched > 0 && report.errors.length === 0) {
    await setMeta("history_backfilled", "1");
    await setMeta("last_backfill_at", new Date().toISOString());
    await setMeta("last_sync_at", new Date().toISOString());
  }
  return report;
}

/** 对所有启用守号按当前 start_code 重新结算库内开奖（回填后/手动修复用） */
export async function settleAllBets(): Promise<{ bet: number; recalc: number }> {
  const bets = await listBets(true);
  let totalRecalc = 0;
  for (const b of bets) {
    const r = await resyncBet(b.id);
    totalRecalc += r.recalc;
  }
  return { bet: bets.length, recalc: totalRecalc };
}

/**
 * 对单个守号按当前 start_code 重新结算：
 * 删除旧 hit_records → 拉取 start_code 之后的期 → 批量写入（单事务）。
 * 用于新增守号、修改 start_code、手动修复。
 */
export async function resyncBet(betId: number): Promise<{ recalc: number; deleted: number }> {
  const bet = await getBet(betId);
  if (!bet) throw new Error(`bet ${betId} not found`);

  const draws = shouldSettle(bet) ? await listDrawsSince(bet.start_code) : [];
  const writes: HitWrite[] = [];
  for (const drawRow of draws) {
    const hit = buildHit(drawRow, bet);
    if (hit) writes.push(hit);
  }

  return withTransaction(async (conn) => {
    const deleted = await deleteHitsByBet(betId, conn);
    await upsertHitRecords(writes, conn);
    return { recalc: writes.length, deleted };
  });
}

/** 计算下一个预期期号 = 最新期号 + 1（按年递增 + 期内顺序） */
export async function nextDrawCode(): Promise<string | null> {
  const latest = await latestDraw();
  if (!latest) return null;
  const year = parseInt(latest.code.slice(0, 4), 10);
  const seq = parseInt(latest.code.slice(4), 10);
  if (seq >= 156) return `${year + 1}001`;
  return `${year}${String(seq + 1).padStart(3, "0")}`;
}

/* ====== 定时器：只在开奖日检查，避免无意义的 30 分钟轮询 ====== */

const DRAW_WEEKDAYS = new Set([0, 2, 4]); // 周日、周二、周四
const DRAW_HOUR = 21;
const DRAW_MINUTE = 35;
const RETRY_DELAY_MS = 30 * 60 * 1000;
const MAX_RETRIES = 3;

let _schedulerStarted = false;
let _tickRunning = false;
let _retryCount = 0;
let _nextTimer: ReturnType<typeof setTimeout> | null = null;

function nextDrawAt(from: Date): Date {
  for (let i = 0; i < 14; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    d.setHours(DRAW_HOUR, DRAW_MINUTE, 0, 0);
    if (d.getTime() > from.getTime() && DRAW_WEEKDAYS.has(d.getDay())) return d;
  }
  throw new Error("无法计算下次开奖时间");
}

function scheduleAt(date: Date, reason: "draw" | "retry"): void {
  if (_nextTimer) clearTimeout(_nextTimer);
  const delay = Math.max(0, date.getTime() - Date.now());
  console.log(
    `[sync] 下次检查: ${date.toLocaleString("zh-CN", { hour12: false })} (${reason})`
  );
  _nextTimer = setTimeout(() => {
    void tick(reason);
  }, delay);
  _nextTimer.unref?.();
}

async function tick(reason: "draw" | "retry"): Promise<void> {
  if (_tickRunning) return;
  _tickRunning = true;
  try {
    const r = await syncLatest();
    if (r.errors.length) {
      console.error("[sync] 检查有错误:", r.errors.join("; "));
    }
    console.log(
      `[sync] 检查完成: 拉取 ${r.fetched} 期，新增 ${r.saved} 期，结算 ${r.hits} 条${r.skipped ? "（无新开奖）" : ""}`
    );

    if ((reason === "draw" || reason === "retry") && r.saved === 0 && _retryCount < MAX_RETRIES) {
      _retryCount++;
      scheduleAt(new Date(Date.now() + RETRY_DELAY_MS), "retry");
      return;
    }

    _retryCount = 0;
    scheduleAt(nextDrawAt(new Date(Date.now() + 1000)), "draw");
  } catch (e: any) {
    console.error("[sync] 检查失败:", e?.message ?? e);
    if (_retryCount < MAX_RETRIES) {
      _retryCount++;
      scheduleAt(new Date(Date.now() + RETRY_DELAY_MS), "retry");
    } else {
      _retryCount = 0;
      scheduleAt(nextDrawAt(new Date(Date.now() + 1000)), "draw");
    }
  } finally {
    _tickRunning = false;
  }
}

/**
 * 启动定时器：
 * - 启动 5 秒后做一次 catch-up（页面首次 SSR 也会触发，内部去重）
 * - 之后只在开奖日 21:35 检查；若结果未出，30 分钟后重试，最多 2 次
 */
export function startScheduler(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;
  console.log("[sync] 定时器已启动：仅开奖日（周二/四/日）21:35 检查，未出结果最多重试 3 次");

  setTimeout(() => {
    void ensureLatestSeed().catch(() => {});
  }, 5000).unref?.();

  scheduleAt(nextDrawAt(new Date(Date.now() + 1000)), "draw");
}
