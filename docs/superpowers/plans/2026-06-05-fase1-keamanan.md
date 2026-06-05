# Fase 1 — Keamanan & Otorisasi Implementation Plan

> **Untuk agentic workers:** REQUIRED SUB-SKILL: gunakan superpowers:subagent-driven-development (disarankan) atau superpowers:executing-plans untuk eksekusi task demi task. Semua step pakai checkbox (`- [x]`).

**Goal:** Menutup semua lubang otorisasi, vault kredensial, backdoor, dan validasi input yang ditemukan di review (S-C1..S-C5, S-I1..S-I9, minor security).

**Architecture:** Tambah helper guard terpusat (`withRoleGuard`, `withAudit`), perketat crypto/session di startup, adopsi Zod per route mulai dari hot path. Tidak mengubah skema DB kecuali kolom salt untuk vault.

**Tech Stack:** Next.js 16 API routes (Node runtime), jose JWT, bcryptjs, node:crypto, Zod, Upstash rate limit.

**Sumber temuan:** `docs/superpowers/specs/2026-06-04-codebase-review.md` bagian 1 (Security dan API Routes) + U-C1.

---

## File Structure

Helper baru dan file yang disentuh:

- Create: `src/lib/with-role-guard.ts` — wrapper handler API yang menjalankan guard + audit, menerjemahkan `AuthGuardError` ke response.
- Create: `src/lib/__tests__/crypto.test.ts`, `src/lib/__tests__/with-role-guard.test.ts`.
- Create: `supabase/migrations/<timestamp>_kredensial_enc_salt.sql` — kolom salt per-record untuk vault.
- Modify: `src/lib/crypto.ts` — per-record salt + throw di production bila secret kosong.
- Modify: `src/lib/session.ts` — validasi panjang SESSION_SECRET, TTL pendek + session_version.
- Modify: `src/lib/supabase.ts` → pecah jadi `supabase-client.ts` + `supabase-admin.ts` (server-only).
- Modify: `src/components/MainShell.tsx` — gate backdoor Ctrl+Shift+L.
- Modify: route mutation tanpa guard (daftar lengkap di Task 5).
- Modify: `src/lib/services/auth-service.ts` — pesan login generik.
- Modify: `next.config.ts` — CSP nonce + HSTS.

Prinsip: guard + audit terpusat di satu helper supaya 40+ route konsisten (DRY).

---

### Task 1: Gate backdoor logout shortcut (S-C1 / U-C1)

**Files:**
- Modify: `src/components/MainShell.tsx:197-207`

- [x] **Step 1: Gate useEffect dengan NODE_ENV**

Ganti blok useEffect shortcut Ctrl+Shift+L menjadi:

```tsx
  // Bantuan development: bersihkan sesi dengan Ctrl+Shift+L.
  // Hanya aktif di development; di production shortcut ini dimatikan
  // agar tidak terpicu tidak sengaja atau lewat XSS (re-auth phishing).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        void logoutSession().then(() => router.push("/auth/login"));
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [router]);
```

- [x] **Step 2: Verifikasi build dan grep**

Run: `npm run type-check && npm run build`
Expected: 0 error, build sukses.
Run grep manual: pastikan tidak ada pemanggil `logoutSession` lain tanpa gate di komponen production.

- [x] **Step 3: Commit**

```bash
git add src/components/MainShell.tsx
git commit -m "fix(security): gate backdoor logout shortcut to development only"
```

---

### Task 2: Vault kredensial — salt per-record + fail-fast (S-C2)

**Files:**
- Create: `supabase/migrations/<timestamp>_kredensial_enc_salt.sql`
- Modify: `database/sqlite-schema.sql` (tambah kolom `enc_salt`)
- Modify: `src/lib/db-unified.ts` (runtime ALTER untuk SQLite lama)
- Modify: `src/lib/crypto.ts`
- Create: `src/lib/__tests__/crypto.test.ts`

- [x] **Step 1: Tulis test gagal untuk roundtrip dengan salt acak**

Create `src/lib/__tests__/crypto.test.ts`:

```ts
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
});
```

- [x] **Step 2: Jalankan test, harus gagal**

Run: `npx jest src/lib/__tests__/crypto.test.ts`
Expected: FAIL (format lama tidak menyimpan salt; format baru belum ada).

- [x] **Step 3: Tulis ulang crypto.ts dengan salt per-record + fail-fast**

Ganti isi `src/lib/crypto.ts`:

