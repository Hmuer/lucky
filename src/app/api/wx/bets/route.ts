import { createBet, listBets } from "@/lib/db";
import { normalizeBetPayload, validateBet } from "@/lib/sync/adapter";
import { resyncBet } from "@/lib/sync/runner";
import { requireUid } from "@/lib/wx/auth";
import { nextExpectedCode } from "@/lib/wx/next";
import { fail, ok } from "@/lib/wx/response";
import { betJson } from "@/lib/wx/serialize";

export const dynamic = "force-dynamic";

/** GET /api/wx/bets — 当前用户守号列表 */
export async function GET(req: Request) {
  const auth = await requireUid(req);
  if (typeof auth !== "number") return auth;

  const [bets, nextDrawCode] = await Promise.all([
    listBets(false, auth),
    nextExpectedCode(),
  ]);
  return ok({ bets: bets.map(betJson), nextDrawCode });
}

/**
 * POST /api/wx/bets
 * 字段与网页端一致：
 * { name, type: single|complex|danTuo, payload, unit_price, buy_enabled,
 *   active, start_code, start_code_mode: all|next|custom }
 */
export async function POST(req: Request) {
  const auth = await requireUid(req);
  if (typeof auth !== "number") return auth;

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const type = body?.type;
  if (type !== "single" && type !== "complex" && type !== "danTuo") {
    return fail(40001, "type 必须是 single / complex / danTuo");
  }

  let payload: unknown;
  try {
    payload = normalizeBetPayload({ type, ...(body.payload ?? {}) } as any);
  } catch (e: any) {
    return fail(40001, e?.message ?? "号码格式错误");
  }

  const validationError = validateBet({ type, ...(payload as any) } as any);
  if (validationError) return fail(40001, validationError);

  const mode = body?.start_code_mode;
  let startCode: string | null;
  if (mode === "all") {
    startCode = null;
  } else if (mode === "custom") {
    startCode = body?.start_code ?? (await nextExpectedCode());
  } else {
    startCode = body?.start_code ?? (await nextExpectedCode());
  }
  if (startCode && !/^\d{7}$/.test(String(startCode))) {
    return fail(40001, "start_code 必须是 7 位期号");
  }

  try {
    const id = await createBet(
      {
        name: String(body?.name ?? "未命名"),
        type,
        payload,
        unit_price: Math.max(100, parseInt(String(body?.unit_price ?? "200"), 10) || 200),
        buy_enabled: body?.buy_enabled === false ? 0 : 1,
        active: body?.active === false ? 0 : 1,
        start_code: startCode,
      },
      auth
    );

    let resync: { recalc: number; deleted: number } | null = null;
    try {
      resync = await resyncBet(id, auth);
    } catch (e: any) {
      console.error("[wx/bets] resync failed", e?.message ?? e);
    }
    return ok({ id, resync });
  } catch (e: any) {
    console.error("[wx/bets] create failed", e?.message ?? e);
    return fail(50001, "创建守号失败");
  }
}
