import type { NextResponse } from "next/server";
import { getBearerUid } from "./jwt";
import { unauthorized } from "./response";

/**
 * 鉴权辅助：成功返回 uid，失败返回 HTTP 401 响应。
 * 路由里用 `typeof auth === "number"` 区分。
 */
export async function requireUid(req: Request): Promise<number | NextResponse> {
  const uid = await getBearerUid(req);
  if (!uid) return unauthorized();
  return uid;
}
