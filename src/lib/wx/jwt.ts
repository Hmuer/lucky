import { SignJWT, jwtVerify } from "jose";

const TOKEN_TTL = "30d";

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("缺少 JWT_SECRET，请在 .env.local 配置至少 16 位随机字符串");
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(uid: number): Promise<string> {
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}

export async function verifyToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const uid = payload.uid;
    return typeof uid === "number" && Number.isInteger(uid) && uid > 0 ? uid : null;
  } catch {
    return null;
  }
}

/** 从 Authorization: Bearer <token> 解析 uid；无效返回 null */
export async function getBearerUid(req: Request): Promise<number | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return verifyToken(match[1].trim());
}
