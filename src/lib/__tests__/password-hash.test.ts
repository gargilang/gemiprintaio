import {
  hashPassword,
  verifyPassword,
  isLegacySha256Hash,
} from "../password-hash";
import crypto from "crypto";

describe("verifyPassword", () => {
  test("hash bcrypt baru cocok dengan password benar", async () => {
    const hash = await hashPassword("rahasia123");
    expect(await verifyPassword("rahasia123", hash)).toBe(true);
    expect(await verifyPassword("salah", hash)).toBe(false);
  });

  test("hash SHA-256 legacy cocok (timing-safe)", async () => {
    const legacy = crypto.createHash("sha256").update("lama").digest("hex");
    expect(isLegacySha256Hash(legacy)).toBe(true);
    expect(await verifyPassword("lama", legacy)).toBe(true);
    expect(await verifyPassword("beda", legacy)).toBe(false);
  });
});