```ts
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

export function decryptText(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const salt = raw.subarray(0, SALT_LEN);
  const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = deriveKey(salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
```

Catatan: ciphertext lama (salt fixed `gemiprint_salt`) tidak akan ter-decrypt oleh format baru. Karena vault hanya berisi data yang bisa diisi ulang user, ini dapat diterima; tambahkan catatan di summary agar owner re-input kredensial. Jika perlu migrasi otomatis, tulis fungsi `decryptLegacy` opsional yang dipanggil sebagai fallback (di luar scope plan ini).

- [x] **Step 4: Jalankan test, harus pass**

Run: `npx jest src/lib/__tests__/crypto.test.ts`
Expected: PASS.

- [x] **Step 5: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/lib/crypto.ts src/lib/__tests__/crypto.test.ts
git commit -m "fix(security): per-record salt for credential vault, fail-fast in production"
```

---

### Task 3: Helper `withRoleGuard` + `withAudit` terpusat (S-I3, S-I7)

**Files:**
- Create: `src/lib/with-role-guard.ts`
- Create: `src/lib/__tests__/with-role-guard.test.ts`

- [x] **Step 1: Tulis test gagal**

Create `src/lib/__tests__/with-role-guard.test.ts`:

```ts
import { AuthGuardError } from "../auth-guard-server";
import { toGuardResponse } from "../with-role-guard";

describe("toGuardResponse", () => {
  test("AuthGuardError 403 → response 403", async () => {
    const res = toGuardResponse(new AuthGuardError("Forbidden", 403));
    expect(res?.status).toBe(403);
  });

  test("AuthGuardError 401 → response 401", async () => {
    const res = toGuardResponse(new AuthGuardError("Unauthorized", 401));
    expect(res?.status).toBe(401);
  });

  test("error biasa → null (bukan guard error)", () => {
    expect(toGuardResponse(new Error("lain"))).toBeNull();
  });
});
```

- [x] **Step 2: Jalankan test, harus gagal**

Run: `npx jest src/lib/__tests__/with-role-guard.test.ts`
Expected: FAIL ("Cannot find module ../with-role-guard").

- [x] **Step 3: Implementasi helper**

Create `src/lib/with-role-guard.ts`:

```ts
import "server-only";
import { NextResponse } from "next/server";
import { AuthGuardError } from "./auth-guard-server";
import { logAudit, type AuditInput } from "./audit";

/**
 * Map AuthGuardError → NextResponse. Return null jika bukan guard error
 * (caller harus melempar ulang / tangani sebagai 500).
 */
export function toGuardResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthGuardError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

/**
 * Bungkus handler mutation: jalankan guard, lalu handler. Jika guard gagal,
 * balas status guard. Pakai di route POST/PUT/PATCH/DELETE.
 */
export function withRoleGuard<Ctx>(
  guard: () => Promise<{ uid: string; role: string }>,
  handler: (ctx: Ctx, session: { uid: string; role: string }) => Promise<NextResponse>
) {
  return async (ctx: Ctx): Promise<NextResponse> => {
    let session;
    try {
      session = await guard();
    } catch (e) {
      const guarded = toGuardResponse(e);
      if (guarded) return guarded;
      throw e;
    }
    return handler(ctx, session);
  };
}

/**
 * Tulis audit log best-effort setelah mutasi sensitif berhasil.
 */
export async function withAudit(input: AuditInput): Promise<void> {
  await logAudit(input);
}
```

- [x] **Step 4: Jalankan test, harus pass**

Run: `npx jest src/lib/__tests__/with-role-guard.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/with-role-guard.ts src/lib/__tests__/with-role-guard.test.ts
git commit -m "feat(security): add withRoleGuard + withAudit helpers"
```

---

### Task 4: Role guard di endpoint pengguna (S-C3)

**Files:**
- Modify: `src/app/api/pengguna/[id]/route.ts`

- [x] **Step 1: Tambah guard di PUT dan DELETE**

Tambah import di atas file:

```ts
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import { logAudit } from "@/lib/audit";
```

Di awal handler `PUT`, sebelum `const { id: paramId } = await params;`:

```ts
    const session = await requireAdminOrManager();
```

Di awal handler `DELETE`, posisi sama:

```ts
    const session = await requireAdminOrManager();
