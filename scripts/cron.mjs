#!/usr/bin/env node
/**
 * 独立轮询进程：每个开奖日 21:30 起每 5 分钟拉一次，拿到最新一期即停
 * 用法：node scripts/cron.mjs  （需把 cwd 切到项目根）
 */
import { setTimeout as sleep } from "node:timers/promises";

const URL = "http://localhost:3000/api/sync";

const POLL_MS = 5 * 60 * 1000;
const START_HOUR = 21;
const START_MIN = 30;

function nowInBeijing() {
  const d = new Date();
  return { h: d.getHours(), m: d.getMinutes(), w: d.getDay() };
}

async function tick() {
  const { h, m, w } = nowInBeijing();
  const isDrawDay = w === 0 || w === 2 || w === 4; // 周日/二/四
  const afterStart = h > START_HOUR || (h === START_HOUR && m >= START_MIN);
  if (isDrawDay && afterStart) {
    try {
      const r = await fetch(URL, { method: "POST" });
      const j = await r.json();
      console.log(`[cron] sync:`, j);
    } catch (e) {
      console.error(`[cron] sync failed:`, e?.message ?? e);
    }
  } else {
    console.log(`[cron] sleep (day=${w} time=${h}:${m})`);
  }
}

(async () => {
  console.log(`[cron] started, polling every ${POLL_MS}ms`);
  // 启动后立即跑一次
  await tick();
  while (true) {
    await sleep(POLL_MS);
    await tick();
  }
})();
