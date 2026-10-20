import { latestDraw } from "../db";

/** 下一期期号 = 最新期号 + 1（按年递增 + 期内顺序） */
export function nextCode(latestCode: string | null): string | null {
  if (!latestCode) return null;
  const year = parseInt(latestCode.slice(0, 4), 10);
  const seq = parseInt(latestCode.slice(4), 10);
  if (seq >= 156) return `${year + 1}001`;
  return `${year}${String(seq + 1).padStart(3, "0")}`;
}

export async function nextExpectedCode(): Promise<string | null> {
  const latest = await latestDraw();
  return nextCode(latest?.code ?? null);
}
