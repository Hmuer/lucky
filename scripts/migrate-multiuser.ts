/**
 * 多用户改造迁移（在现有 MySQL/TDSQL-C 上执行一次）
 *
 * 1. 创建 users / subscriptions 表（ensureSchema）
 * 2. bets / hit_records 增加 user_id 列
 * 3. 创建默认用户（DEFAULT_USER_OPENID，缺省 __default__）
 * 4. 把存量 bets / hit_records 归属到默认用户
 * 5. 加索引、外键，user_id 改为 NOT NULL
 * 6. 校验没有遗留的 NULL user_id
 *
 * 用法：
 *   ./scripts/npm.sh run migrate:multiuser
 */
import fs from "node:fs";
import path from "node:path";
import {
  closePool,
  ensureSchema,
  findOrCreateUserByOpenid,
  getPool,
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
  if (!process.env.DATABASE_URL) throw new Error("缺少 DATABASE_URL");

  await ensureSchema();
  const pool = getPool();

  const [columns] = await pool.query<any[]>(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('bets','hit_records')
       AND COLUMN_NAME = 'user_id'`
  );
  const have = new Set((columns as any[]).map((c) => `${c.TABLE_NAME}.${c.COLUMN_NAME}`));

  if (!have.has("bets.user_id")) {
    console.log("[multiuser] ALTER bets ADD user_id");
    await pool.query("ALTER TABLE bets ADD COLUMN user_id INT NULL AFTER id");
  }
  if (!have.has("hit_records.user_id")) {
    console.log("[multiuser] ALTER hit_records ADD user_id");
    await pool.query("ALTER TABLE hit_records ADD COLUMN user_id INT NULL AFTER id");
  }

  const openid = process.env.DEFAULT_USER_OPENID || "__default__";
  const defaultUser = await findOrCreateUserByOpenid(openid);
  console.log(`[multiuser] 默认用户 id=${defaultUser.id} openid=${openid} isNew=${defaultUser.isNew}`);

  await pool.query("UPDATE bets SET user_id = ? WHERE user_id IS NULL", [defaultUser.id]);
  await pool.query(
    `UPDATE hit_records h
     JOIN bets b ON b.id = h.bet_id
     SET h.user_id = b.user_id
     WHERE h.user_id IS NULL`
  );
  // 理论上没有孤儿；兜底归属默认用户
  await pool.query("UPDATE hit_records SET user_id = ? WHERE user_id IS NULL", [defaultUser.id]);

  const [nullRows] = await pool.query<any[]>(
    `SELECT
       (SELECT COUNT(*) FROM bets WHERE user_id IS NULL) AS bets_null,
       (SELECT COUNT(*) FROM hit_records WHERE user_id IS NULL) AS hits_null`
  );
  const nulls = (nullRows as any[])[0];
  if (Number(nulls.bets_null) || Number(nulls.hits_null)) {
    throw new Error(`仍有 NULL user_id: bets=${nulls.bets_null} hits=${nulls.hits_null}`);
  }

  await pool.query("ALTER TABLE bets MODIFY COLUMN user_id INT NOT NULL");
  await pool.query("ALTER TABLE hit_records MODIFY COLUMN user_id INT NOT NULL");

  const [indexes] = await pool.query<any[]>(
    `SELECT TABLE_NAME, INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND ((TABLE_NAME='bets' AND INDEX_NAME='idx_bets_user')
         OR (TABLE_NAME='hit_records' AND INDEX_NAME='idx_hits_user'))`
  );
  const idx = new Set((indexes as any[]).map((r) => `${r.TABLE_NAME}.${r.INDEX_NAME}`));
  if (!idx.has("bets.idx_bets_user")) {
    await pool.query("ALTER TABLE bets ADD INDEX idx_bets_user (user_id)");
  }
  if (!idx.has("hit_records.idx_hits_user")) {
    await pool.query("ALTER TABLE hit_records ADD INDEX idx_hits_user (user_id)");
  }

  const [constraints] = await pool.query<any[]>(
    `SELECT TABLE_NAME, CONSTRAINT_NAME
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'
       AND ((TABLE_NAME='bets' AND CONSTRAINT_NAME='fk_bets_user')
         OR (TABLE_NAME='hit_records' AND CONSTRAINT_NAME='fk_hit_user'))`
  );
  const cons = new Set((constraints as any[]).map((r) => `${r.TABLE_NAME}.${r.CONSTRAINT_NAME}`));
  if (!cons.has("bets.fk_bets_user")) {
    await pool.query(
      "ALTER TABLE bets ADD CONSTRAINT fk_bets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"
    );
  }
  if (!cons.has("hit_records.fk_hit_user")) {
    await pool.query(
      "ALTER TABLE hit_records ADD CONSTRAINT fk_hit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"
    );
  }

  const [summary] = await pool.query<any[]>(
    `SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM bets) AS bets,
       (SELECT COUNT(*) FROM hit_records) AS hits,
       (SELECT COUNT(*) FROM subscriptions) AS subscriptions,
       (SELECT COUNT(DISTINCT user_id) FROM bets) AS bet_users`
  );
  console.log("[multiuser] 完成:", (summary as any[])[0]);

  await closePool();
}

main().catch((e) => {
  console.error("[multiuser] 失败:", e?.message ?? e);
  process.exit(1);
});
