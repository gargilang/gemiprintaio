import crypto from "crypto";

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function getPassphrase(): string {
  const secret = process.env.PASSWORD_ENC_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PASSWORD_ENC_SECRET wajib di-set di production untuk vault kredensial."
      );
    }
    console.warn(
      "[crypto] Memakai kunci enkripsi dev. Set PASSWORD_ENC_SECRET untuk production."
    );
    return "dev-secret-please-change";
  }
  return secret;
}

function deriveKey(salt: Buffer): Buffer {
  return crypto.scryptSync(getPassphrase(), salt, 32);
}

// Salt tetap lama (sebelum format per-record salt). Dipakai hanya sebagai
// fallback agar kredensial lama tetap bisa dibuka tanpa input ulang.
const LEGACY_SALT = "gemiprint_salt";

function deriveLegacyKey(): Buffer {
  return crypto.scryptSync(getPassphrase(), LEGACY_SALT, 32);
}

export function encryptText(plain: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format baru: salt + iv + tag + ciphertext (base64).
  return Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
}

/**
 * Coba dekripsi format lama (salt fixed, layout iv + tag + ciphertext) untuk
 * kredensial yang dienkripsi sebelum migrasi per-record salt.
 */
function decryptLegacy(raw: Buffer): string {
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
  const key = deriveLegacyKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function decryptText(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const salt = raw.subarray(0, SALT_LEN);
  const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = deriveKey(salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Fallback ke format lama (salt fixed) agar kredensial lama tetap terbaca.
    return decryptLegacy(raw);
  }
}
