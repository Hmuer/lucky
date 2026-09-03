/**
 * Next.js 14 App Router 的进程级入口
 * 在 server 启动时执行一次。
 * 用于：
 *   1. 触发首次同步（历史回填 / 增量同步）
 *   2. 启动进程内定时器（每 30 分钟拉一次最新开奖）
 */

export async function register() {
  // 仅在 Node.js runtime 执行（不要在 edge runtime 跑）
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureLatestSeed, startScheduler } = await import("@/lib/sync/runner");
  ensureLatestSeed();
  startScheduler();
}
