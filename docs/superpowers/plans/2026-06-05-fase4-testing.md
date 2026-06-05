# Fase 4 — Testing (API Routes + Komponen) Implementation Plan

> **Untuk agentic workers:** REQUIRED SUB-SKILL: gunakan superpowers:subagent-driven-development (disarankan) atau superpowers:executing-plans untuk eksekusi task demi task. Semua step pakai checkbox (`- [x]`).

**Goal:** Menambah coverage ke API layer (saat ini 0%) dan menyiapkan test environment jsdom untuk komponen (O-C4, O-I1).

**Architecture:** Pecah jest jadi dua project — `node` untuk `src/lib` (sudah ada), `jsdom` untuk `src/app` + `src/components`. Test API route dengan memanggil handler langsung (import `POST`/`GET` dari `route.ts`) memakai mock NextRequest + mock service/session, mulai dari 3 endpoint blast-radius terbesar.

**Tech Stack:** Jest 30, ts-jest, @testing-library/react, @testing-library/jest-dom, jsdom.

**Sumber temuan:** `docs/superpowers/specs/2026-06-04-codebase-review.md` bagian 4 (O-C4, O-I1).

**Prasyarat:** Fase 1 (route sudah pakai guard — test guard butuh ini) dan Fase 2 (service stabil) sebaiknya sudah merge.

---

## File Structure

- Modify: `jest.config.js` — pakai `projects` (node + jsdom).
- Create: `jest.setup.ts` — import `@testing-library/jest-dom`.
- Create: `src/app/api/auth/login/__tests__/route.test.ts`
- Create: `src/app/api/pos/sales/__tests__/route.test.ts`
- Create: `src/app/api/sync/auto/__tests__/route.test.ts`
- Create: `src/components/__tests__/DialogKonfirmasi.test.tsx` (contoh test komponen jsdom)
- Create: `src/lib/__tests__/helpers/next-request.ts` — helper buat NextRequest palsu.

Strategi test API: panggil handler `route.ts` langsung dengan NextRequest mock; mock layer `@/lib/session` dan service yang dipanggil agar deterministik (tidak menyentuh DB nyata).

---

### Task 1: Jest multi-project (node + jsdom) (O-I1)

**Files:**
- Modify: `jest.config.js`
- Create: `jest.setup.ts`

- [x] **Step 1: Install dependency test React**

Run:

```bash
npm install -D @testing-library/react @testing-library/jest-dom jest-environment-jsdom
```

- [x] **Step 2: Ubah jest.config.js ke projects**

Ganti isi `jest.config.js`:

```js
const { createDefaultPreset } = require("ts-jest");
const tsJestTransformCfg = createDefaultPreset().transform;

const common = {
  transform: { ...tsJestTransformCfg },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^server-only$": "<rootDir>/src/__mocks__/server-only.js",
  },
};

/** @type {import("jest").Config} **/
module.exports = {
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
  ],
  coverageThreshold: {
    global: { statements: 40, branches: 30, functions: 40, lines: 40 },
  },
  projects: [
    {
      ...common,
      displayName: "node",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/src/lib/**/__tests__/**/*.test.ts",
        "<rootDir>/src/app/**/__tests__/**/*.test.ts",
      ],
    },
    {
      ...common,
      displayName: "jsdom",
      testEnvironment: "jsdom",
      setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
      testMatch: [
        "<rootDir>/src/components/**/__tests__/**/*.test.tsx",
        "<rootDir>/src/app/**/__tests__/**/*.test.tsx",
      ],
    },
  ],
};
```

- [x] **Step 3: Buat jest.setup.ts**

Create `jest.setup.ts`:

```ts
import "@testing-library/jest-dom";
```

- [x] **Step 4: Verifikasi test lama masih jalan**

Run: `npm test`
Expected: 199/199 test lama tetap pass (sekarang di project "node").

- [x] **Step 5: Commit**

```bash
git add jest.config.js jest.setup.ts package.json package-lock.json
git commit -m "test: split jest into node + jsdom projects (O-I1)"
```

---

### Task 2: Helper NextRequest + test login route (O-C4)

**Files:**
- Create: `src/lib/__tests__/helpers/next-request.ts`
- Create: `src/app/api/auth/login/__tests__/route.test.ts`

- [x] **Step 1: Buat helper NextRequest**

Create `src/lib/__tests__/helpers/next-request.ts`:

```ts
import { NextRequest } from "next/server";

export function makeRequest(
  url: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> }
): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
}
```

- [x] **Step 2: Tulis test login route**

