import { Balls } from "@/components/Balls";
import { SyncButton } from "@/components/SyncButton";
import { getMeta, listBets, listHitsByDraw, latestDraw } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtYuan(cents: number) {
  return (cents / 100).toLocaleString("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });
}

function typeLabel(t: string): string {
  if (t === "single") return "单式";
  if (t === "complex") return "复式";
  if (t === "danTuo") return "胆拖";
  return t;
}

// 用 globalThis 做模块级单例：避免多次 SSR 请求 / HMR 时重复启动定时器
declare global {
  // eslint-disable-next-line no-var
  var __ssq_scheduler_started: boolean | undefined;
  // eslint-disable-next-line no-var
  var __ssq_seed_started: boolean | undefined;
}

/** 懒启动：第一次 SSR 时触发首次回填 + 启动定时同步 */
async function bootstrapSyncOnce() {
  if (!globalThis.__ssq_seed_started) {
    globalThis.__ssq_seed_started = true;
    const { ensureLatestSeed } = await import("@/lib/sync/runner");
    ensureLatestSeed();
  }
  if (!globalThis.__ssq_scheduler_started) {
    globalThis.__ssq_scheduler_started = true;
    const { startScheduler } = await import("@/lib/sync/runner");
    startScheduler();
  }
}

export default async function HomePage() {
  noStore();
  const latest = latestDraw();
  const bets = listBets(true);
  const lastSync = getMeta("last_sync_at");

  // 第一次 SSR 时异步触发同步（不阻塞首屏）
  // 用 await 让请求的尾段才执行，保证不阻塞首字节返回
  void bootstrapSyncOnce();

  if (!latest) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold mb-2">还没有数据</h1>
        <p className="text-sm text-ink-100 mb-4">首次启动正在自动拉取中彩网历史开奖数据，请稍等几十秒到一两分钟，刷新页面即可。</p>
        <SyncButton />
      </div>
    );
  }

  const hits = listHitsByDraw(latest.code);
  const totalWin = hits.reduce((s, h) => s + h.win_amount, 0);
  const totalCost = hits.reduce((s, h) => s + h.cost, 0);

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs text-ink-100">最近一期</div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-2xl font-bold tracking-wide">{latest.code}</span>
              <span className="text-sm text-ink-100">{latest.date}（{latest.week}）</span>
            </div>
            <div className="mt-4">
              <Balls red={latest.red.split(",").map(Number)} blue={[parseInt(latest.blue, 10)]} size={11} />
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-ink-100 text-xs">销售额</div>
                <div className="font-mono">{(latest.sales ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-ink-100 text-xs">奖池</div>
                <div className="font-mono">{(latest.poolmoney ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-ink-100 text-xs">一等注数</div>
                <div className="font-mono">{latest.prize1_count} × {fmtYuan(latest.prize1_amount ?? 0)}</div>
              </div>
              <div>
                <div className="text-ink-100 text-xs">二等注数</div>
                <div className="font-mono">{latest.prize2_count} × {fmtYuan(latest.prize2_amount ?? 0)}</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <SyncButton />
            {lastSync && <span className="text-xs text-ink-100">最近同步：{new Date(lastSync).toLocaleString()}</span>}
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold mb-3">当期核对</h2>
        {bets.length === 0 ? (
          <div className="text-sm text-ink-100">
            还没有守号，<a className="underline" href="/bets">去添加</a>。
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>守号</th>
                <th>类型</th>
                <th>注数</th>
                <th>花费</th>
                <th>命中</th>
                <th>奖金</th>
                <th>盈亏</th>
              </tr>
            </thead>
            <tbody>
              {bets.map((b) => {
                const hit = hits.find((h) => h.bet_id === b.id);
                const cost = hit?.cost ?? b.buy_enabled ? b.unit_price : 0;
                const win = hit?.win_amount ?? 0;
                return (
                  <tr key={b.id}>
                    <td className="font-medium">{b.name}</td>
                    <td>{typeLabel(b.type)}</td>
                    <td>{hit?.units ?? "-"}</td>
                    <td className="font-mono">{hit ? fmtYuan(hit.cost) : "-"}</td>
                    <td>
                      {hit && hit.breakdown ? <BreakdownView breakdown={hit.breakdown} /> : <span className="text-ink-100">-</span>}
                    </td>
                    <td className="font-mono">{hit ? fmtYuan(hit.win_amount) : "-"}</td>
                    <td className={`font-mono ${hit ? (hit.win_amount - hit.cost >= 0 ? "text-emerald-400" : "text-rose-400") : ""}`}>
                      {hit ? fmtYuan(hit.win_amount - hit.cost) : "-"}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-ink-700 font-semibold">
                <td colSpan={3}>合计</td>
                <td className="font-mono">{fmtYuan(totalCost)}</td>
                <td></td>
                <td className="font-mono">{fmtYuan(totalWin)}</td>
                <td className={`font-mono ${totalWin - totalCost >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtYuan(totalWin - totalCost)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function BreakdownView({ breakdown }: { breakdown: string }) {
  const bd = JSON.parse(breakdown) as Record<string, { count: number; amount: number }>;
  const entries = Object.entries(bd).map(([k, v]) => ({ tier: parseInt(k, 10), ...v }));
  if (entries.length === 0) return <span className="text-ink-100">未中奖</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map((e) => (
        <span key={e.tier} className="px-2 py-0.5 rounded bg-ink-500 text-xs">
          {e.tier}等 × {e.count}
        </span>
      ))}
    </div>
  );
}