import { NextResponse } from "next/server";
import { getDraw, listAllHits, listBets, listHitsByDraw, listDraws } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    return NextResponse.json({
      draw: getDraw(code),
      hits: listHitsByDraw(code),
      bets: listBets(false),
    });
  }
  return NextResponse.json({
    hits: listAllHits(),
    bets: listBets(false),
    draws: listDraws(200),
  });
}