Create `src/app/api/auth/login/__tests__/route.test.ts`. Mock service auth + session agar deterministik:

```ts
import { makeRequest } from "@/lib/__tests__/helpers/next-request";

jest.mock("@/lib/services/auth-service", () => ({
  login: jest.fn(),
}));
jest.mock("@/lib/session", () => ({
  createSessionWithUser: jest.fn().mockResolvedValue("jwt"),
}));
jest.mock("@/lib/rate-limit", () => ({
  loginLimiter: null,
  limitOrPass: jest.fn().mockResolvedValue({ ok: true }),
}));

import { POST } from "../route";
import { login } from "@/lib/services/auth-service";

describe("POST /api/auth/login", () => {
  test("kredensial valid → 200 + success", async () => {
    (login as jest.Mock).mockResolvedValue({
      success: true,
      user: { id: "u1", role: "admin", nama_pengguna: "admin" },
    });
    const res = await POST(makeRequest("/api/auth/login", {
      method: "POST",
      body: { nama_pengguna: "admin", password: "secret" },
    }));
    expect(res.status).toBe(200);
  });

  test("kredensial salah → 401", async () => {
    (login as jest.Mock).mockResolvedValue({ success: false, error: "Kredensial salah" });
    const res = await POST(makeRequest("/api/auth/login", {
      method: "POST",
      body: { nama_pengguna: "x", password: "y" },
    }));
    expect(res.status).toBe(401);
  });
});
```

> Sesuaikan nama field body dan path import dengan implementasi `login/route.ts` aktual (baca dulu). Status code (401 vs 200) cocokkan dengan response asli.

- [x] **Step 3: Jalankan test**

Run: `npx jest src/app/api/auth/login`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/lib/__tests__/helpers/next-request.ts src/app/api/auth/login/__tests__/route.test.ts
git commit -m "test(api): cover auth/login happy + failure path (O-C4)"
```

---

### Task 3: Test pos/sales POST (hot path terkompleks) (O-C4)

**Files:**
- Create: `src/app/api/pos/sales/__tests__/route.test.ts`

- [x] **Step 1: Tulis test guard + happy path**

Create `src/app/api/pos/sales/__tests__/route.test.ts`:

```ts
import { makeRequest } from "@/lib/__tests__/helpers/next-request";

const requireGuard = jest.fn();
jest.mock("@/lib/auth-guard-server", () => {
  class AuthGuardError extends Error {
    status: number;
    constructor(m: string, s: number) {
      super(m);
      this.status = s;
    }
  }
  return {
    AuthGuardError,
    requireAdminOrManager: () => requireGuard(),
    requireProductionInventoryRole: () => requireGuard(),
    requireSession: () => requireGuard(),
  };
});
jest.mock("@/lib/services/pos-mutations", () => ({
  createSale: jest.fn(),
}));

import { POST } from "../route";
import { createSale } from "@/lib/services/pos-mutations";

describe("POST /api/pos/sales", () => {
  beforeEach(() => jest.clearAllMocks());

  test("tanpa role → 403", async () => {
    const { AuthGuardError } = jest.requireMock("@/lib/auth-guard-server");
    requireGuard.mockRejectedValue(new AuthGuardError("Forbidden", 403));
    const res = await POST(makeRequest("/api/pos/sales", {
      method: "POST",
      body: { items: [] },
    }));
    expect(res.status).toBe(403);
  });

  test("payload valid → sale dibuat", async () => {
    requireGuard.mockResolvedValue({ uid: "u1", role: "admin" });
    (createSale as jest.Mock).mockResolvedValue({ id: "sale-1" });
    const res = await POST(makeRequest("/api/pos/sales", {
      method: "POST",
      body: {
        pelanggan_id: "p1",
        metode_pembayaran: "CASH",
        items: [{ barang_id: "b1", jumlah: 1, harga_satuan: 1000 }],
      },
    }));
    expect([200, 201]).toContain(res.status);
    expect(createSale).toHaveBeenCalled();
  });
});
```

> Sesuaikan: nama guard yang dipakai route pos/sales (cek apakah `requireProductionInventoryRole` atau `requireAdminOrManager`), nama service, dan status sukses. Baca `route.ts` dulu.

- [x] **Step 2: Jalankan + commit**

Run: `npx jest src/app/api/pos/sales`

```bash
git add src/app/api/pos/sales/__tests__/route.test.ts
git commit -m "test(api): cover pos/sales POST guard + happy path (O-C4)"
```

---

### Task 4: Test sync/auto (O-C4)

**Files:**
- Create: `src/app/api/sync/auto/__tests__/route.test.ts`

- [x] **Step 1: Tulis test**

Create test yang memverifikasi: tanpa sesi → 401; dengan sesi → memanggil engine sync (mock). Mock `@/lib/session` dan service sync yang dipakai. Pola sama dengan Task 3.

```ts
import { makeRequest } from "@/lib/__tests__/helpers/next-request";