```

Di kedua catch block, tangani guard error lebih dulu:

```ts
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // ... handler error lama tetap di bawah
```

- [x] **Step 2: Cegah self-demote / hapus admin terakhir**

Sebelum memanggil `patchProfil`, jika body mengubah `role` dari admin dan target adalah diri sendiri, tolak. Tambah cek di PUT setelah parse body:

```ts
    if (paramId === session.uid && body?.role && body.role !== "admin" && session.role === "admin") {
      return NextResponse.json(
        { error: "Tidak bisa menurunkan role admin diri sendiri" },
        { status: 400 }
      );
    }
```

Untuk DELETE, tolak hapus diri sendiri:

```ts
    if (paramId === session.uid) {
      return NextResponse.json(
        { error: "Tidak bisa menghapus akun sendiri" },
        { status: 400 }
      );
    }
```

- [x] **Step 3: Tambah audit log setelah sukses**

Di PUT setelah `patchProfil` sukses, sebelum return:

```ts
    await logAudit({
      userId: session.uid,
      action: "update_pengguna",
      resourceType: "profil",
      resourceId: paramId,
      details: { fields: Object.keys(body || {}) },
    });
```

Di DELETE setelah `deleteProfil` sukses:

```ts
    await logAudit({
      userId: session.uid,
      action: "delete_pengguna",
      resourceType: "profil",
      resourceId: paramId,
    });
```

- [x] **Step 4: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/app/api/pengguna/[id]/route.ts
git commit -m "fix(security): require admin/manager + audit on pengguna mutations"
```

---

### Task 5: Role guard cashbook delete-all & cashbook-formula (S-C5)

**Files:**
- Modify: `src/app/api/cashbook/delete-all/route.ts`
- Modify: `src/app/api/cashbook-formula/route.ts`

- [x] **Step 1: Guard cashbook/delete-all**

Tambah import dan guard di awal `DELETE`:

```ts
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
```

Di awal `try` handler DELETE:

```ts
    const session = await requireAdminOrManager();
```

Ganti `const uid = request.headers.get("x-session-uid");` menjadi `const uid = session.uid;` (header lama tidak terpercaya). Di catch:

```ts
    if (error instanceof AuthGuardError) {
      return apiError(error.message, error.status);
    }
```

- [x] **Step 2: Guard cashbook-formula POST + audit**

Tambah import sama. Di awal `try` handler POST:

```ts
    const session = await requireAdminOrManager();
```

Setelah mutasi sukses (reset/delete/upsert), tambah audit:

```ts
    await logAudit({
      userId: session.uid,
      action: `cashbook_formula_${action}`,
      resourceType: "cashbook_formula",
      resourceId: String(body?.id || body?.formula?.id || ""),
    });
```

Tambah import `import { logAudit } from "@/lib/audit";` dan tangani `AuthGuardError` di catch.

- [x] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/app/api/cashbook/delete-all/route.ts src/app/api/cashbook-formula/route.ts
git commit -m "fix(security): guard + audit cashbook delete-all and formula routes"
```

---

### Task 6: Perketat sync/offline-queue (S-C4)

**Files:**
- Modify: `src/app/api/sync/offline-queue/route.ts`

- [x] **Step 1: Buang tabel sensitif dari whitelist offline-queue**

Ganti `const ALLOWED = new Set(SYNC_TABLES);` dengan whitelist khusus offline yang membuang tabel berisiko privilege/keuangan:

```ts
// Offline queue TIDAK boleh menyentuh tabel identitas/keuangan dari user biasa.
const OFFLINE_BLOCKED = new Set([
  "profil",
  "kredensial",
  "keuangan",
  "audit_log",
]);
const ALLOWED = new Set(
  SYNC_TABLES.filter((t) => !OFFLINE_BLOCKED.has(t))
);
```

- [x] **Step 2: Tolak operasi ke tabel terblokir secara eksplisit**

Di dalam loop, kondisi penolakan sudah ada (`!ALLOWED.has(table)`). Tambah log audit ketika operasi ditolak karena tabel sensitif agar percobaan terlihat:

```ts
    if (!table || !operation || !ALLOWED.has(table)) {
      if (table && OFFLINE_BLOCKED.has(table)) {
        console.warn("[offline-queue] blocked sensitive table:", table, "uid:", session.uid);
      }
      failed++;
      continue;
    }
```

- [x] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/app/api/sync/offline-queue/route.ts
git commit -m "fix(security): block profil/kredensial/keuangan from offline-queue"
```

---

