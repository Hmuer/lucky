import { NextResponse } from "next/server";

/** 小程序统一成功响应：{ code: 0, data } */
export function ok<T>(data: T): NextResponse {
  return NextResponse.json({ code: 0, data });
}

/** 业务错误：默认 HTTP 200，由小程序根据 code 判断 */
export function fail(code: number, message: string, status = 200): NextResponse {
  return NextResponse.json({ code, message }, { status });
}

/** 鉴权失败：HTTP 401 + code 40100 */
export function unauthorized(): NextResponse {
  return NextResponse.json({ code: 40100, message: "未登录" }, { status: 401 });
}
