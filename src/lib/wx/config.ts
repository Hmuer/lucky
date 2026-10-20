/** 微信相关环境变量读取，缺失时抛出明确错误（不会把 secret 打到日志） */

export function wxAppId(): string {
  const value = process.env.WX_APPID?.trim();
  if (!value) throw new Error("缺少 WX_APPID");
  return value;
}

export function wxAppSecret(): string {
  const value = process.env.WX_APPSECRET?.trim();
  if (!value) throw new Error("缺少 WX_APPSECRET");
  return value;
}

export function subscribeTemplateId(): string {
  return process.env.WX_SUBSCRIBE_TEMPLATE_ID?.trim() ?? "";
}

export function subscribePage(): string {
  return process.env.WX_SUBSCRIBE_PAGE?.trim() || "pages/index/index";
}

export function templateFields(): { issue: string; numbers: string; profit: string } {
  return {
    issue: process.env.WX_TEMPLATE_FIELD_ISSUE?.trim() || "thing1",
    numbers: process.env.WX_TEMPLATE_FIELD_NUMBERS?.trim() || "character_string2",
    profit: process.env.WX_TEMPLATE_FIELD_PROFIT?.trim() || "amount3",
  };
}