### Task 7: Sweep role guard ke route mutation sisa (S-I3)

**Files (semua route mutation tanpa guard saat ini):**
- `src/app/api/passwords/route.ts`, `src/app/api/passwords/[id]/route.ts`
- `src/app/api/cashbook/reorder/route.ts`
- `src/app/api/cashbook/archive/route.ts`, `archive/by-time/route.ts`, `archive/[label]/route.ts`, `archive/restore/route.ts`
- `src/app/api/cashbook/override/[id]/route.ts`
- `src/app/api/cashbook-partner/route.ts`
- `src/app/api/business-actors/route.ts`
- `src/app/api/actor-roles/route.ts`
- `src/app/api/master/categories/reorder/route.ts`, `subcategories/reorder/route.ts`, `units/reorder/route.ts`, `quick-specs/route.ts`, `quick-specs/[id]/route.ts`, `quick-specs/reorder/route.ts`
- `src/app/api/sync/manual/route.ts`, `sync/auto/route.ts`, `sync/route.ts`
- `src/app/api/evaluate/route.ts` (lihat juga Task 14 untuk rate limit)

> Catatan: route berikut SUDAH punya guard, jangan diubah: pengguna, barang, pembelian, pos/sales, pos/pay-receivable, inventori/adjustments, vendors, pelanggan, finishing-options/manage, keuangan/cash-book, keuangan/config/manage, master/{categories,subcategories,units}, produksi.

- [x] **Step 1: Tambah guard seragam di tiap handler POST/PUT/PATCH/DELETE**

Untuk SETIAP file di daftar, tambah di awal handler mutasi:

```ts
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
// ... di awal try:
    await requireAdminOrManager();
// ... di catch, paling atas:
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
```

Pengecualian role: `sync/*` boleh pakai `requireSession()` (semua user login boleh sync data miliknya) — tetapi tetap WAJIB ada minimal `requireSession()`. `passwords/*` (vault) pakai `requireAdminOrManager()`.

- [x] **Step 2: Verifikasi tiap file build**

Run: `npm run type-check && npm run build`
Expected: 0 error.

- [x] **Step 3: Commit per kelompok**

```bash
git add src/app/api/passwords src/app/api/cashbook src/app/api/cashbook-partner src/app/api/business-actors src/app/api/actor-roles src/app/api/master src/app/api/sync src/app/api/evaluate
git commit -m "fix(security): add role guards to remaining mutation routes (S-I3)"
```

---

### Task 8: Adopsi Zod di hot-path mutation (S-I4)

**Files:**
- Create: `src/lib/schemas/pos.ts`, `src/lib/schemas/pembelian.ts`, `src/lib/schemas/inventori.ts`
- Create: `src/lib/__tests__/schemas-pos.test.ts`
- Modify: `src/app/api/pos/sales/route.ts`, `src/app/api/pembelian/route.ts`, `src/app/api/inventori/adjustments/route.ts`, `src/app/api/pos/pay-receivable/route.ts`, `src/app/api/pembelian/pay-debt/route.ts`

- [x] **Step 1: Tulis test gagal untuk schema penjualan**

Create `src/lib/__tests__/schemas-pos.test.ts`:

```ts
import { createSaleSchema } from "../schemas/pos";

describe("createSaleSchema", () => {
  test("menolak jumlah negatif", () => {
    const r = createSaleSchema.safeParse({
      pelanggan_id: "p1",
      metode_pembayaran: "CASH",
      items: [{ barang_id: "b1", jumlah: -1, harga_satuan: 1000 }],
    });
    expect(r.success).toBe(false);
  });

  test("menolak harga NaN / string non-numeric", () => {
    const r = createSaleSchema.safeParse({
      pelanggan_id: "p1",
      metode_pembayaran: "CASH",
      items: [{ barang_id: "b1", jumlah: 1, harga_satuan: "abc" }],
    });
    expect(r.success).toBe(false);
  });

  test("menerima payload valid", () => {
    const r = createSaleSchema.safeParse({
      pelanggan_id: "p1",
      metode_pembayaran: "CASH",
      items: [{ barang_id: "b1", jumlah: 2, harga_satuan: 1000 }],
    });
    expect(r.success).toBe(true);
  });
});
```

- [x] **Step 2: Jalankan test, harus gagal**

Run: `npx jest src/lib/__tests__/schemas-pos.test.ts`
Expected: FAIL (module belum ada).

- [x] **Step 3: Implementasi schema POS**

