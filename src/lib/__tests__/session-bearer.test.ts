/**
 * Regresi: getSession() harus menerima JWT lewat cookie (web) MAUPUN lewat
 * header Authorization: Bearer (klien non-browser seperti Flutter). Bug lama:
 * getSession hanya membaca cookie sehingga semua mutasi ber-guard requireSession
 * dari Flutter selalu 401 walau token valid.
 */

const cookieStore = { value: undefined as string | undefined };
const headerStore = { authorization: null as string | null };

// jose hanya tersedia sebagai ESM; ts-jest tidak men-transform node_modules.
// Mock ringan yang round-trip payload sudah cukup karena yang diuji di sini
// adalah logika getSession (pilih cookie vs Bearer, regex Bearer, null-handling),
// bukan kriptografi jose. Token "valid" = JSON ter-base64; selain itu lempar.
jest.mock("jose", () => ({
  __esModule: true,
  SignJWT: class {
    private payload: Record<string, unknown>;
    constructor(payload: Record<string, unknown>) {
      this.payload = payload;
    }
    setProtectedHeader() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    async sign() {
      return Buffer.from(JSON.stringify(this.payload)).toString("base64");
    }
  },
  jwtVerify: async (token: string) => {
    try {
      const payload = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
      if (payload && typeof payload === "object" && "uid" in payload) {
        return { payload };
      }
    } catch {
      // jatuh ke throw di bawah
    }
    throw new Error("invalid token");
  },
}));

jest.mock("next/headers", () => ({
  __esModule: true,
  cookies: async () => ({
    get: (_name: string) =>
      cookieStore.value !== undefined
        ? { value: cookieStore.value }
        : undefined,
  }),
  headers: async () => ({
    get: (name: string) =>
      name.toLowerCase() === "authorization" ? headerStore.authorization : null,
  }),
}));

import { createSessionWithUser, getSession } from "../session";

describe("getSession menerima cookie dan Bearer", () => {
  const OLD = process.env.SESSION_SECRET;

  beforeAll(() => {
    process.env.SESSION_SECRET = "test-session-secret-min-32-chars-aaaaaa";
  });
  afterAll(() => {
    process.env.SESSION_SECRET = OLD;
  });
  beforeEach(() => {
    cookieStore.value = undefined;
    headerStore.authorization = null;
  });

  async function buatToken() {
    // skipCookie: true agar tidak menyentuh cookie store saat membuat token.
    return createSessionWithUser(
      { uid: "u1", role: "admin", nama_pengguna: "andi" },
      { skipCookie: true },
    );
  }

  test("membaca sesi dari cookie gp_session (web)", async () => {
    const token = await buatToken();
    cookieStore.value = token;

    const s = await getSession();
    expect(s?.uid).toBe("u1");
    expect(s?.role).toBe("admin");
  });

  test("membaca sesi dari header Authorization: Bearer (Flutter)", async () => {
    const token = await buatToken();
    headerStore.authorization = `Bearer ${token}`;

    const s = await getSession();
    expect(s?.uid).toBe("u1");
    expect(s?.role).toBe("admin");
  });

  test("tanpa cookie maupun Bearer mengembalikan null", async () => {
    const s = await getSession();
    expect(s).toBeNull();
  });

  test("token Bearer tidak valid mengembalikan null", async () => {
    headerStore.authorization = "Bearer token.palsu.xxx";
    const s = await getSession();
    expect(s).toBeNull();
  });

  test("cookie diprioritaskan, tapi Bearer dipakai saat cookie kosong", async () => {
    const token = await buatToken();
    // Cookie kosong, hanya Bearer tersedia.
    headerStore.authorization = `Bearer ${token}`;
    const s = await getSession();
    expect(s?.uid).toBe("u1");
  });
});
