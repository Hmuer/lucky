import { NextResponse } from "next/server";
import { createBet, deleteBet, listBets, updateBet } from "@/lib/db";
import { normalizeBetPayload, validateBet } from "@/lib/sync/adapter";

export async function GET() {
  return NextResponse.json({ bets: listBets(false) });
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
  const id = createBet({
    name: String(b.name ?? "未命名"),
    type,
    payload,
    unit_price: Math.max(100, parseInt(String(b.unit_price ?? "200"), 10) || 200),
    buy_enabled: b.buy_enabled ? 1 : 0,
  });
  return NextResponse.json({ id });
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
  updateBet(id, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get("id") ?? "0", 10);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteBet(id);
  return NextResponse.json({ ok: true });
}
