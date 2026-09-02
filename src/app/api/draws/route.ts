import { NextResponse } from "next/server";
import { latestDraw, listDraws } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  return NextResponse.json({ latest: latestDraw(), list: listDraws(limit) });
}
