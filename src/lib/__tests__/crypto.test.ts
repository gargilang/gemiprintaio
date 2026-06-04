import { encryptText, decryptText } from "../crypto";

describe("crypto vault", () => {
  const OLD = process.env.PASSWORD_ENC_SECRET;
  beforeAll(() => {
    process.env.PASSWORD_ENC_SECRET = "test-secret-32-bytes-min-aaaaaaaa";
  });
  afterAll(() => {
    process.env.PASSWORD_ENC_SECRET = OLD;
  });

  test("encrypt lalu decrypt mengembalikan plaintext", () => {
    const enc = encryptText("wifi-password-123");
    expect(decryptText(enc)).toBe("wifi-password-123");
  });

  test("dua enkripsi nilai sama menghasilkan ciphertext berbeda (salt+IV acak)", () => {
    const a = encryptText("sama");
    const b = encryptText("sama");
    expect(a).not.toBe(b);
    expect(decryptText(a)).toBe("sama");
    expect(decryptText(b)).toBe("sama");
  });

  test("kredensial format lama (salt fixed) tetap bisa didekripsi via fallback", () => {
    // Reproduksi format lama: scrypt(passphrase, 'gemiprint_salt') + iv + tag + ct.
    const crypto = require("crypto");
    const key = crypto.scryptSync(
      process.env.PASSWORD_ENC_SECRET as string,
      "gemiprint_salt",
      32
    );
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([
      cipher.update("rahasia-lama", "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const legacy = Buffer.concat([iv, tag, enc]).toString("base64");
    expect(decryptText(legacy)).toBe("rahasia-lama");
  });
});
