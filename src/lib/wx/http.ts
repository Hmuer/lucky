/** 带超时的 JSON fetch；错误信息不包含完整 URL（避免泄漏 appsecret） */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 10_000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`微信接口返回非 JSON（HTTP ${res.status}）`);
    }
    if (!res.ok) {
      throw new Error(`微信接口 HTTP ${res.status}`);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}
