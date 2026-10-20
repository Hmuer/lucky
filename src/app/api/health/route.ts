import { NextResponse } from "next/server";
import { latestDraw } from "@/lib/db";

// 健康检查每次实时读 SQLite，不做构建期静态化
export const dynamic = "force-dynamic";

/** 部署/监控用健康检查：服务与数据库可用时返回 200 */
export async function GET() {
  try {
    const latest = latestDraw();
    return NextResponse.json({
      ok: true,
      latest: latest?.code ?? null,
      time: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 503 }
    );
  }
}
