import { hashPayload } from "../payload-hash-util";

describe("hashPayload", () => {
  test("dua payload beda dengan panjang sama menghasilkan hash berbeda", () => {
    const a = hashPayload({ a: 1, b: 2 });
    const b = hashPayload({ a: 2, b: 1 });
    expect(a).not.toBe(b);
  });

  test("hash sama untuk input identik (deterministik)", () => {
    const x = { nama: "test", nilai: 100 };
    expect(hashPayload(x)).toBe(hashPayload(x));
  });

  test("output adalah hex sha256 (64 char)", () => {
    expect(hashPayload({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
