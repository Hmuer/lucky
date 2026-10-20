import { wxAppId, wxAppSecret } from "./config";
import { fetchJson } from "./http";

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

interface CachedToken {
  token: string;
  /** 提前 300 秒过期，避免临界点使用旧 token */
  expiresAt: number;
}

const EXPIRY_SKEW_SECONDS = 300;
let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestToken(): Promise<string> {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", wxAppId());
  url.searchParams.set("secret", wxAppSecret());

  const result = await fetchJson<TokenResponse>(url.toString());
  if (result.errcode || !result.access_token) {
    console.error("[wx] access_token failed", result.errcode ?? "no-token", result.errmsg ?? "");
    throw new Error("获取微信 access_token 失败");
  }

  const expiresIn = Math.max(60, Number(result.expires_in || 7200) - EXPIRY_SKEW_SECONDS);
  cached = {
    token: result.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return result.access_token;
}

/**
 * 获取 access_token：
 * - 全局缓存，提前 300 秒刷新
 * - single-flight：并发调用只发起一次刷新
 * - 刷新失败重试 1 次
 * - force=true 用于 40001 token 失效后强制刷新
 */
export async function getAccessToken(force = false): Promise<string> {
  if (!force && cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  if (force && inflight) {
    try {
      await inflight;
    } catch {}
  }

  if (!inflight) {
    inflight = (async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await requestToken();
        } catch (e) {
          lastError = e;
          if (attempt === 0) await sleep(500);
        }
      }
      throw lastError instanceof Error ? lastError : new Error("获取微信 access_token 失败");
    })().finally(() => {
      inflight = null;
    });
  }

  return inflight;
}

/** 仅供测试/诊断使用 */
export function resetAccessTokenCache(): void {
  cached = null;
  inflight = null;
}