jest.mock("@/lib/session", () => ({ getSession: jest.fn() }));
// mock service sync yang dipanggil route (sesuaikan nama)

import { POST } from "../route";
import { getSession } from "@/lib/session";

describe("POST /api/sync/auto", () => {
  test("tanpa sesi → 401", async () => {
    (getSession as jest.Mock).mockResolvedValue(null);
    const res = await POST(makeRequest("/api/sync/auto", { method: "POST", body: {} }));
    expect(res.status).toBe(401);
  });
});
```

> Baca `sync/auto/route.ts` untuk nama service & bentuk response sebenarnya, lengkapi happy path.

- [x] **Step 2: Jalankan + commit**

Run: `npx jest src/app/api/sync/auto`

```bash
git add src/app/api/sync/auto/__tests__/route.test.ts
git commit -m "test(api): cover sync/auto auth gate (O-C4)"
```

---

### Task 5: Contoh test komponen (jsdom) (O-I1)

**Files:**
- Create: `src/components/__tests__/DialogKonfirmasi.test.tsx`

- [x] **Step 1: Tulis test render + interaksi**

Create `src/components/__tests__/DialogKonfirmasi.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import DialogKonfirmasi from "../DialogKonfirmasi";

describe("DialogKonfirmasi", () => {
  test("menampilkan judul dan memanggil onConfirm", () => {
    const onConfirm = jest.fn();
    render(
      <DialogKonfirmasi
        isOpen
        judul="Hapus data?"
        pesan="Yakin?"
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByText("Hapus data?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ya|hapus|konfirmasi/i }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
```

> Baca `src/components/DialogKonfirmasi.tsx` untuk nama prop aktual (`isOpen`/`show`, `judul`/`title`, label tombol). Sesuaikan. Ini membuktikan pipeline jsdom jalan; pola yang sama dipakai di Fase 5 untuk komponen hasil refactor.

- [x] **Step 2: Jalankan + commit**

Run: `npx jest src/components/__tests__/DialogKonfirmasi.test.tsx`

```bash
git add src/components/__tests__/DialogKonfirmasi.test.tsx
git commit -m "test(ui): jsdom component test for DialogKonfirmasi (O-I1)"
```

---

## Self-Review Fase 4

| Temuan | Task | Status |
| ------ | ---- | ------ |
| O-C4 0 test API (3 endpoint blast-radius) | Task 2 (login), Task 3 (pos/sales), Task 4 (sync/auto) | ✓ |
| O-I1 jsdom env + komponen | Task 1 (config), Task 5 (contoh komponen) | ✓ |

**Konsistensi:** `makeRequest` helper dipakai di Task 2, 3, 4. Mock `auth-guard-server` di Task 3 mengembalikan `AuthGuardError` yang punya `.status` (cocok dengan implementasi Fase 1). `coverageThreshold` di Task 1 sama dengan yang ditulis Fase 3 Task 9 (tidak konflik — Fase 4 menimpa dengan config projects, threshold tetap).

**Catatan ketergantungan:** Test guard (Task 3) mengasumsikan route sudah memakai guard dari Fase 1. Jika Fase 1 belum merge, test 403 akan gagal — kerjakan Fase 1 dulu (lihat index).

## Verifikasi akhir Fase 4

```bash
npm test                 # node + jsdom project, semua pass
npm run test:coverage    # coverage tidak di bawah threshold
```

CI (dari Fase 3) otomatis menjalankan test baru ini di setiap PR.

## Peningkatan lanjutan (di luar scope minimal)

- Tambah test untuk pembelian → hutang → pelunasan (alur kedua paling kompleks).
- Naikkan `coverageThreshold` bertahap saat coverage tumbuh.
- Pertimbangkan `next-test-api-route-handler` jika butuh simulasi request yang lebih realistis (middleware, cookies).

## Catatan untuk owner (Bahasa Indonesia)

- Sekarang alur paling penting (login, kasir/penjualan, sinkronisasi) punya test otomatis. Kalau ada perubahan yang merusaknya, CI langsung menangkap sebelum masuk ke aplikasi.

