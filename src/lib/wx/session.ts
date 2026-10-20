import { wxAppId, wxAppSecret } from "./config";
import { fetchJson } from "./http";

interface SessionResponse {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/** 用小程序 code 换取 openid；失败抛错，调用方统一转为 40101 */
export async function jscode2session(code: string): Promise<string> {
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", wxAppId());
  url.searchParams.set("secret", wxAppSecret());
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  const result = await fetchJson<SessionResponse>(url.toString());
  if (result.errcode || !result.openid) {
    console.error("[wx] jscode2session failed", result.errcode ?? "no-openid", result.errmsg ?? "");
    throw new Error("微信登录失败");
  }
  return result.openid;
}
