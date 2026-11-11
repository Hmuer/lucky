/**
 * 自动同步：拉取最新开奖 → 只在有新期时入库并结算
 *
 * 成本策略（TDSQL-C 按量付费）：
 * 1. 不再每 30 分钟轮询；只在双色球开奖日（周二/四/日）21:30 开始，
 *    每 10 分钟检查一次，拿到新期即停止本轮轮询并触发推送。
 * 2. 每次检查先比较库内最新期号；没有新期时只读 1 次、不写任何表。
 * 3. 新期只写这一期：draws upsert + hit_records 批量 upsert，单事务提交。
 * 4. 历史回填只在库为空时执行一次，批量写入。
 */

import { fetchLatestDraws, parseDrawRow } from "../crawler/cwl";
import { notifyDraw } from "../wx/push";
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
  /** 已存在但数据不完整、本次补全的期数 */
  repaired: number;
  hits: number;
  errors: string[];
  skipped: boolean;
  /** 本次新写入的期号（升序），用于同步后推送 */
  newDraws: string[];
}

interface HitWrite {
  user_id: number;
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

/**
 * 官方公告在开奖后可能先返回“只有号码、没有销量/奖级”的占位数据。
 * 这种期不能入库结算，否则一二等奖金额会写成 0，且期号不再变化后永远不会修正。
 */
function isCompleteDraw(d: DrawRow): boolean {
  return (
    (d.sales ?? 0) > 0 &&
    (d.poolmoney ?? 0) > 0 &&
    (d.prize6_count ?? 0) > 0
  );
}

function positiveAmount(v: number | null | undefined): number | undefined {
  return typeof v === "number" && v > 0 ? v : undefined;
}

function prizeAmountsFrom(drawRow: DrawRow): Partial<Record<PrizeTier, number>> {
  return {
    1: positiveAmount(drawRow.prize1_amount),
    2: positiveAmount(drawRow.prize2_amount),
    3: positiveAmount(drawRow.prize3_amount),
    4: positiveAmount(drawRow.prize4_amount),
    5: positiveAmount(drawRow.prize5_amount),
    6: positiveAmount(drawRow.prize6_amount),
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
    user_id: bet.user_id,
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
 * 增量同步：新期完整才入库；已入库但缺销量/奖级数据的期会自动补全并重算。
 * 没有新期且没有可修复期时不写 draws / hit_records / app_meta。
 */
export async function syncLatest(): Promise<SyncReport> {
  const report: SyncReport = { fetched: 0, saved: 0, repaired: 0, hits: 0, errors: [], skipped: false, newDraws: [] };

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
    const [dbLatest, dbRecent] = await Promise.all([latestDraw(), listDraws(30)]);
    const dbByCode = new Map(dbRecent.map((d) => [d.code, d] as const));

    // rows 已按最新在前排序；新期取全部，已存在期只检查最近 30 期是否缺数据。
    const candidates = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      if (!dbLatest || r.code > dbLatest.code) candidates.set(r.code, r);
    }
    for (const r of rows.slice(0, 30)) {
      if (dbByCode.has(r.code)) candidates.set(r.code, r);
    }

    const parsed: DrawRow[] = [];
    for (const r of candidates.values()) {
      try {
        const row = { ...parseDrawRow(r), fetched_at: Date.now() } as DrawRow;
        if (!isCompleteDraw(row)) continue;
        const existing = dbByCode.get(row.code);
        if (existing && isCompleteDraw(existing)) continue;
        parsed.push(row);
      } catch (e: any) {
        report.errors.push(`parse ${r.code}: ${e?.message ?? e}`);
      }
    }
    if (!parsed.length) {
      report.skipped = true;
      return report;
    }

    parsed.sort((a, b) => a.code.localeCompare(b.code));
    const newRows = parsed.filter((d) => !dbByCode.has(d.code));
    const repairedRows = parsed.filter((d) => dbByCode.has(d.code));

    const bets = await listBets(true, null);
    const hits = buildHits(parsed, bets);

    await withTransaction(async (conn) => {
      await upsertDraws(parsed, conn);
      await upsertHitRecords(hits, conn);
    });

    report.saved = newRows.length;
    report.repaired = repairedRows.length;
    report.hits = hits.length;
    report.newDraws = newRows.map((d) => d.code);
    await setMeta("last_sync_at", new Date().toISOString());
    return report;
  } catch (e: any) {
    report.errors.push(e?.message ?? String(e));
    return report;
  }
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
      `[sync] 启动检查: 拉取 ${r.fetched} 期，新增 ${r.saved} 期，修复 ${r.repaired} 期，结算 ${r.hits} 条${r.skipped ? "（无新开奖/无需修复）" : ""}`
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
      const row = { ...parseDrawRow(r), fetched_at: Date.now() } as DrawRow;
      // 开奖后接口可能先给占位数据；历史回填也不能把 0 值写死。
      if (!isCompleteDraw(row)) continue;
      parsed.push(row);
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
  const bets = await listBets(true, null);
  let totalRecalc = 0;
  for (const b of bets) {
    const r = await resyncBet(b.id, b.user_id);
    totalRecalc += r.recalc;
  }
  return { bet: bets.length, recalc: totalRecalc };
}

/**
 * 对单个守号按当前 start_code 重新结算：
 * 删除旧 hit_records → 拉取 start_code 之后的期 → 批量写入（单事务）。
 * 用于新增守号、修改 start_code、手动修复。
 */
export async function resyncBet(betId: number, userId?: number): Promise<{ recalc: number; deleted: number }> {
  const bet = await getBet(betId, userId);
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

/**
 * 同步 + 推送：给小程序定时任务/手动同步使用。
 * 一次同步可能补多期，只对最新一期推送，避免补数据时连续轰炸用户。
 */
export async function syncAndNotify(): Promise<SyncReport & { pushed: number }> {
  const report = await syncLatest();
  let pushed = 0;
  if (report.newDraws.length) {
    const latestNew = report.newDraws[report.newDraws.length - 1];
    try {
      pushed = await notifyDraw(latestNew);
    } catch (e: any) {
      report.errors.push(`push ${latestNew}: ${e?.message ?? e}`);
    }
  }
  return { ...report, pushed };
}

/* ====== 定时器：开奖日 21:30 起每 10 分钟检查，拿到新期即停止 ====== */

const DRAW_WEEKDAYS = new Set([0, 2, 4]); // 周日、周二、周四
const DRAW_HOUR = 21;
const DRAW_MINUTE = 30;
const RETRY_DELAY_MS = 10 * 60 * 1000;
const MAX_RETRIES = 18; // 21:30 起最多轮询 3 小时

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
    const r = await syncAndNotify();
    if (r.errors.length) {
      console.error("[sync] 检查有错误:", r.errors.join("; "));
    }
    console.log(
      `[sync] 检查完成: 拉取 ${r.fetched} 期，新增 ${r.saved} 期，修复 ${r.repaired} 期，结算 ${r.hits} 条，推送 ${r.pushed} 人${r.skipped ? "（无新开奖/无需修复）" : ""}`
    );

    if ((reason === "draw" || reason === "retry") && r.saved === 0 && r.repaired === 0 && _retryCount < MAX_RETRIES) {
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
 * - 开奖日 21:30 开始每 10 分钟检查；拿到新期即停止并推送，最多轮询 3 小时
 */
export function startScheduler(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;
  console.log("[sync] 定时器已启动：开奖日（周二/四/日）21:30 起每 10 分钟检查，拿到新期即停止");

  setTimeout(() => {
    void ensureLatestSeed().catch(() => {});
  }, 5000).unref?.();

  scheduleAt(nextDrawAt(new Date(Date.now() + 1000)), "draw");
}
