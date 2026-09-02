/**
 * SQLite 单例 + 建表 + 仓库函数
 * 表：
 *   - draws：开奖期
 *   - bets：守号（支持 single/complex/danTuo，存为 JSON）
 *   - hit_records：每期每组守号的命中汇总
 *   - app_meta：key/value 元信息（最后拉取时间等）
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "ssq.db");

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initSchema(_db);
  return _db;
}

function initSchema(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS draws (
      code TEXT PRIMARY KEY,
      date TEXT NOT NULL,           -- YYYY-MM-DD
      week TEXT,                    -- 二/四/日
      red TEXT NOT NULL,            -- 逗号分隔
      blue TEXT NOT NULL,           -- 单值
      sales INTEGER,
      poolmoney INTEGER,
      prize1_amount INTEGER, prize1_count INTEGER,
      prize2_amount INTEGER, prize2_count INTEGER,
      prize3_amount INTEGER, prize3_count INTEGER,
      prize4_amount INTEGER, prize4_count INTEGER,
      prize5_amount INTEGER, prize5_count INTEGER,
      prize6_amount INTEGER, prize6_count INTEGER,
      content TEXT,
      details_link TEXT,
      fetched_at INTEGER NOT NULL,
      UNIQUE(code)
    );
    CREATE INDEX IF NOT EXISTS idx_draws_date ON draws(date);

    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,           -- single/complex/danTuo
      payload TEXT NOT NULL,        -- JSON: { red/redDan/redTuo/blue }
      unit_price INTEGER NOT NULL DEFAULT 200, -- 单注金额（分），默认 2 元
      buy_enabled INTEGER NOT NULL DEFAULT 1,  -- 该期是否购买
      active INTEGER NOT NULL DEFAULT 1,
      start_code TEXT,              -- 从哪期开始守（NULL = 全部；字符串 = 该期及之后才结算）
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hit_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draw_code TEXT NOT NULL,
      bet_id INTEGER NOT NULL,
      units INTEGER NOT NULL,
      cost INTEGER NOT NULL,            -- 花费（分）
      win_amount INTEGER NOT NULL,      -- 奖金（分）
      breakdown TEXT NOT NULL,          -- JSON: tierBreakdown
      created_at INTEGER NOT NULL,
      UNIQUE(draw_code, bet_id),
      FOREIGN KEY(draw_code) REFERENCES draws(code),
      FOREIGN KEY(bet_id) REFERENCES bets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // 兼容老库：bets 表缺 start_code 列则补上
  // 注意：必须在 CREATE TABLE 之后做，否则新库上 bets 还不存在会抛错
  const cols = d.prepare(`PRAGMA table_info(bets)`).all() as { name: string }[];
  if (cols.length > 0 && !cols.some((c) => c.name === "start_code")) {
    d.exec(`ALTER TABLE bets ADD COLUMN start_code TEXT`);
  }
}

/* ====== draws ====== */

export interface DrawRow {
  code: string;
  date: string;
  week: string | null;
  red: string;
  blue: string;
  sales: number | null;
  poolmoney: number | null;
  prize1_amount: number | null;
  prize1_count: number | null;
  prize2_amount: number | null;
  prize2_count: number | null;
  prize3_amount: number | null;
  prize3_count: number | null;
  prize4_amount: number | null;
  prize4_count: number | null;
  prize5_amount: number | null;
  prize5_count: number | null;
  prize6_amount: number | null;
  prize6_count: number | null;
  content: string | null;
  details_link: string | null;
  fetched_at: number;
}

export function upsertDraw(d: Omit<DrawRow, "fetched_at">): void {
  const stmt = db().prepare(
    `INSERT INTO draws (code,date,week,red,blue,sales,poolmoney,
       prize1_amount,prize1_count,prize2_amount,prize2_count,prize3_amount,prize3_count,
       prize4_amount,prize4_count,prize5_amount,prize5_count,prize6_amount,prize6_count,
       content,details_link,fetched_at)
     VALUES (@code,@date,@week,@red,@blue,@sales,@poolmoney,
       @prize1_amount,@prize1_count,@prize2_amount,@prize2_count,@prize3_amount,@prize3_count,
       @prize4_amount,@prize4_count,@prize5_amount,@prize5_count,@prize6_amount,@prize6_count,
       @content,@details_link,@fetched_at)
     ON CONFLICT(code) DO UPDATE SET
       date=excluded.date, week=excluded.week, red=excluded.red, blue=excluded.blue,
       sales=excluded.sales, poolmoney=excluded.poolmoney,
       prize1_amount=excluded.prize1_amount, prize1_count=excluded.prize1_count,
       prize2_amount=excluded.prize2_amount, prize2_count=excluded.prize2_count,
       prize3_amount=excluded.prize3_amount, prize3_count=excluded.prize3_count,
       prize4_amount=excluded.prize4_amount, prize4_count=excluded.prize4_count,
       prize5_amount=excluded.prize5_amount, prize5_count=excluded.prize5_count,
       prize6_amount=excluded.prize6_amount, prize6_count=excluded.prize6_count,
       content=excluded.content, details_link=excluded.details_link, fetched_at=excluded.fetched_at`
  );
  stmt.run({ ...d, fetched_at: Date.now() });
}

