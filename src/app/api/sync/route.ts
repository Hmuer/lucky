import { NextResponse } from "next/server";
import { syncLatest, syncOne } from "@/lib/sync/runner";

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const r = body?.code ? await syncOne(String(body.code)) : await syncLatest();
  return NextResponse.json(r);
}

export async function GET() {
  const r = await syncLatest();
  return NextResponse.json(r);
}
