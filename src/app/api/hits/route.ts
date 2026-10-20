import { NextResponse } from "next/server";
import { getDraw, listAllHits, listBets, listHitsByDraw, listDraws } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const [draw, hits, bets] = await Promise.all([
      getDraw(code),
      listHitsByDraw(code),
      listBets(false),
    ]);
    return NextResponse.json({ draw, hits, bets });
  }
  const [hits, bets, draws] = await Promise.all([
    listAllHits(),
    listBets(false),
    listDraws(200),
  ]);
  return NextResponse.json({ hits, bets, draws });
}