export function getDraw(code: string): DrawRow | null {
  return (db().prepare(`SELECT * FROM draws WHERE code = ?`).get(code) as DrawRow | undefined) ?? null;
}

export function latestDraw(): DrawRow | null {
  return (db().prepare(`SELECT * FROM draws ORDER BY date DESC, code DESC LIMIT 1`).get() as DrawRow | undefined) ?? null;
}

export function listDraws(limit = 50): DrawRow[] {
  return db()
    .prepare(`SELECT * FROM draws ORDER BY date DESC, code DESC LIMIT ?`)
    .all(limit) as DrawRow[];
}

/* ====== bets ====== */

export interface BetRow {
  id: number;
  name: string;
  type: string;
  payload: string;
  unit_price: number;
  buy_enabled: number;
  active: number;
  start_code: string | null;
  created_at: number;
  updated_at: number;
}

export function listBets(activeOnly = false): BetRow[] {
  const sql = activeOnly ? `SELECT * FROM bets WHERE active=1 ORDER BY id ASC` : `SELECT * FROM bets ORDER BY id ASC`;
  return db().prepare(sql).all() as BetRow[];
}

export function getBet(id: number): BetRow | null {
  return (db().prepare(`SELECT * FROM bets WHERE id = ?`).get(id) as BetRow | undefined) ?? null;
}

export function createBet(input: {
  name: string;
  type: "single" | "complex" | "danTuo";
  payload: unknown;
  unit_price?: number;
  buy_enabled?: number;
  start_code?: string | null;
}): number {
  const now = Date.now();
  const stmt = db().prepare(
    `INSERT INTO bets (name, type, payload, unit_price, buy_enabled, active, start_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
  );
  const r = stmt.run(
    input.name,
    input.type,
    JSON.stringify(input.payload),
    input.unit_price ?? 200, // 默认 2 元 = 200 分
    input.buy_enabled ?? 1,
    input.start_code ?? null,
    now,
    now
  );
  return Number(r.lastInsertRowid);
}

export function updateBet(id: number, patch: Partial<{ name: string; payload: unknown; unit_price: number; buy_enabled: number; active: number; start_code: string | null }>): void {
  const cur = getBet(id);
  if (!cur) throw new Error(`bet ${id} not found`);
  const next = {
    name: patch.name ?? cur.name,
    payload: patch.payload !== undefined ? JSON.stringify(patch.payload) : cur.payload,
    unit_price: patch.unit_price ?? cur.unit_price,
    buy_enabled: patch.buy_enabled ?? cur.buy_enabled,
    active: patch.active ?? cur.active,
    start_code: patch.start_code !== undefined ? patch.start_code : cur.start_code,
    updated_at: Date.now(),
  };
  db().prepare(
    `UPDATE bets SET name=@name, payload=@payload, unit_price=@unit_price, buy_enabled=@buy_enabled, active=@active, start_code=@start_code, updated_at=@updated_at WHERE id=@id`
  ).run({ ...next, id });
}

export function deleteBet(id: number): void {
  db().prepare(`DELETE FROM bets WHERE id = ?`).run(id);
}

/* ====== hit_records ====== */

export interface HitRow {
  id: number;
  draw_code: string;
  bet_id: number;
  units: number;
  cost: number;
  win_amount: number;
  breakdown: string;
  created_at: number;
}

export function upsertHitRecord(rec: Omit<HitRow, "id" | "created_at">): void {
  db()
    .prepare(
      `INSERT INTO hit_records (draw_code, bet_id, units, cost, win_amount, breakdown, created_at)
       VALUES (@draw_code,@bet_id,@units,@cost,@win_amount,@breakdown,@created_at)
       ON CONFLICT(draw_code, bet_id) DO UPDATE SET
         units=excluded.units, cost=excluded.cost, win_amount=excluded.win_amount, breakdown=excluded.breakdown`
    )
    .run({ ...rec, created_at: Date.now() });
}

export function listHitsByDraw(code: string): HitRow[] {
  return db().prepare(`SELECT * FROM hit_records WHERE draw_code = ?`).all(code) as HitRow[];
}

export function listAllHits(): HitRow[] {
  return db().prepare(`SELECT * FROM hit_records ORDER BY draw_code DESC`).all() as HitRow[];
}

/* ====== meta ====== */

export function setMeta(key: string, value: string): void {
  db().prepare(
    `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run(key, value, Date.now());
}

export function getMeta(key: string): string | null {
  const r = db().prepare(`SELECT value FROM app_meta WHERE key = ?`).get(key) as { value: string } | undefined;
  return r?.value ?? null;
}