Create `src/lib/schemas/pos.ts`:

```ts
import { z } from "zod";

const saleItemSchema = z.object({
  barang_id: z.string().min(1),
  jumlah: z.number().positive(),
  harga_satuan: z.number().nonnegative(),
  panjang: z.number().positive().optional(),
  lebar: z.number().positive().optional(),
  jumlah_roll: z.number().int().min(1).optional(),
});

export const createSaleSchema = z.object({
  pelanggan_id: z.string().min(1).nullable().optional(),
  metode_pembayaran: z.enum(["CASH", "NET30", "COD", "TRANSFER"]),
  items: z.array(saleItemSchema).min(1, "Minimal satu item"),
  tanggal: z.string().optional(),
  catatan: z.string().optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
```

Catatan: sesuaikan enum `metode_pembayaran` dengan nilai aktual di `normalizePaymentMethod` (`src/lib/services/pos-mutations.ts`). Verifikasi dulu nilai yang valid sebelum hard-code.

- [x] **Step 4: Pakai schema di route pos/sales**

Di `src/app/api/pos/sales/route.ts`, setelah parse body:

```ts
import { createSaleSchema } from "@/lib/schemas/pos";
// ...
    const parsed = createSaleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data penjualan tidak valid", issues: parsed.error.issues },
        { status: 422 }
      );
    }
    // gunakan parsed.data sebagai input ke service
```

- [x] **Step 5: Ulangi untuk pembelian, inventori/adjustments, pay-receivable, pay-debt**

Buat schema serupa di `schemas/pembelian.ts` dan `schemas/inventori.ts`, pasang `safeParse` di tiap route. Field uang/jumlah pakai `z.number()` (bukan koersi `Number()`), jumlah selalu `.positive()` atau `.nonnegative()`.

- [x] **Step 6: Test + verifikasi + commit**

Run: `npx jest src/lib/__tests__/schemas-pos.test.ts && npm run type-check && npm run build`

```bash
git add src/lib/schemas src/lib/__tests__/schemas-pos.test.ts src/app/api/pos/sales/route.ts src/app/api/pembelian/route.ts src/app/api/inventori/adjustments/route.ts src/app/api/pos/pay-receivable/route.ts src/app/api/pembelian/pay-debt/route.ts
git commit -m "feat(security): Zod validation on hot-path mutation routes (S-I4)"
```

---

### Task 9: Pisah supabase client/admin + server-only (S-I5)

**Files:**
- Create: `src/lib/supabase-admin.ts`
- Modify: `src/lib/supabase.ts` (jadi client-only re-export) atau rename usage
- Modify: semua importer `getSupabaseAdmin`

- [x] **Step 1: Cari semua importer getSupabaseAdmin**

Run (via Grep tool): cari `getSupabaseAdmin` di `src/`. Catat daftar file.

- [x] **Step 2: Buat supabase-admin.ts dengan server-only**

Create `src/lib/supabase-admin.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin credentials not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [x] **Step 3: Hapus getSupabaseAdmin dari supabase.ts**

Di `src/lib/supabase.ts`, hapus fungsi `getSupabaseAdmin` (biarkan anon client + `SYNC_TABLES`). Re-export untuk kompat sementara opsional:

```ts
// Re-export demi kompat; importer baru pakai "@/lib/supabase-admin".
export { getSupabaseAdmin } from "./supabase-admin";
```

> Hati-hati: jika `supabase.ts` di-import dari client component, re-export `server-only` akan memutus build. Verifikasi tidak ada client component yang import `getSupabaseAdmin` dari `supabase.ts`. Jika ada, ganti importnya ke `supabase-admin.ts` langsung dan JANGAN re-export.

- [x] **Step 4: Update importer ke path baru**

Ganti `import { getSupabaseAdmin } from "@/lib/supabase"` → `from "@/lib/supabase-admin"` di semua file server (audit.ts, offline-queue, dll).

- [x] **Step 5: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/lib/supabase.ts src/lib/supabase-admin.ts src/lib
git commit -m "refactor(security): isolate supabase admin behind server-only module (S-I5)"
```

---

### Task 10: Hardening CSP + HSTS (S-I6)

**Files:**
- Modify: `next.config.ts:27-37`

- [x] **Step 1: Tambah HSTS dan rapikan CSP**

Tambah header HSTS di array `headers`:

```ts
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
```

