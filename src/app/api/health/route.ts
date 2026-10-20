import { NextResponse } from "next/server";
import { latestDraw } from "@/lib/db";
import { ensureLatestSeed, startScheduler } from "@/lib/sync/runner";

// 健康检查每次实时读 MySQL，不做构建期静态化
export const dynamic = "force-dynamic";

/** 部署/监控用健康检查：服务与数据库可用时返回 200 */
export async function GET() {
  try {
    const latest = await latestDraw();
    // 部署/监控的健康检查同时充当启动预热：确保定时器在无人访问首页时也能启动
    void ensureLatestSeed();
    startScheduler();
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
