import { deleteBet, getBet, updateBet } from "@/lib/db";
import { normalizeBetPayload, validateBet } from "@/lib/sync/adapter";
import { resyncBet } from "@/lib/sync/runner";
import { requireUid } from "@/lib/wx/auth";
import { fail, ok } from "@/lib/wx/response";

export const dynamic = "force-dynamic";

interface Ctx {
  params: { id: string };
}

/** PUT /api/wx/bets/:id — 只能改自己的守号 */
export async function PUT(req: Request, { params }: Ctx) {
  const auth = await requireUid(req);
  if (typeof auth !== "number") return auth;

  const id = parseInt(params.id, 10);
  if (!id) return fail(40001, "id 不合法");

  const existing = await getBet(id, auth);
  if (!existing) return fail(40401, "守号不存在");

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const patch: any = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.unit_price !== undefined) {
    patch.unit_price = Math.max(100, parseInt(String(body.unit_price), 10) || 200);
  }
  if (body.buy_enabled !== undefined) patch.buy_enabled = body.buy_enabled ? 1 : 0;
  if (body.active !== undefined) patch.active = body.active ? 1 : 0;
  if (body.start_code !== undefined) {
    if (body.start_code && !/^\d{7}$/.test(String(body.start_code))) {
      return fail(40001, "start_code 必须是 7 位期号");
    }
    patch.start_code = body.start_code || null;
  }

  if (body.payload !== undefined) {
    const type = body.type ?? existing.type;
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
    patch.payload = payload;
  }

  try {
    await updateBet(id, patch, auth);
    let resync: { recalc: number; deleted: number } | null = null;
    try {
      resync = await resyncBet(id, auth);
    } catch (e: any) {
      console.error("[wx/bets] resync failed", e?.message ?? e);
    }
    return ok({ ok: true, resync });
  } catch (e: any) {
    console.error("[wx/bets] update failed", e?.message ?? e);
    return fail(50001, "修改守号失败");
  }
}

/** DELETE /api/wx/bets/:id — 只能删自己的守号 */
export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireUid(req);
  if (typeof auth !== "number") return auth;

  const id = parseInt(params.id, 10);
  if (!id) return fail(40001, "id 不合法");

  const existing = await getBet(id, auth);
  if (!existing) return fail(40401, "守号不存在");

  await deleteBet(id, auth);
  return ok({ ok: true });
}
