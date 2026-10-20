import { syncAndNotify } from "@/lib/sync/runner";
import { requireUid } from "@/lib/wx/auth";
import { fail, ok } from "@/lib/wx/response";

export const dynamic = "force-dynamic";

/**
 * POST /api/wx/sync
 * - 小程序用户：Bearer token
 * - 外部定时器：请求头 x-cron-secret 必须等于 CRON_SECRET
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET ?? "";
  const supplied = req.headers.get("x-cron-secret") ?? "";
  const isCron = expected.length > 0 && supplied === expected;

  if (!isCron) {
    const auth = await requireUid(req);
    if (typeof auth !== "number") return auth;
  }

  try {
    const result = await syncAndNotify();
    if (result.errors.length && result.saved === 0) {
      return fail(50001, result.errors.join("; "));
    }
    return ok(result);
  } catch (e: any) {
    console.error("[wx/sync]", e?.message ?? e);
    return fail(50001, "同步失败");
  }
}
