import crypto from "crypto";

function getSecret(): Buffer {
  const secret =
    process.env.PASSWORD_ENC_SECRET ||
    process.env.NEXT_PUBLIC_PASSWORD_ENC_SECRET;
  const passphrase = secret || "dev-secret-please-change";
  if (!secret) {
    console.warn(
      "[crypto] Using fallback dev encryption key. Set PASSWORD_ENC_SECRET for production."
    );
  }
  // Derive a 32-byte key from passphrase using scrypt
  return crypto.scryptSync(passphrase, "gemiprint_salt", 32);
}

export function encryptText(plain: string): string {
  const key = getSecret();
  const iv = crypto.randomBytes(12); // GCM recommended IV length
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Store iv + tag + ciphertext in base64
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptText(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const key = getSecret();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
