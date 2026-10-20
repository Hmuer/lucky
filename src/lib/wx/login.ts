import { findOrCreateUserByOpenid } from "../db";
import { signToken } from "./jwt";
import { jscode2session } from "./session";

/** 小程序登录：code → openid → users → JWT */
export async function loginWithCode(code: string): Promise<{ token: string; isNew: boolean; uid: number }> {
  const openid = await jscode2session(code);
  const user = await findOrCreateUserByOpenid(openid);
  const token = await signToken(user.id);
  return { token, isNew: user.isNew, uid: user.id };
}
