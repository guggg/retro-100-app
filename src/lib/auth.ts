import crypto from "crypto";

const SECRET = process.env.SESSION_SECRET || "retro-default-secret-change-me";

export function createToken(memberId: string): string {
  const payload = `${memberId}:${Date.now()}`;
  const hmac = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  // token = base64(payload):hmac
  const encoded = Buffer.from(payload).toString("base64");
  return `${encoded}.${hmac}`;
}

export function verifyToken(token: string): string | null {
  try {
    const [encoded, hmac] = token.split(".");
    if (!encoded || !hmac) return null;

    const payload = Buffer.from(encoded, "base64").toString();
    const [memberId, timestampStr] = payload.split(":");
    if (!memberId || !timestampStr) return null;

    // Check HMAC
    const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
    if (hmac !== expected) return null;

    // Check expiry (24 hours)
    const timestamp = parseInt(timestampStr, 10);
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) return null;

    return memberId;
  } catch {
    return null;
  }
}
