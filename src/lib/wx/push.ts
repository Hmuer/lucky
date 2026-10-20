import { getDraw, listPushTargets } from "../db";
import type { DrawRow } from "../db";
import { getAccessToken } from "./accessToken";
import { subscribePage, subscribeTemplateId, templateFields } from "./config";
import { fetchJson } from "./http";

interface SendResponse {
  errcode?: number;
  errmsg?: string;
}

interface TemplateData {
  [key: string]: { value: string };
}

function numbersText(draw: DrawRow): string {
  const red = draw.red
    .split(",")
    .map((x) => x.trim().padStart(2, "0"))
    .join(" ");
  const blue = String(draw.blue).padStart(2, "0");
  return `${red} + ${blue}`;
}

function templateData(draw: DrawRow, profitCents: number): TemplateData {
  const fields = templateFields();
  return {
    [fields.issue]: { value: draw.code },
    [fields.numbers]: { value: numbersText(draw) },
    [fields.profit]: { value: (profitCents / 100).toFixed(2) },
  };
}

async function postSubscribe(
  token: string,
  openid: string,
  templateId: string,
  data: TemplateData
): Promise<SendResponse> {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/message/subscribe/send");
  url.searchParams.set("access_token", token);
  return fetchJson<SendResponse>(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      touser: openid,
      template_id: templateId,
      page: subscribePage(),
      miniprogram_state: process.env.WX_MINIPROGRAM_STATE || "formal",
      lang: "zh_CN",
      data,
    }),
  });
}

/**
 * 给单个用户发送订阅消息。
 * - 43101：用户未订阅/额度用尽，静默跳过（只记日志）
 * - 40001：access_token 失效，强制刷新后重试一次
 * - 其他错误：记录日志，不影响其他用户
 */
export async function sendSubscribeMessage(
  openid: string,
  draw: DrawRow,
  profitCents: number
): Promise<boolean> {
  const templateId = subscribeTemplateId();
  if (!templateId) {
    console.warn("[wx] 未配置 WX_SUBSCRIBE_TEMPLATE_ID，跳过推送");
    return false;
  }

  const data = templateData(draw, profitCents);

  try {
    let result = await postSubscribe(await getAccessToken(), openid, templateId, data);
    if (result.errcode === 40001) {
      console.warn("[wx] access_token 失效，强制刷新后重试");
      result = await postSubscribe(await getAccessToken(true), openid, templateId, data);
    }

    if (result.errcode === 43101) {
      console.log("[wx] 用户未订阅或额度用尽，跳过推送", { openid });
      return false;
    }
    if (result.errcode && result.errcode !== 0) {
      console.error("[wx] 订阅消息发送失败", result.errcode, result.errmsg ?? "");
      return false;
    }
    return true;
  } catch (e: any) {
    console.error("[wx] 订阅消息异常", e?.message ?? e);
    return false;
  }
}

/**
 * 对指定开奖期推送：只发给 subscriptions.accepted=1 且本期有启用守号/命中记录的用户。
 * 返回成功发送数量；单个用户失败不影响其他人。
 */
export async function notifyDraw(drawCode: string): Promise<number> {
  const draw = await getDraw(drawCode);
  if (!draw) return 0;

  const targets = await listPushTargets(drawCode);
  if (!targets.length) {
    console.log("[wx] 本期没有需要推送的订阅用户", { drawCode });
    return 0;
  }

  let sent = 0;
  for (const target of targets) {
    const ok = await sendSubscribeMessage(target.openid, draw, target.profit);
    if (ok) sent++;
  }
  console.log("[wx] 推送完成", { drawCode, targets: targets.length, sent });
  return sent;
}
