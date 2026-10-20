/**
 * 一次性迁移：SQLite(data/ssq.db) → TDSQL-C MySQL 8.0
 *
 * 用法：
 *   ./scripts/npm.sh run migrate:mysql
 *
 * 连接串从 .env.local 的 DATABASE_URL 读取；脚本会：
 * 1. 创建数据库（如果不存在）
 * 2. 建表（IF NOT EXISTS）
 * 3. 在一个事务里 upsert draws / bets / hit_records / app_meta
 * 4. 校验行数与金额合计
 *
 * 可重复执行，不会清空已有数据。
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createConnection } from "mysql2/promise";
import {
  closePool,
  ensureSchema,
  findOrCreateUserByOpenid,
  getPool,
  upsertDraws,
  upsertHitRecords,
  withTransaction,
  type DrawRow,
  type HitRow,
} from "../src/lib/db/index";

function loadEnvLocal(): void {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("缺少 DATABASE_URL，请先配置 .env.local");

  const url = new URL(raw);
  const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!dbName || !/^[A-Za-z0-9_]+$/.test(dbName)) {
    throw new Error(`数据库名不合法: ${dbName}`);
  }

  const base = {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    charset: "utf8mb4",
  };

  console.log(`[migrate] 目标: ${url.hostname}:${url.port || 3306}/${dbName}`);
  const admin = await createConnection(base);
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await admin.end();

  await ensureSchema();

  const sqlitePath = path.resolve("data/ssq.db");
  if (!fs.existsSync(sqlitePath)) throw new Error(`找不到 SQLite 文件: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true });

  const draws = sqlite.prepare("SELECT * FROM draws ORDER BY code ASC").all() as DrawRow[];
  const bets = sqlite.prepare("SELECT * FROM bets ORDER BY id ASC").all() as any[];
  const hits = sqlite.prepare("SELECT * FROM hit_records ORDER BY id ASC").all() as HitRow[];
  const meta = sqlite.prepare("SELECT * FROM app_meta").all() as { key: string; value: string; updated_at: number }[];
  const sqliteSums = sqlite
    .prepare("SELECT COUNT(*) n, COALESCE(SUM(cost),0) cost, COALESCE(SUM(win_amount),0) win FROM hit_records")
    .get() as { n: number; cost: number; win: number };

  console.log(
    `[migrate] SQLite: draws=${draws.length} bets=${bets.length} hits=${hits.length} meta=${meta.length}`
  );

  const defaultUser = await findOrCreateUserByOpenid(process.env.DEFAULT_USER_OPENID || "__default__");
  const hitsWithUser = hits.map((h) => ({ ...h, user_id: defaultUser.id }));

  await withTransaction(async (conn) => {
    await upsertDraws(draws, conn);

    for (const b of bets) {
      await conn.execute(
        `INSERT INTO bets (id, user_id, name, type, payload, unit_price, buy_enabled, active, start_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           user_id=VALUES(user_id), name=VALUES(name), type=VALUES(type), payload=VALUES(payload),
           unit_price=VALUES(unit_price), buy_enabled=VALUES(buy_enabled),
           active=VALUES(active), start_code=VALUES(start_code),
           created_at=VALUES(created_at), updated_at=VALUES(updated_at)`,
        [
          b.id,
          defaultUser.id,
          b.name,
          b.type,
          b.payload,
          b.unit_price,
          b.buy_enabled,
          b.active,
          b.start_code,
          b.created_at,
          b.updated_at,
        ]
      );
    }

    await upsertHitRecords(hitsWithUser, conn);

    for (const m of meta) {
      await conn.execute(
        `INSERT INTO app_meta (meta_key, value, updated_at) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at)`,
        [m.key, m.value, m.updated_at]
      );
    }
  });

  const pool = getPool();
  const [countRows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM draws) AS draws,
       (SELECT COUNT(*) FROM bets) AS bets,
       (SELECT COUNT(*) FROM hit_records) AS hits,
       (SELECT COUNT(*) FROM app_meta) AS meta`
  );
  const [sumRows] = await pool.query(
    "SELECT COALESCE(SUM(cost),0) AS cost, COALESCE(SUM(win_amount),0) AS win FROM hit_records"
  );
  const counts = (countRows as any[])[0];
  const sums = (sumRows as any[])[0];

  console.log(
    `[migrate] MySQL: draws=${counts.draws} bets=${counts.bets} hits=${counts.hits} meta=${counts.meta}`
  );
  console.log(
    `[migrate] 金额: SQLite cost=${sqliteSums.cost} win=${sqliteSums.win} | MySQL cost=${sums.cost} win=${sums.win}`
  );

  if (
    Number(counts.draws) !== draws.length ||
    Number(counts.bets) !== bets.length ||
    Number(counts.hits) !== hits.length ||
    Number(sums.cost) !== Number(sqliteSums.cost) ||
    Number(sums.win) !== Number(sqliteSums.win)
  ) {
    throw new Error("迁移校验失败：行数或金额合计不一致");
  }

  sqlite.close();
  await closePool();
  console.log("[migrate] 完成，校验通过。");
}

main().catch((e) => {
  console.error("[migrate] 失败:", e?.message ?? e);
  process.exit(1);
});
