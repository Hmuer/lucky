import { requireUid } from "@/lib/wx/auth";
import { subscribeTemplateId } from "@/lib/wx/config";
import { ok } from "@/lib/wx/response";

export const dynamic = "force-dynamic";

/** GET /api/wx/subscribe-config */
export async function GET(req: Request) {
  const auth = await requireUid(req);
  if (typeof auth !== "number") return auth;
  return ok({ templateId: subscribeTemplateId() });
}
