import { NextResponse } from "next/server";
import { syncAndNotify, syncOne } from "@/lib/sync/runner";

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const r = body?.code ? await syncOne(String(body.code)) : await syncAndNotify();
  return NextResponse.json(r);
}

export async function GET() {
  const r = await syncAndNotify();
  return NextResponse.json(r);
}
