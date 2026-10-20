/**
 * MySQL / TDSQL-C 数据访问层（替代原 better-sqlite3）
 *
 * 设计要点：
 * - 连接串来自 DATABASE_URL（.env.local，勿提交）
 * - 小连接池 + 90 秒无查询自动关闭，便于 TDSQL-C 空闲时降成本
 * - 表结构首次访问时 CREATE TABLE IF NOT EXISTS
 * - 所有写操作使用参数化 SQL；批量 upsert 减少往返
 */

import { createPool, type Pool, type PoolConnection, type ResultSetHeader } from "mysql2/promise";

let _pool: Pool | null = null;
let _schemaPromise: Promise<void> | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;
let _active = 0;

/** 无查询多久后主动关闭连接池（毫秒）。按量计费场景下让数据库更容易空闲。 */
const IDLE_CLOSE_MS = 90_000;

function poolOptions() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("缺少 DATABASE_URL，请在 .env.local 配置 MySQL 连接串");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL 格式不正确，应为 mysql://user:pass@host:port/database");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!database) throw new Error("DATABASE_URL 缺少数据库名");

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 3,
    maxIdle: 1,
    idleTimeout: 60_000,
    queueLimit: 0,
    dateStrings: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 10_000,
  };
}

export function getPool(): Pool {
  if (!_pool) {
    _pool = createPool(poolOptions());
    hookShutdown();
  }
  return _pool;
}

let _shutdownHooked = false;
function hookShutdown(): void {
  if (_shutdownHooked) return;
  _shutdownHooked = true;
  // 服务重启/停止时主动关连接，避免在 TDSQL-C 侧留下长时间 Sleep 连接
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void closePool();
    });
  }
}

function touchIdle(): void {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    if (_active > 0) {
      touchIdle();
      return;
    }
    const p = _pool;
    _pool = null;
    if (p) void p.end().catch(() => {});
  }, IDLE_CLOSE_MS);
  _idleTimer.unref?.();
}

async function select<T>(sql: string, params: any[] = []): Promise<T[]> {
  _active++;
  touchIdle();
  try {
    const [result] = await getPool().query(sql, params);
    return result as unknown as T[];
  } finally {
    _active--;
    touchIdle();
  }
}

async function execute(sql: string, params: any[] = []): Promise<ResultSetHeader> {
  _active++;
  touchIdle();
  try {
    const [result] = await getPool().execute(sql, params);
    return result as ResultSetHeader;
  } finally {
    _active--;
    touchIdle();
  }
}

