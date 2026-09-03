import { NextResponse } from "next/server";
import { createBet, deleteBet, listBets, latestDraw, updateBet } from "@/lib/db";
import { normalizeBetPayload, validateBet } from "@/lib/sync/adapter";
import { resyncBet } from "@/lib/sync/runner";

export async function GET() {
  return NextResponse.json({
    bets: listBets(false),
    nextDrawCode: nextExpected(),
  });
}

/** 计算下一期号（用于默认 start_code） */
function nextExpected(): string | null {
  const latest = latestDraw();
  if (!latest) return null;
  const year = parseInt(latest.code.slice(0, 4), 10);
  const seq = parseInt(latest.code.slice(4), 10);
  if (seq >= 156) return `${year + 1}001`;
  return `${year}${String(seq + 1).padStart(3, "0")}`;
}

export async function POST(req: Request) {
  const b = await req.json();
  const type = b.type;
  let payload;
  try {
    payload = normalizeBetPayload({ type, ...b.payload });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
  const err = validateBet({ type, ...(payload as any) });
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  // start_code：根据 start_code_mode 决定写入的期号
  // - "all"    → null（从所有已开奖期开始结算，含早期）
  // - "next"   → nextExpected()（默认：仅结算下一期及之后）
  // - "custom" → b.start_code（用户显式指定的期号）
  // 兼容旧请求：未传 start_code_mode 时按"next"处理
  let startCode: string | null;
  const mode = b.start_code_mode;
  if (mode === "all") {
    startCode = null;
  } else if (mode === "custom") {
    startCode = b.start_code ?? nextExpected();
  } else {
    // "next" 或未传：保持原有默认行为
    startCode = b.start_code ?? nextExpected();
  }
  if (startCode && !/^\d{7}$/.test(startCode)) {
    return NextResponse.json({ error: "start_code 必须是 7 位期号，如 2026102" }, { status: 400 });
  }

  const id = createBet({
    name: String(b.name ?? "未命名"),
    type,
    payload,
    unit_price: Math.max(100, parseInt(String(b.unit_price ?? "200"), 10) || 200),
    buy_enabled: b.buy_enabled ? 1 : 0,
    start_code: startCode,
  });

  // 创建后立刻按 start_code 结算已入库期（包含 start_code 自身）
  let resync: { recalc: number; deleted: number } | null = null;
  try {
    resync = resyncBet(id);
  } catch (e: any) {
    // resync 失败不阻塞创建
    resync = { recalc: 0, deleted: 0 };
  }

  return NextResponse.json({ id, resync });
}

export async function PUT(req: Request) {
  const b = await req.json();
  const id = parseInt(String(b.id), 10);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: any = {};
  if (b.name !== undefined) patch.name = String(b.name);
  if (b.payload !== undefined) {
    const type = b.type ?? undefined;
    if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });
    const payload = normalizeBetPayload({ type, ...b.payload });
    const err = validateBet({ type, ...(payload as any) });
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    patch.payload = payload;
  }
  if (b.unit_price !== undefined) patch.unit_price = parseInt(String(b.unit_price), 10) || 200;
  if (b.buy_enabled !== undefined) patch.buy_enabled = b.buy_enabled ? 1 : 0;
  if (b.active !== undefined) patch.active = b.active ? 1 : 0;
  if (b.start_code !== undefined) {
    if (b.start_code && !/^\d{7}$/.test(String(b.start_code))) {
      return NextResponse.json({ error: "start_code 必须是 7 位期号" }, { status: 400 });
    }
    patch.start_code = b.start_code || null;
  }
  updateBet(id, patch);

  // 如果改了 start_code，触发追溯重算
  if (b.start_code !== undefined) {
    try {
      resyncBet(id);
    } catch {}
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get("id") ?? "0", 10);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteBet(id);
  return NextResponse.json({ ok: true });
}
