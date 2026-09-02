import { BetsEditor } from "./editor";
import { listBets } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BetsPage() {
  const bets = listBets(false).map((b) => ({
    ...b,
    type: b.type as "single" | "complex" | "danTuo",
    payload: JSON.parse(b.payload),
  }));
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h1 className="text-lg font-semibold">守号管理</h1>
        <p className="text-sm text-ink-500 mt-1">
          支持单式（6红+1蓝）、复式（7~20红 + 1~16蓝）、胆拖（1~5红胆 + 红拖 + 1~16蓝）。
          每个守号可独立设置"每期是否购买"开关和单注金额（默认 2 元）。
        </p>
      </div>
      <BetsEditor initial={bets} />
    </div>
  );
}