async function raw(sql: string): Promise<void> {
  _active++;
  touchIdle();
  try {
    await getPool().query(sql);
  } finally {
    _active--;
    touchIdle();
  }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT,
    openid VARCHAR(128) NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_openid (openid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    user_id INT NOT NULL,
    accepted TINYINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS draws (
    code VARCHAR(16) NOT NULL,
    \`date\` DATE NOT NULL,
    week VARCHAR(8) NULL,
    red VARCHAR(32) NOT NULL,
    blue VARCHAR(8) NOT NULL,
    sales BIGINT NULL,
    poolmoney BIGINT NULL,
    prize1_amount BIGINT NULL, prize1_count INT NULL,
    prize2_amount BIGINT NULL, prize2_count INT NULL,
    prize3_amount BIGINT NULL, prize3_count INT NULL,
    prize4_amount BIGINT NULL, prize4_count INT NULL,
    prize5_amount BIGINT NULL, prize5_count INT NULL,
    prize6_amount BIGINT NULL, prize6_count INT NULL,
    content TEXT NULL,
    details_link VARCHAR(255) NULL,
    fetched_at BIGINT NOT NULL,
    PRIMARY KEY (code),
    KEY idx_draws_date (\`date\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS bets (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(16) NOT NULL,
    payload TEXT NOT NULL,
    unit_price INT NOT NULL DEFAULT 200,
    buy_enabled TINYINT NOT NULL DEFAULT 1,
    active TINYINT NOT NULL DEFAULT 1,
    start_code VARCHAR(16) NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (id),
    KEY idx_bets_user (user_id),
    CONSTRAINT fk_bets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS hit_records (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    draw_code VARCHAR(16) NOT NULL,
    bet_id INT NOT NULL,
    units INT NOT NULL,
    cost BIGINT NOT NULL,
    win_amount BIGINT NOT NULL,
    breakdown TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_hit_draw_bet (draw_code, bet_id),
    KEY idx_hit_bet (bet_id),
    KEY idx_hits_user (user_id),
    CONSTRAINT fk_hit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_hit_draw FOREIGN KEY (draw_code) REFERENCES draws(code) ON DELETE CASCADE,
    CONSTRAINT fk_hit_bet FOREIGN KEY (bet_id) REFERENCES bets(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    meta_key VARCHAR(64) NOT NULL,
    value TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (meta_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

export async function ensureSchema(): Promise<void> {
  if (!_schemaPromise) {
    _schemaPromise = (async () => {
      for (const sql of SCHEMA) await raw(sql);
    })().catch((e) => {
      _schemaPromise = null;
      throw e;
    });
  }
  await _schemaPromise;
}

export async function closePool(): Promise<void> {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  const p = _pool;
  _pool = null;
  if (p) await p.end().catch(() => {});
}

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  await ensureSchema();
  _active++;
  touchIdle();
  let conn: PoolConnection | null = null;
  try {
    conn = await getPool().getConnection();
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }
    throw e;
  } finally {
    if (conn) conn.release();
    _active--;
    touchIdle();
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

const DRAW_COLUMNS =
  "code,`date`,week,red,blue,sales,poolmoney," +
  "prize1_amount,prize1_count,prize2_amount,prize2_count,prize3_amount,prize3_count," +
  "prize4_amount,prize4_count,prize5_amount,prize5_count,prize6_amount,prize6_count," +
  "content,details_link,fetched_at";
const DRAW_ROW_PLACEHOLDERS = "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
const DRAW_UPDATE =
  "`date`=VALUES(`date`),week=VALUES(week),red=VALUES(red),blue=VALUES(blue)," +
  "sales=VALUES(sales),poolmoney=VALUES(poolmoney)," +
  "prize1_amount=VALUES(prize1_amount),prize1_count=VALUES(prize1_count)," +
  "prize2_amount=VALUES(prize2_amount),prize2_count=VALUES(prize2_count)," +
  "prize3_amount=VALUES(prize3_amount),prize3_count=VALUES(prize3_count)," +
  "prize4_amount=VALUES(prize4_amount),prize4_count=VALUES(prize4_count)," +
  "prize5_amount=VALUES(prize5_amount),prize5_count=VALUES(prize5_count)," +
  "prize6_amount=VALUES(prize6_amount),prize6_count=VALUES(prize6_count)," +
  "content=VALUES(content),details_link=VALUES(details_link),fetched_at=VALUES(fetched_at)";

function drawValues(d: DrawRow): any[] {
  return [
    d.code,
    d.date,
    d.week,
    d.red,
    d.blue,
    d.sales,
    d.poolmoney,
    d.prize1_amount,
    d.prize1_count,
    d.prize2_amount,
    d.prize2_count,
    d.prize3_amount,
    d.prize3_count,
    d.prize4_amount,
    d.prize4_count,
    d.prize5_amount,
    d.prize5_count,
    d.prize6_amount,
    d.prize6_count,
    d.content,
    d.details_link,
    d.fetched_at,
  ];
}

export async function upsertDraws(rows: DrawRow[], conn?: PoolConnection): Promise<void> {
  if (!rows.length) return;
  if (!conn) await ensureSchema();
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize);
    const placeholders = batch.map(() => DRAW_ROW_PLACEHOLDERS).join(",");
    const sql = `INSERT INTO draws (${DRAW_COLUMNS}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${DRAW_UPDATE}`;
    const params = batch.flatMap(drawValues);
    if (conn) await conn.execute(sql, params);
    else await execute(sql, params);
  }
}

export async function upsertDraw(d: Omit<DrawRow, "fetched_at"> & { fetched_at?: number }): Promise<void> {
  await upsertDraws([{ ...d, fetched_at: d.fetched_at ?? Date.now() }]);
}

export async function getDraw(code: string): Promise<DrawRow | null> {
  await ensureSchema();
  const rows = await select<DrawRow>("SELECT * FROM draws WHERE code = ?", [code]);
  return rows[0] ?? null;
}

export async function latestDraw(): Promise<DrawRow | null> {
  await ensureSchema();
  const rows = await select<DrawRow>("SELECT * FROM draws ORDER BY `date` DESC, code DESC LIMIT 1");
  return rows[0] ?? null;
}

export async function listDraws(limit = 50): Promise<DrawRow[]> {
  await ensureSchema();
  const n = Math.max(1, Math.min(Number(limit) || 50, 10000));
  return select<DrawRow>("SELECT * FROM draws ORDER BY `date` DESC, code DESC LIMIT ?", [n]);
}

export async function listDrawsSince(startCode: string | null, limit = 10000): Promise<DrawRow[]> {
  await ensureSchema();
  const n = Math.max(1, Math.min(Number(limit) || 10000, 10000));
  if (!startCode) {
    return select<DrawRow>("SELECT * FROM draws ORDER BY code ASC LIMIT ?", [n]);
  }
  return select<DrawRow>("SELECT * FROM draws WHERE code >= ? ORDER BY code ASC LIMIT ?", [startCode, n]);
}

/* ====== users / subscriptions ====== */

export interface UserRow {
  id: number;
  openid: string;
  created_at: number;
}

export interface SubscriptionRow {
  user_id: number;
  accepted: number;
  updated_at: number;
}

let _defaultUserIdPromise: Promise<number> | null = null;

/** 网页端单人模式使用的默认用户；由 DEFAULT_USER_OPENID 指定，缺省 __default__ */
export function getDefaultUserId(): Promise<number> {
  if (!_defaultUserIdPromise) {
    _defaultUserIdPromise = (async () => {
      const openid = process.env.DEFAULT_USER_OPENID || "__default__";
      const user = await findOrCreateUserByOpenid(openid);
      return user.id;
    })().catch((e) => {
      _defaultUserIdPromise = null;
      throw e;
    });
  }
  return _defaultUserIdPromise;
}

export async function findOrCreateUserByOpenid(openid: string): Promise<{ id: number; isNew: boolean }> {
  await ensureSchema();
  const existing = await select<UserRow>("SELECT * FROM users WHERE openid = ?", [openid]);
  if (existing[0]) return { id: existing[0].id, isNew: false };

  try {
    const res = await execute("INSERT INTO users (openid, created_at) VALUES (?, ?)", [openid, Date.now()]);
    return { id: Number(res.insertId), isNew: true };
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY") {
      const rows = await select<UserRow>("SELECT * FROM users WHERE openid = ?", [openid]);
      if (rows[0]) return { id: rows[0].id, isNew: false };
    }
    throw e;
  }
}

export async function getUserById(id: number): Promise<UserRow | null> {
  await ensureSchema();
  const rows = await select<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function getSubscription(userId: number): Promise<SubscriptionRow | null> {
  await ensureSchema();
  const rows = await select<SubscriptionRow>("SELECT * FROM subscriptions WHERE user_id = ?", [userId]);
  return rows[0] ?? null;
}

export async function setSubscription(userId: number, accepted: boolean): Promise<void> {
  await ensureSchema();
  await execute(
    `INSERT INTO subscriptions (user_id, accepted, updated_at) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE accepted=VALUES(accepted), updated_at=VALUES(updated_at)`,
    [userId, accepted ? 1 : 0, Date.now()]
  );
}

export interface PushTarget {
  user_id: number;
  openid: string;
  profit: number;
}

/** 本期有命中记录、且已授权订阅的用户（用于推送） */
export async function listPushTargets(drawCode: string): Promise<PushTarget[]> {
  await ensureSchema();
  const rows = await select<{ user_id: number; openid: string; profit: string | number }>(
    `SELECT u.id AS user_id, u.openid, SUM(h.win_amount - h.cost) AS profit
     FROM users u
     JOIN subscriptions s ON s.user_id = u.id AND s.accepted = 1
     JOIN hit_records h ON h.user_id = u.id AND h.draw_code = ?
     JOIN bets b ON b.id = h.bet_id AND b.user_id = u.id AND b.active = 1 AND b.buy_enabled = 1
     GROUP BY u.id, u.openid
     ORDER BY u.id ASC`,
    [drawCode]
  );
  return rows.map((r) => ({ user_id: Number(r.user_id), openid: r.openid, profit: Number(r.profit) }));
}

/* ====== bets ====== */

export interface BetRow {
  id: number;
  user_id: number;
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

export async function listBets(activeOnly = false, userId?: number | null): Promise<BetRow[]> {
  await ensureSchema();
  const uid = userId === undefined ? await getDefaultUserId() : userId;
  const conditions: string[] = [];
  const params: any[] = [];
  if (uid !== null) {
    conditions.push("user_id = ?");
    params.push(uid);
  }
  if (activeOnly) conditions.push("active = 1");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")} ` : "";
  return select<BetRow>(`SELECT * FROM bets ${where}ORDER BY id ASC`, params);
}

export async function getBet(id: number, userId?: number): Promise<BetRow | null> {
  await ensureSchema();
  const uid = userId === undefined ? await getDefaultUserId() : userId;
  const rows = await select<BetRow>("SELECT * FROM bets WHERE id = ? AND user_id = ?", [id, uid]);
  return rows[0] ?? null;
}

export async function createBet(input: {
  name: string;
  type: "single" | "complex" | "danTuo";
  payload: unknown;
  unit_price?: number;
  buy_enabled?: number;
  active?: number;
  start_code?: string | null;
}, userId?: number): Promise<number> {
  await ensureSchema();
  const uid = userId === undefined ? await getDefaultUserId() : userId;
  const now = Date.now();
  const res = await execute(
    `INSERT INTO bets (user_id, name, type, payload, unit_price, buy_enabled, active, start_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uid,
      input.name,
      input.type,
      JSON.stringify(input.payload),
      input.unit_price ?? 200,
      input.buy_enabled ?? 1,
      input.active ?? 1,
      input.start_code ?? null,
      now,
      now,
    ]
  );
  return Number(res.insertId);
}

export async function updateBet(
  id: number,
  patch: Partial<{ name: string; payload: unknown; unit_price: number; buy_enabled: number; active: number; start_code: string | null }>,
  userId?: number
): Promise<void> {
  const cur = await getBet(id, userId);
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
  await execute(
    "UPDATE bets SET name=?, payload=?, unit_price=?, buy_enabled=?, active=?, start_code=?, updated_at=? WHERE id=? AND user_id=?",
    [next.name, next.payload, next.unit_price, next.buy_enabled, next.active, next.start_code, next.updated_at, id, cur.user_id]
  );
}

export async function deleteBet(id: number, userId?: number): Promise<void> {
  await ensureSchema();
  const uid = userId === undefined ? await getDefaultUserId() : userId;
  await execute("DELETE FROM bets WHERE id = ? AND user_id = ?", [id, uid]);
}

/* ====== hit_records ====== */

export interface HitRow {
  id: number;
  user_id: number;
  draw_code: string;
  bet_id: number;
  units: number;
  cost: number;
  win_amount: number;
  breakdown: string;
  created_at: number;
}

export interface HitWithDrawRow extends HitRow {
  date: string;
  week: string | null;
  red: string;
  blue: string;
}

type HitInput = Omit<HitRow, "id" | "created_at"> & { created_at?: number };

const HIT_COLUMNS = "user_id,draw_code,bet_id,units,cost,win_amount,breakdown,created_at";
const HIT_ROW_PLACEHOLDERS = "(?,?,?,?,?,?,?,?)";
const HIT_UPDATE =
  "units=VALUES(units),cost=VALUES(cost),win_amount=VALUES(win_amount),breakdown=VALUES(breakdown)";

function hitValues(h: HitInput): any[] {
  return [
    h.user_id,
    h.draw_code,
    h.bet_id,
    h.units,
    h.cost,
    h.win_amount,
    h.breakdown,
    h.created_at ?? Date.now(),
  ];
}

export async function upsertHitRecords(records: HitInput[], conn?: PoolConnection): Promise<void> {
  if (!records.length) return;
  if (!conn) await ensureSchema();
  const chunkSize = 500;
  for (let i = 0; i < records.length; i += chunkSize) {
    const batch = records.slice(i, i + chunkSize);
    const placeholders = batch.map(() => HIT_ROW_PLACEHOLDERS).join(",");
    const sql = `INSERT INTO hit_records (${HIT_COLUMNS}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${HIT_UPDATE}`;
    const params = batch.flatMap(hitValues);
    if (conn) await conn.execute(sql, params);
    else await execute(sql, params);
  }
}

export async function upsertHitRecord(rec: HitInput): Promise<void> {
  await upsertHitRecords([rec]);
}

export async function deleteHitsByBet(betId: number, conn?: PoolConnection): Promise<number> {
  if (conn) {
    const [res] = await conn.execute("DELETE FROM hit_records WHERE bet_id = ?", [betId]);
    return (res as ResultSetHeader).affectedRows;
  }
  await ensureSchema();
  const res = await execute("DELETE FROM hit_records WHERE bet_id = ?", [betId]);
  return res.affectedRows;
}

export async function listHitsByDraw(code: string, userId?: number): Promise<HitRow[]> {
  await ensureSchema();
  const uid = userId === undefined ? await getDefaultUserId() : userId;
  return select<HitRow>("SELECT * FROM hit_records WHERE draw_code = ? AND user_id = ?", [code, uid]);
}

export async function listAllHits(userId?: number): Promise<HitRow[]> {
  await ensureSchema();
  const uid = userId === undefined ? await getDefaultUserId() : userId;
  return select<HitRow>("SELECT * FROM hit_records WHERE user_id = ? ORDER BY draw_code DESC", [uid]);
}

export async function listHitsByBet(betId: number, userId?: number): Promise<HitRow[]> {
  await ensureSchema();
  const uid = userId === undefined ? await getDefaultUserId() : userId;
  return select<HitRow>(
    "SELECT * FROM hit_records WHERE bet_id = ? AND user_id = ? ORDER BY draw_code DESC",
    [betId, uid]
  );
}

/** 小程序历史记录：命中记录 + 对应开奖期，按期号倒序 */
export async function listHitsWithDraw(userId: number): Promise<HitWithDrawRow[]> {
  await ensureSchema();
  return select<HitWithDrawRow>(
    `SELECT h.*, d.\`date\` AS date, d.week, d.red, d.blue
     FROM hit_records h
     JOIN draws d ON d.code = h.draw_code
     WHERE h.user_id = ?
     ORDER BY h.draw_code DESC`,
    [userId]
  );
}

/* ====== meta ====== */

export async function setMeta(key: string, value: string): Promise<void> {
  await ensureSchema();
  await execute(
    "INSERT INTO app_meta (meta_key, value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at)",
    [key, value, Date.now()]
  );
}

export async function getMeta(key: string): Promise<string | null> {
  await ensureSchema();
  const rows = await select<{ value: string }>("SELECT value FROM app_meta WHERE meta_key = ?", [key]);
  return rows[0]?.value ?? null;
}
