import { Balls } from "@/components/Balls";
import { SyncButton } from "@/components/SyncButton";
import { getMeta, listBets, listHitsByDraw, latestDraw } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtYuan(cents: number) {
  return (cents / 100).toLocaleString("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });
}

export default async function HomePage() {
  noStore();
  const latest = latestDraw();
  const bets = listBets(true);
  const lastSync = getMeta("last_sync_at");

  // 启动时异步触发一次同步（不阻塞首屏）
  if (!latest) {
    const { ensureLatestSeed } = await import("@/lib/sync/runner");
    ensureLatestSeed();
  }

  if (!latest) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold mb-2">还没有数据</h1>
        <p className="text-sm text-ink-500 mb-4">点下面的按钮同步一次中彩网开奖数据。</p>
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
            <div className="text-xs text-ink-500">最近一期</div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-2xl font-bold tracking-wide">{latest.code}</span>
              <span className="text-sm text-ink-500">{latest.date}（{latest.week}）</span>
            </div>
            <div className="mt-4">
              <Balls red={latest.red.split(",").map(Number)} blue={[parseInt(latest.blue, 10)]} size={11} />
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-ink-500 text-xs">销售额</div>
                <div className="font-mono">{(latest.sales ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-ink-500 text-xs">奖池</div>
                <div className="font-mono">{(latest.poolmoney ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-ink-500 text-xs">一等注数</div>
                <div className="font-mono">{latest.prize1_count} × {fmtYuan(latest.prize1_amount ?? 0)}</div>
              </div>
              <div>
                <div className="text-ink-500 text-xs">二等注数</div>
                <div className="font-mono">{latest.prize2_count} × {fmtYuan(latest.prize2_amount ?? 0)}</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <SyncButton />
            {lastSync && <span className="text-xs text-ink-500">最近同步：{new Date(lastSync).toLocaleString()}</span>}
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold mb-3">当期核对</h2>
        {bets.length === 0 ? (
          <div className="text-sm text-ink-500">
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
                    <td>{b.type}</td>
                    <td>{hit?.units ?? "-"}</td>
                    <td className="font-mono">{hit ? fmtYuan(hit.cost) : "-"}</td>
                    <td>
                      {hit && hit.breakdown ? <BreakdownView breakdown={hit.breakdown} /> : <span className="text-ink-500">-</span>}
                    </td>
                    <td className="font-mono">{hit ? fmtYuan(hit.win_amount) : "-"}</td>
                    <td className={`font-mono ${hit ? (hit.win_amount - hit.cost >= 0 ? "text-emerald-700" : "text-red-700") : ""}`}>
                      {hit ? fmtYuan(hit.win_amount - hit.cost) : "-"}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-ink-50 font-semibold">
                <td colSpan={3}>合计</td>
                <td className="font-mono">{fmtYuan(totalCost)}</td>
                <td></td>
                <td className="font-mono">{fmtYuan(totalWin)}</td>
                <td className={`font-mono ${totalWin - totalCost >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmtYuan(totalWin - totalCost)}</td>
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
  if (entries.length === 0) return <span className="text-ink-500">未中奖</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map((e) => (
        <span key={e.tier} className="px-2 py-0.5 rounded bg-ink-100 text-xs">
          {e.tier}等 × {e.count}
        </span>
      ))}
    </div>
  );
}