Untuk CSP: `unsafe-inline`/`unsafe-eval` di App Router sulit dilepas tanpa nonce middleware. Langkah aman bertahap:
- Hapus `unsafe-eval` dari `script-src` dan jalankan `npm run build` + smoke test browser (chart Recharts tidak butuh eval). Jika ada error runtime, kembalikan `unsafe-eval` dan catat alasannya di komentar.
- Biarkan `unsafe-inline` untuk sekarang (butuh nonce middleware; di luar scope minimal). Tambah komentar TODO.

```ts
              "script-src 'self' 'unsafe-inline'", // TODO: ganti unsafe-inline dengan nonce
```

- [x] **Step 2: Verifikasi build + smoke test chart**

Run: `npm run build`. Buka halaman laporan/beranda di browser, pastikan chart render.

- [x] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "fix(security): add HSTS, drop unsafe-eval from CSP (S-I6)"
```

---

### Task 11: Pesan login generik (S-I1)

**Files:**
- Modify: `src/lib/services/auth-service.ts:46-70`

- [x] **Step 1: Samakan pesan error login**

Ganti kedua cabang ("Username tidak ditemukan" dan "Password salah") menjadi pesan generik yang sama:

```ts
    if (result.error || !result.data) {
      return { success: false, error: "Kredensial salah" };
    }
    // ...
    if (!ok) {
      return { success: false, error: "Kredensial salah" };
    }
```

Biarkan pesan "Akun tidak aktif" tetap (bukan info enumeration berbahaya, dan UX penting).

- [x] **Step 2: Verifikasi + commit**

Run: `npm run type-check`

```bash
git add src/lib/services/auth-service.ts
git commit -m "fix(security): generic login error to prevent user enumeration (S-I1)"
```

---

### Task 12: SESSION_SECRET length + JWT TTL/revocation (S-I2, O-I8)

**Files:**
- Modify: `src/lib/session.ts`
- Migration baru: kolom `session_version` di `profil` (opsional, untuk revocation)

- [x] **Step 1: Validasi panjang secret di getEncodedSecret**

Ganti `getEncodedSecret`:

```ts
function getEncodedSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw) {
    throw new Error("SESSION_SECRET is not set");
  }
  if (raw.length < 32) {
    throw new Error("SESSION_SECRET harus minimal 32 karakter");
  }
  return new TextEncoder().encode(raw);
}
```

- [x] **Step 2: Putuskan strategi TTL (catat keputusan)**

TTL 7 hari + revocation penuh butuh refresh token / middleware check tiap request — perubahan besar. Untuk aplikasi internal 2-5 user (lihat `.cursorrules`), keputusan pragmatis: **turunkan TTL ke 24 jam** sebagai kompromi, tanpa refresh-token infra. Ubah `setExpirationTime("7d")` → `setExpirationTime("24h")` dan `maxAge` cookie → `60 * 60 * 24`.

```ts
    .setExpirationTime("24h")
// dan
      maxAge: 60 * 60 * 24,
```

Catat di summary: revocation instan (session_version) di-skip karena overhead per-request tidak sebanding untuk 2-5 user; mitigasi = TTL pendek.

- [x] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/lib/session.ts
git commit -m "fix(security): enforce SESSION_SECRET length, shorten JWT TTL to 24h (S-I2, O-I8)"
```

---

### Task 13: Hardening cashbook import CSRF (S-I8)

**Files:**
- Modify: `src/app/api/cashbook/import/route.ts`

- [x] **Step 1: Guard + cek Origin + batas ukuran**

Di awal handler POST:

```ts
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
// ...
    await requireAdminOrManager();

    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      return apiError("Origin tidak diizinkan", 403);
    }

    const len = Number(request.headers.get("content-length") || 0);
    if (len > 5 * 1024 * 1024) {
      return apiError("File terlalu besar (maks 5MB)", 413);
    }
```

Tangani `AuthGuardError` di catch.

