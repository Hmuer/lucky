/**
 * 中彩网官方开奖数据爬取
 * 接口：GET https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&pageNo=1&pageSize=N
 * 特点：
 *   - 纯 JSON，无需登录/cookie
 *   - 默认排序升序（旧→新），取最新用 pageSize=1 或自己反转
 *   - typemoney 含中文说明（如"7500000（含加奖2500000）"），需正则提取首个数字
 */

export interface CrawlRawDraw {
  code: string;
  date: string; // "2026-09-01(二)"
  week: string;
  red: string; // "05,06,08,09,24,25"
  blue: string;
  sales: string;
  poolmoney: string;
  content: string;
  prizegrades: { type: number; typenum: string; typemoney: string }[];
  detailsLink: string;
}

interface ApiResp {
  state: number;
  message: string;
  result?: CrawlRawDraw[];
}

const BASE = "https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36",
  Referer: "https://www.cwl.gov.cn/",
  Accept: "application/json, text/plain, */*",
};

export async function fetchLatestDraws(pageSize = 10): Promise<CrawlRawDraw[]> {
  const url = `${BASE}?name=ssq&pageNo=1&pageSize=${pageSize}`;
  const r = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!r.ok) throw new Error(`cwl http ${r.status}`);
  const j = (await r.json()) as ApiResp;
  if (j.state !== 0 || !j.result) throw new Error(`cwl state=${j.state} msg=${j.message}`);
  return j.result.slice().reverse(); // 倒序：最新在前
}

export async function fetchDrawByCode(code: string): Promise<CrawlRawDraw | null> {
  // 该接口不支持单期查询，拉一批再过滤
  const all = await fetchLatestDraws(50);
  return all.find((d) => d.code === code) ?? null;
}

export async function fetchDrawRange(fromCode: string, toCode: string): Promise<CrawlRawDraw[]> {
  // 简化策略：拉一页 30 条，覆盖最近一个月；如果跨多月，分页
  const out: CrawlRawDraw[] = [];
  let page = 1;
  const pageSize = 30;
  while (true) {
    const url = `${BASE}?name=ssq&pageNo=${page}&pageSize=${pageSize}`;
    const r = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!r.ok) throw new Error(`cwl http ${r.status}`);
    const j = (await r.json()) as ApiResp;
    if (j.state !== 0 || !j.result) break;
    const batch = j.result;
    for (const d of batch) {
      if (d.code >= fromCode && d.code <= toCode) out.push(d);
    }
    if (batch.length < pageSize) break;
    if (batch.every((d) => d.code < fromCode)) break;
    page++;
    if (page > 50) break; // 安全上限
  }
  return out;
}

/** 把"2026-09-01(二)" → { date:"2026-09-01", week:"二" } */
export function parseDrawDate(s: string): { date: string; week: string } {
  const re = new RegExp("^(\\d{4}-\\d{2}-\\d{2})[(（]([一二三四五六日])[)）]?$");
  const m = s.match(re);
  if (m) return { date: m[1], week: m[2] };
  return { date: s, week: "" };
}

/** 从 "7500000（含加奖2500000）" / "8,881,916" / "138806" 提取首个整数 */
export function parsePrizeMoney(s: string | null | undefined): number {
  if (!s) return 0;
  const m = String(s).match(/\d[\d,]*/);
  if (!m) return 0;
  return parseInt(m[0].replace(/,/g, ""), 10) || 0;
}

export function parseDrawRow(d: CrawlRawDraw) {
  const { date, week } = parseDrawDate(d.date);
  const tier = (t: number) => d.prizegrades.find((g) => g.type === t);
  const t1 = tier(1), t2 = tier(2), t3 = tier(3), t4 = tier(4), t5 = tier(5), t6 = tier(6);
  return {
    code: d.code,
    date,
    week,
    red: d.red,
    blue: d.blue,
    sales: parsePrizeMoney(d.sales),
    poolmoney: parsePrizeMoney(d.poolmoney),
    prize1_amount: parsePrizeMoney(t1?.typemoney),
    prize1_count: parseInt(t1?.typenum || "0", 10) || 0,
    prize2_amount: parsePrizeMoney(t2?.typemoney),
    prize2_count: parseInt(t2?.typenum || "0", 10) || 0,
    prize3_amount: parsePrizeMoney(t3?.typemoney) || 3000,
    prize3_count: parseInt(t3?.typenum || "0", 10) || 0,
    prize4_amount: parsePrizeMoney(t4?.typemoney) || 200,
    prize4_count: parseInt(t4?.typenum || "0", 10) || 0,
    prize5_amount: parsePrizeMoney(t5?.typemoney) || 10,
    prize5_count: parseInt(t5?.typenum || "0", 10) || 0,
    prize6_amount: parsePrizeMoney(t6?.typemoney) || 5,
    prize6_count: parseInt(t6?.typenum || "0", 10) || 0,
    content: d.content,
    details_link: d.detailsLink,
  };
}
