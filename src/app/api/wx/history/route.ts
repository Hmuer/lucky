import { listBets, listHitsWithDraw } from "@/lib/db";
import { requireUid } from "@/lib/wx/auth";
import { ok } from "@/lib/wx/response";
import { hitJson } from "@/lib/wx/serialize";

export const dynamic = "force-dynamic";

/** GET /api/wx/history — 当前用户的历史核对，按期号倒序 */
export async function GET(req: Request) {
  const auth = await requireUid(req);
  if (typeof auth !== "number") return auth;

  const [rows, bets] = await Promise.all([
    listHitsWithDraw(auth),
    listBets(false, auth),
  ]);
  const betMap = new Map(bets.map((b) => [b.id, b]));

  const items = new Map<
    string,
    {
      draw: { code: string; date: string; week: string | null; red: number[]; blue: number };
      hits: ReturnType<typeof hitJson>[];
      summary: { cost: number; winAmount: number; profit: number };
    }
  >();

  for (const row of rows) {
    let item = items.get(row.draw_code);
    if (!item) {
      item = {
        draw: {
          code: row.draw_code,
          date: row.date,
          week: row.week,
          red: row.red.split(",").map((x) => parseInt(x, 10)),
          blue: parseInt(row.blue, 10),
        },
        hits: [],
        summary: { cost: 0, winAmount: 0, profit: 0 },
      };
      items.set(row.draw_code, item);
    }
    const hit = hitJson(row, betMap.get(row.bet_id));
    item.hits.push(hit);
    item.summary.cost += hit.cost;
    item.summary.winAmount += hit.winAmount;
    item.summary.profit += hit.profit;
  }

  return ok({ items: Array.from(items.values()) });
}