- [x] **Step 2: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/app/api/cashbook/import/route.ts
git commit -m "fix(security): guard + origin + size limit on cashbook import (S-I8)"
```

---

### Task 14: Rate limit endpoint /api/evaluate (S-I9)

**Files:**
- Modify: `src/lib/rate-limit.ts` (tambah limiter)
- Modify: `src/app/api/evaluate/route.ts`

- [x] **Step 1: Tambah limiter evaluate**

Di `src/lib/rate-limit.ts`:

```ts
const evaluateLimiter = makeLimiter("rl:evaluate", 30, "1 m");
// ...
export { loginLimiter, registerLimiter, syncApiLimiter, offlineQueueLimiter, evaluateLimiter };
```

- [x] **Step 2: Pasang di route evaluate**

Di awal handler POST `evaluate/route.ts`:

```ts
import { limitOrPass, evaluateLimiter } from "@/lib/rate-limit";
// ...
    const limited = await limitOrPass(evaluateLimiter, request, "evaluate");
    if (!limited.ok) {
      return apiError("Terlalu banyak permintaan", 429);
    }
```

- [x] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/lib/rate-limit.ts src/app/api/evaluate/route.ts
git commit -m "fix(security): rate limit /api/evaluate (S-I9)"
```

---

### Task 15: Minor security cleanup

**Files:**
- Modify: `src/lib/session.ts` (cookie prefix)
- Modify: `src/lib/services/auth-service.ts` (timingSafeEqual untuk SHA-256 legacy)
- Modify: `src/lib/db-unified.ts` (whitelist identifier — lihat juga Fase 2)

- [x] **Step 1: Cookie prefix __Host- (opsional, hanya jika selalu HTTPS)**

Hanya jika production selalu HTTPS dan tidak ada subpath. Ganti `SESSION_COOKIE = "gp_session"` → `"__Host-gp_session"` dan pastikan cookie `path: "/"`, `secure: true`, tanpa `domain`. Catat: di dev (http) ini akan gagal di-set; gate dengan env atau biarkan untuk production saja. Jika ragu, SKIP dan catat di summary.

- [x] **Step 2: timingSafeEqual untuk perbandingan hash legacy SHA-256**

Cari perbandingan `===` pada hash SHA-256 legacy di `auth-service.ts`/`password-hash.ts`. Ganti dengan `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` (samakan panjang dulu).

- [x] **Step 3: Verifikasi + commit**

Run: `npm run type-check && npm test`

```bash
git add src/lib/session.ts src/lib/services/auth-service.ts
git commit -m "fix(security): minor hardening (timing-safe compare, cookie prefix)"
```

---

## Self-Review Fase 1

Cakupan temuan review bagian 1 (Security) + U-C1:

| Temuan | Task | Status |
| ------ | ---- | ------ |
| S-C1 / U-C1 backdoor shortcut | Task 1 | ✓ |
| S-C2 vault salt/secret | Task 2 | ✓ |
| S-C3 guard pengguna | Task 4 | ✓ |
| S-C4 offline-queue | Task 6 | ✓ |
| S-C5 cashbook delete-all/formula | Task 5 | ✓ |
| S-I1 user enumeration | Task 11 | ✓ |
| S-I2 JWT TTL | Task 12 | ✓ |
| S-I3 sweep guard | Task 3 (helper) + Task 7 | ✓ |
| S-I4 Zod | Task 8 | ✓ |
| S-I5 supabase split | Task 9 | ✓ |
| S-I6 CSP/HSTS | Task 10 | ✓ |
| S-I7 audit coverage | Task 3 + dipasang di Task 4,5 | ✓ |
| S-I8 cashbook import CSRF | Task 13 | ✓ |
| S-I9 evaluate rate limit | Task 14 | ✓ |
| Minor (cookie, timingSafe, identifier) | Task 15 (+ Fase 2 untuk identifier) | ✓ |
| O-I8 SESSION_SECRET length | Task 12 | ✓ |

Catatan: S-I7 (audit coverage) ditanam sebagai bagian dari tiap guard task, bukan task tersendiri — `withAudit`/`logAudit` dipasang di Task 4, 5, dan diharapkan ikut di Task 7 untuk mutasi sensitif.

## Verifikasi akhir Fase 1

```bash
npm run type-check   # 0 errors
npm run lint         # tanpa warning baru
npm run build        # sukses
npm test             # semua pass (termasuk crypto, with-role-guard, schemas-pos)
```

## Catatan untuk owner (Bahasa Indonesia)

- Setelah ganti format enkripsi vault, kredensial lama (wifi/email vendor) perlu di-input ulang sekali di Pengaturan.
- Set `PASSWORD_ENC_SECRET` dan `SESSION_SECRET` (min 32 karakter) di Vercel sebelum deploy production; tanpa itu app akan menolak start (ini disengaja demi keamanan).
- Sesi login sekarang berlaku 24 jam (sebelumnya 7 hari) agar lebih aman.

