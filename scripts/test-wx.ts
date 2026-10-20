/**
 * 微信模块自测（mock 微信 HTTP，不访问真实微信接口）
 *
 * 运行：
 *   ./scripts/npm.sh run test:wx
 *
 * 覆盖：
 * - jscode2session mock → 创建用户 → 签发/校验 JWT
 * - access_token 缓存 + 并发 single-flight
 * - 订阅消息 43101 静默跳过、40001 强制刷新后重试一次
 */
import {
  closePool,
  getPool,
} from "../src/lib/db/index";
import { loginWithCode } from "../src/lib/wx/login";
import { verifyToken } from "../src/lib/wx/jwt";
import {
  getAccessToken,
  resetAccessTokenCache,
} from "../src/lib/wx/accessToken";
import { sendSubscribeMessage } from "../src/lib/wx/push";
import type { DrawRow } from "../src/lib/db";

const TEST_OPENID = "__mock_openid__";

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(`断言失败: ${message}`);
  console.log(`  ✔ ${message}`);
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function main(): Promise<void> {
  process.env.WX_APPID = "test-appid";
  process.env.WX_APPSECRET = "test-secret";
  process.env.WX_SUBSCRIBE_TEMPLATE_ID = "test-template";

  // 1) 登录：mock jscode2session
  console.log("[1] 登录 mock");
  let sessionCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("sns/jscode2session")) {
      sessionCalls++;
      return json({ openid: TEST_OPENID, session_key: "mock-session" });
    }
    throw new Error(`未 mock 的请求: ${url}`);
  }) as typeof fetch;

  const login = await loginWithCode("mock-code");
  assert(login.isNew === true, "首次登录 isNew=true");
  assert(sessionCalls === 1, "jscode2session 调用一次");
  assert((await verifyToken(login.token)) === login.uid, "JWT 可解出 uid");

  const login2 = await loginWithCode("mock-code");
  assert(login2.isNew === false, "再次登录 isNew=false");

  // 2) access_token single-flight
  console.log("[2] access_token single-flight");
  resetAccessTokenCache();
  let tokenCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("cgi-bin/token")) {
      tokenCalls++;
      await new Promise((r) => setTimeout(r, 50));
      return json({ access_token: `token-${tokenCalls}`, expires_in: 7200 });
    }
    throw new Error(`未 mock 的请求: ${url}`);
  }) as typeof fetch;

  const tokens = await Promise.all([
    getAccessToken(),
    getAccessToken(),
    getAccessToken(),
    getAccessToken(),
  ]);
  assert(tokenCalls === 1, "并发 4 次只刷新一次 token");
  assert(new Set(tokens).size === 1, "并发调用拿到同一 token");

  // 3) 订阅消息 43101 / 40001
  console.log("[3] 订阅消息错误处理");
  resetAccessTokenCache();
  let sendCalls = 0;
  let pushTokenCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("cgi-bin/token")) {
      pushTokenCalls++;
      return json({ access_token: `push-token-${pushTokenCalls}`, expires_in: 7200 });
    }
    if (url.includes("message/subscribe/send")) {
      sendCalls++;
      if (sendCalls === 1) return json({ errcode: 43101, errmsg: "user refuse" });
      if (sendCalls === 2) return json({ errcode: 40001, errmsg: "invalid token" });
      return json({ errcode: 0, errmsg: "ok" });
    }
    throw new Error(`未 mock 的请求: ${url}`);
  }) as typeof fetch;

  const draw = {
    code: "2026120",
    date: "2026-10-20",
    week: "二",
    red: "13,14,16,18,20,31",
    blue: "03",
    sales: 0,
    poolmoney: 0,
    prize1_amount: 0,
    prize1_count: 0,
    prize2_amount: 0,
    prize2_count: 0,
    prize3_amount: 0,
    prize3_count: 0,
    prize4_amount: 0,
    prize4_count: 0,
    prize5_amount: 0,
    prize5_count: 0,
    prize6_amount: 0,
    prize6_count: 0,
    content: null,
    details_link: null,
    fetched_at: Date.now(),
  } as DrawRow;

  const skipped = await sendSubscribeMessage("mock-openid", draw, -2700);
  assert(skipped === false, "43101 静默跳过");
  const retried = await sendSubscribeMessage("mock-openid", draw, -2700);
  assert(retried === true, "40001 刷新 token 后重试成功");
  assert(sendCalls === 3, "共发送 3 次（43101、40001、成功）");
  assert(pushTokenCalls >= 2, "40001 触发了一次强制刷新");

  // 清理测试用户
  const pool = getPool();
  await pool.query("DELETE FROM users WHERE openid = ?", [TEST_OPENID]);
  await closePool();
  console.log("✅ 微信模块自测通过");
}

main().catch(async (e) => {
  console.error("❌", e?.message ?? e);
  try {
    const pool = getPool();
    await pool.query("DELETE FROM users WHERE openid = ?", [TEST_OPENID]);
    await closePool();
  } catch {}
  process.exit(1);
});
