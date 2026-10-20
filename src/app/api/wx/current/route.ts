import { latestDraw, listBets, listHitsByDraw } from "@/lib/db";
import { requireUid } from "@/lib/wx/auth";
import { ok } from "@/lib/wx/response";
import { drawJson, hitJson } from "@/lib/wx/serialize";

export const dynamic = "force-dynamic";

/** GET /api/wx/current — 最近一期 + 当前用户当期核对 */
export async function GET(req: Request) {
  const auth = await requireUid(req);
  if (typeof auth !== "number") return auth;

  const draw = await latestDraw();
  if (!draw) {
    return ok({
      draw: null,
      hits: [],
      summary: { cost: 0, winAmount: 0, profit: 0 },
    });
  }

  const [hits, bets] = await Promise.all([
    listHitsByDraw(draw.code, auth),
    listBets(false, auth),
  ]);
  const betMap = new Map(bets.map((b) => [b.id, b]));
  const items = hits.map((h) => hitJson(h, betMap.get(h.bet_id)));
  const summary = items.reduce(
    (acc, h) => {
      acc.cost += h.cost;
      acc.winAmount += h.winAmount;
      acc.profit += h.profit;
      return acc;
    },
    { cost: 0, winAmount: 0, profit: 0 }
  );

  return ok({ draw: drawJson(draw), hits: items, summary });
}
