import { BetsEditor } from "./editor";
import { latestDraw, listBets } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";

function nextExpected(latestCode: string | null): string | null {
  if (!latestCode) return null;
  const year = parseInt(latestCode.slice(0, 4), 10);
  const seq = parseInt(latestCode.slice(4), 10);
  if (seq >= 156) return `${year + 1}001`;
  return `${year}${String(seq + 1).padStart(3, "0")}`;
}

export default async function BetsPage() {
  noStore();
  const latest = latestDraw();
  const bets = listBets(false).map((b) => ({
    ...b,
    type: b.type as "single" | "complex" | "danTuo",
    payload: JSON.parse(b.payload),
  }));
  const defaultStartCode = nextExpected(latest?.code ?? null);
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h1 className="text-lg font-semibold">守号管理</h1>
        <p className="text-sm text-ink-100 mt-1">
          支持单式（6红+1蓝）、复式（6~20红 + 1~16蓝）、胆拖（1~5红胆 + 红拖 + 1~16蓝）。
          每个守号可独立设置"每期是否购买"开关、单注金额（默认 2 元）和"从哪期开始守"。
        </p>
      </div>
      <BetsEditor initial={bets} defaultStartCode={defaultStartCode} />
    </div>
  );
}
