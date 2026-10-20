import { loginWithCode } from "@/lib/wx/login";
import { fail, ok } from "@/lib/wx/response";

export const dynamic = "force-dynamic";

/** POST /api/wx/login  { code } */
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) return fail(40101, "登录失败");

  try {
    const result = await loginWithCode(code);
    return ok({ token: result.token, isNew: result.isNew });
  } catch (e: any) {
    console.error("[wx/login]", e?.message ?? e);
    return fail(40101, "登录失败");
  }
}
