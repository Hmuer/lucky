import { Balls } from "@/components/Balls";
import { listAllHits, listBets, listDraws } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";

function fmtYuan(cents: number) {
  return (cents / 100).toLocaleString("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });
}

export default async function HistoryPage() {
  noStore();
  const draws = listDraws(100);
  const bets = listBets(false);
  const hits = listAllHits();
  const hitsByCode = new Map<string, typeof hits>();
  for (const h of hits) {
    if (!hitsByCode.has(h.draw_code)) hitsByCode.set(h.draw_code, [] as any);
    hitsByCode.get(h.draw_code)!.push(h);
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h1 className="text-lg font-semibold">开奖记录</h1>
        <p className="text-sm text-ink-100 mt-1">展示每一期开奖号码与各守号命中情况。</p>
      </div>

      {draws.length === 0 && <div className="card p-6 text-sm text-ink-100">暂无数据，请先在首页点击「立即同步开奖」。</div>}

      {draws.map((d) => {
        const rowHits = hitsByCode.get(d.code) ?? [];
        const totalWin = rowHits.reduce((s, h) => s + h.win_amount, 0);
        const totalCost = rowHits.reduce((s, h) => s + h.cost, 0);
        return (
          <div key={d.code} className="card p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs text-ink-100">{d.date}（{d.week}）</div>
                <div className="flex items-baseline gap-3">
                  <span className="text-xl font-bold tracking-wide">{d.code}</span>
                  <Balls red={d.red.split(",").map(Number)} blue={[parseInt(d.blue, 10)]} size={9} />
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="text-ink-100">当期盈亏</div>
                <div className={`font-mono text-lg ${totalWin - totalCost >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {fmtYuan(totalWin - totalCost)}
                </div>
                <div className="text-xs text-ink-100">花费 {fmtYuan(totalCost)} · 中奖 {fmtYuan(totalWin)}</div>
              </div>
            </div>

            {rowHits.length === 0 ? (
              <div className="text-sm text-ink-100 mt-3">当期没有参与核对的守号。</div>
            ) : (
              <table className="tbl mt-3">
                <thead>
                  <tr>
                    <th>守号</th>
                    <th>注数</th>
                    <th>花费</th>
                    <th>命中</th>
                    <th>奖金</th>
                    <th>盈亏</th>
                  </tr>
                </thead>
                <tbody>
                  {rowHits.map((h) => {
                    const bet = bets.find((b) => b.id === h.bet_id);
                    const bd = JSON.parse(h.breakdown) as Record<string, { count: number; amount: number }>;
                    const summary = Object.entries(bd).map(([k, v]) => `${k}等×${v.count}`).join(" / ") || "未中奖";
                    return (
                      <tr key={h.id}>
                        <td className="font-medium">{bet?.name ?? `#${h.bet_id}`}</td>
                        <td>{h.units}</td>
                        <td className="font-mono">{fmtYuan(h.cost)}</td>
                        <td>{summary}</td>
                        <td className="font-mono">{fmtYuan(h.win_amount)}</td>
                        <td className={`font-mono ${h.win_amount - h.cost >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtYuan(h.win_amount - h.cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
