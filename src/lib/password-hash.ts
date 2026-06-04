import "server-only";

import bcrypt from "bcryptjs";
import crypto from "crypto";

const SHA256_HEX = /^[0-9a-f]{64}$/i;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function isLegacySha256Hash(hash: string): boolean {
  return SHA256_HEX.test(hash);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  if (isLegacySha256Hash(hash)) {
    const sha = crypto.createHash("sha256").update(plain).digest("hex");
    // Bandingkan timing-safe untuk hindari timing attack. Kedua hash SHA-256
    // selalu 64 hex char, jadi panjang buffer pasti sama.
    const a = Buffer.from(sha.toLowerCase(), "utf8");
    const b = Buffer.from(hash.toLowerCase(), "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return bcrypt.compare(plain, hash);
}
