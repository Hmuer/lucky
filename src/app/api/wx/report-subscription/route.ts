import { setSubscription } from "@/lib/db";
import { requireUid } from "@/lib/wx/auth";
import { fail, ok } from "@/lib/wx/response";

export const dynamic = "force-dynamic";

/** POST /api/wx/report-subscription  { accepted: boolean } */
export async function POST(req: Request) {
  const auth = await requireUid(req);
  if (typeof auth !== "number") return auth;

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  if (typeof body?.accepted !== "boolean") {
    return fail(40001, "accepted 必须是 boolean");
  }

  await setSubscription(auth, body.accepted);
  return ok({ accepted: body.accepted });
}
