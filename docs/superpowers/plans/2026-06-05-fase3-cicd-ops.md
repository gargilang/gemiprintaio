# Fase 3 — CI/CD, Ops & Tooling Implementation Plan

> **Untuk agentic workers:** REQUIRED SUB-SKILL: gunakan superpowers:subagent-driven-development (disarankan) atau superpowers:executing-plans untuk eksekusi task demi task. Semua step pakai checkbox (`- [x]`).

**Goal:** Menambah CI/CD, guard script destruktif, mengamankan Tauri SQL command, membersihkan dead deps, dan menambah observability (O-C1..O-C4, O-I1..O-I9, minor ops).

**Architecture:** GitHub Actions untuk lint+type+test+build di PR; husky pre-commit; helper guard bersama untuk semua script ops destruktif; allowlist tabel/kolom di Tauri Rust; Sentry + structured logging opsional.

**Tech Stack:** GitHub Actions, husky + lint-staged, Node scripts (pg), Rust (rusqlite), @sentry/nextjs, pino.

**Sumber temuan:** `docs/superpowers/specs/2026-06-04-codebase-review.md` bagian 4 (Testing, Dependency, dan Ops). Coverage testing detail ada di Fase 4.

---

## File Structure

- Create: `.github/workflows/ci.yml` — CI pipeline.
- Create: `.husky/pre-commit`, modify `package.json` (lint-staged, scripts).
- Create: `scripts/_lib/guard.mjs` — guard bersama untuk script destruktif.
- Modify: `scripts/wipe-supabase-public.mjs`, `seed-stress-test-data.mjs`, `remove-stress-test-data.mjs`, `apply-supabase-schema.mjs`, `apply-migration.mjs` — pakai guard.
- Create: `scripts/check-versions.mjs` — cek drift version 3 sumber.
- Create: `scripts/smoke-standalone.mjs` — smoke test Tauri standalone bundle.
- Modify: `src-tauri/src/main.rs` — allowlist tabel/kolom di db_insert/update/delete.
- Modify: `package.json` — hapus prisma, @types/bcryptjs, bump zod.
- Create: `src/lib/log.ts` — wrapper logging.
- Modify: `jest.config.js` — coverageThreshold (sebagian; jsdom project di Fase 4).

---

### Task 1: CI workflow GitHub Actions (O-C1)

**Files:**
- Create: `.github/workflows/ci.yml`

- [x] **Step 1: Tulis workflow CI**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Type check
        run: npm run type-check
      - name: Test
        run: npm test
      - name: Build
        run: npm run build
        env:
          SESSION_SECRET: ci-session-secret-32-bytes-minimum-xx
          PASSWORD_ENC_SECRET: ci-password-enc-secret-32-bytes-min
```

> Catatan: `npm run build` butuh env wajib setelah Fase 1 (fail-fast). Sediakan secret dummy di CI. `better-sqlite3` native: `npm ci` di ubuntu sudah compile; jika gagal, tambah step `npm rebuild better-sqlite3`.

- [x] **Step 2: Verifikasi workflow valid (lokal)**

Run: `npm run lint && npm run type-check && npm test && npm run build` lokal untuk memastikan semua step lulus sebelum push.

- [x] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint+type+test+build pipeline on PR (O-C1)"
```

- [x] **Step 4: Verifikasi di GitHub**

Push branch, buka PR, pastikan check CI muncul dan hijau.

---

### Task 2: Husky pre-commit + lint-staged (O-C1)

**Files:**
- Modify: `package.json`
- Create: `.husky/pre-commit`

- [x] **Step 1: Install husky + lint-staged**

Run: `npm install -D husky lint-staged`

- [x] **Step 2: Inisialisasi husky**

Run: `npx husky init`

- [x] **Step 3: Konfigurasi pre-commit**

Isi `.husky/pre-commit`:

```sh
npx lint-staged
```

Tambah di `package.json`:

```json
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix"
    ]
  }
```

> Type-check penuh di pre-commit bisa lambat; serahkan `tsc --noEmit` ke CI. Pre-commit cukup eslint --fix pada file staged agar cepat.

- [x] **Step 4: Verifikasi**

Buat commit dummy yang menyentuh satu file .ts dengan masalah lint kecil; pastikan hook jalan dan auto-fix.

- [x] **Step 5: Commit**

```bash
git add package.json .husky package-lock.json
git commit -m "ci: husky pre-commit with lint-staged eslint --fix (O-C1)"
```

---

### Task 3: Guard bersama untuk script destruktif (O-C3, O-I4)

**Files:**
- Create: `scripts/_lib/guard.mjs`
- Modify: `scripts/wipe-supabase-public.mjs`, `seed-stress-test-data.mjs`, `remove-stress-test-data.mjs`, `apply-supabase-schema.mjs`, `apply-migration.mjs`

- [x] **Step 1: Buat helper guard**

Create `scripts/_lib/guard.mjs`:

```js
import readline from "node:readline";

/** Ekstrak host dari connection string Postgres. */
export function getHost(connectionString) {
  try {
    return new URL(connectionString).host;
  } catch {
    return "(tidak diketahui)";
  }
}

/** Project ref produksi yang dilindungi (sesuaikan dengan project Anda). */
const PROD_PROJECT_REFS = ["fufrztzerditoctgzbcn"];

export function isProdHost(connectionString) {
  const host = getHost(connectionString);
  return PROD_PROJECT_REFS.some((ref) => host.includes(ref));
}

export async function confirmOrExit({ connectionString, action, allowProd }) {
  const host = getHost(connectionString);
  const dryRun = process.argv.includes("--dry-run");
  const confirm = process.argv.includes("--confirm");
  const allowProdFlag = process.argv.includes("--allow-prod");

  console.log(`About to ${action} on host: ${host}`);

  if (dryRun) {
    console.log("[DRY RUN] Tidak ada perubahan yang ditulis.");
    process.exit(0);
  }

  if (isProdHost(connectionString) && !(allowProd && allowProdFlag)) {
    console.error(
      `REFUSE: host terdeteksi sebagai produksi (${host}). Pakai --allow-prod untuk override (berbahaya).`
    );
    process.exit(1);
  }

  if (!confirm) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((res) =>
      rl.question(`Lanjutkan ${action} pada ${host}? [y/N] `, res)
    );
    rl.close();
    if (answer.trim().toLowerCase() !== "y") {
      console.log("Dibatalkan.");
      process.exit(0);
    }
  }
}
```

- [x] **Step 2: Pakai guard di wipe-supabase-public.mjs**

Sebelum `await client.query(sql)`, tambah:

```js
import { confirmOrExit } from "./_lib/guard.mjs";
// ...
await confirmOrExit({
  connectionString,
  action: "DROP SCHEMA public CASCADE (WIPE)",
  allowProd: true,
});
```

- [x] **Step 3: Pakai guard di script destruktif lain**

Tambahkan `confirmOrExit` di `seed-stress-test-data.mjs`, `remove-stress-test-data.mjs`, `apply-supabase-schema.mjs`, `apply-migration.mjs` dengan `action` deskriptif masing-masing. `apply-migration` boleh `allowProd: true` (migrasi memang kadang ke prod) tapi tetap minta konfirmasi.

- [x] **Step 4: Verifikasi (dry-run)**

Run: `node scripts/wipe-supabase-public.mjs --dry-run`
Expected: cetak host + "[DRY RUN]" lalu exit 0, tanpa menulis.

- [x] **Step 5: Commit**

```bash
git add scripts/_lib/guard.mjs scripts/wipe-supabase-public.mjs scripts/seed-stress-test-data.mjs scripts/remove-stress-test-data.mjs scripts/apply-supabase-schema.mjs scripts/apply-migration.mjs
git commit -m "fix(ops): confirmation + prod guard + dry-run on destructive scripts (O-C3, O-I4)"
```

---

### Task 4: Allowlist tabel/kolom di Tauri SQL command (O-C2)

**Files:**
- Modify: `src-tauri/src/main.rs:543-737` (db_insert, db_update, db_delete)

**Konteks:** `db_insert/update/delete` interpolasi nama tabel + kolom langsung. XSS/supply-chain di webview = baca/tulis SQLite penuh.

- [x] **Step 1: Tambah validasi identifier di Rust**

Tambah helper sebelum command:

```rust
fn is_safe_identifier(name: &str) -> bool {
    !name.is_empty()
        && name.chars().next().map_or(false, |c| c.is_ascii_lowercase() || c == '_')
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}
```

- [x] **Step 2: Validasi table + column di db_insert/db_update/db_delete**

Di awal tiap command yang menerima `table` dan kolom, tolak jika tidak valid:

```rust
    if !is_safe_identifier(&table) {
        return Err(format!("Nama tabel tidak valid: {}", table));
    }
    for col in data.keys() {
        if !is_safe_identifier(col) {
            return Err(format!("Nama kolom tidak valid: {}", col));
        }
    }
```

- [x] **Step 3: (Opsional kuat) allowlist tabel dari SYNC_V2_TABLES**

Tambah konstanta daftar tabel yang diizinkan di Rust dan tolak yang di luar daftar. Sinkron dengan `SYNC_V2_TABLES`. Jika terlalu rapuh untuk dipelihara manual, cukup regex identifier di Step 1-2.

- [x] **Step 4: Verifikasi build Tauri**

Run: `cargo check` di `src-tauri` (atau `npm run tauri:build` jika toolchain ada). Pastikan kompilasi sukses.

- [x] **Step 5: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "fix(security): validate table/column identifiers in Tauri SQL commands (O-C2)"
```

> Catatan: `db_query`/`db_query_one`/`db_execute` menerima raw SQL — ini dipakai oleh adapter db-unified yang sudah pakai parameterized params. Mempersempit ini ke command-per-tabel adalah refactor besar; di luar scope minimal. Validasi identifier di insert/update/delete menutup vektor terburuk (interpolasi nama).

---

### Task 5: Hapus dead dependency Prisma + cleanup deps (O-I2, O-I9, minor)

**Files:**
- Modify: `package.json`

- [x] **Step 1: Konfirmasi Prisma tidak dipakai**

Run (Grep): cari `@prisma/client` dan `from "prisma"` di `src/`. Pastikan 0 hasil dan tidak ada `prisma/schema.prisma`.

- [x] **Step 2: Uninstall prisma + types bcryptjs mismatch**

Run:

```bash
npm uninstall @prisma/client prisma @types/bcryptjs
```

(`bcryptjs` 3.x sudah ship types sendiri; `@types/bcryptjs` 2.4.6 mismatch.)

- [x] **Step 3: Bump zod**

Run: `npm install zod@^3.25`

- [x] **Step 4: Tambah komentar overrides**

Di `package.json`, tambah field `"//"` menjelaskan alasan tiap override:

```json
  "overrides": {
    "//": "baseline-browser-mapping & postcss dipin demi kompat build; lihat DEPS notes",
    "baseline-browser-mapping": "2.10.21",
    "postcss": "8.5.10"
  },
```

- [x] **Step 5: Verifikasi + commit**

Run: `npm run type-check && npm run build && npm test`

```bash
git add package.json package-lock.json
git commit -m "chore(deps): remove prisma dead dep, drop @types/bcryptjs, bump zod (O-I2, O-I9)"
```

---

### Task 6: Cek drift version 3 sumber (O-I6)

**Files:**
- Create: `scripts/check-versions.mjs`
- Modify: `package.json` (script)

- [x] **Step 1: Tulis script cek version**

Create `scripts/check-versions.mjs`:

```js
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const tauriConf = JSON.parse(
  readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8")
).version;
const cargoToml = readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const all = { pkg, tauriConf, cargoVersion };
const unique = new Set(Object.values(all));
if (unique.size !== 1) {
  console.error("Version drift terdeteksi:", all);
  process.exit(1);
}
console.log("Version sinkron:", pkg);
```

- [x] **Step 2: Tambah script + panggil di CI**

Di `package.json` scripts: `"check:versions": "node scripts/check-versions.mjs"`. Tambah step di `.github/workflows/ci.yml` setelah install:

```yaml
      - name: Check version sync
        run: npm run check:versions
```

- [x] **Step 3: Verifikasi + commit**

Run: `npm run check:versions`
Expected: "Version sinkron: 0.1.0".

```bash
git add scripts/check-versions.mjs package.json .github/workflows/ci.yml
git commit -m "ci: enforce version sync across package/tauri/cargo (O-I6)"
```

---

### Task 7: Smoke test Tauri standalone bundle (O-I5)

**Files:**
- Create: `scripts/smoke-standalone.mjs`
- Modify: `package.json`

- [x] **Step 1: Tulis smoke test**

Create `scripts/smoke-standalone.mjs`:

```js
import { spawn } from "node:child_process";
import { join } from "node:path";

const PORT = 30000 + Math.floor(Math.random() * 5000);
const serverPath = join(process.cwd(), ".next", "standalone", "server.js");

const proc = spawn("node", [serverPath], {
  env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1" },
  stdio: "inherit",
});

const deadline = Date.now() + 30000;
async function poll() {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/auth/me`);
      if (res.status === 200 || res.status === 401) {
        console.log("Smoke OK: server boot, /api/auth/me =", res.status);
        proc.kill();
        process.exit(0);
      }
    } catch {
      // belum siap
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error("Smoke FAIL: server tidak merespons dalam 30 detik");
  proc.kill();
  process.exit(1);
}
poll();
```

- [x] **Step 2: Tambah script**

`package.json`: `"smoke:standalone": "node scripts/smoke-standalone.mjs"`. Jalankan setelah `npm run build:tauri && npm run prepare:standalone`.

- [x] **Step 3: Verifikasi + commit**

Run (jika standalone sudah dibangun): `npm run smoke:standalone`

```bash
git add scripts/smoke-standalone.mjs package.json
git commit -m "ci: smoke test standalone bundle boots and serves API (O-I5)"
```

---

### Task 8: Observability — structured logging + Sentry (O-I7)

**Files:**
- Create: `src/lib/log.ts`
- Modify: route handlers (bertahap), `next.config.ts` (jika pakai Sentry wizard)

- [x] **Step 1: Buat wrapper logging ringan**

Create `src/lib/log.ts`:

```ts
type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
```

- [x] **Step 2: Ganti console.error kritis di route dengan log.error**

Mulai dari route hot path (pos/sales, pembelian, auth). Ganti `console.error("...", e)` → `log.error("create_sale_failed", { error: String(e) })`. Lakukan bertahap; tidak harus semua sekaligus.

- [x] **Step 3: (Opsional) Pasang Sentry**

Jika owner mau alerting: `npx @sentry/wizard@latest -i nextjs`, set `SENTRY_DSN` di Vercel. Bungkus route penting. Free tier cukup. Catat di summary bahwa ini opsional dan butuh akun Sentry.

- [x] **Step 4: Verifikasi + commit**

Run: `npm run type-check && npm run build`

```bash
git add src/lib/log.ts src/app/api
git commit -m "feat(ops): structured logging wrapper (O-I7)"
```

---

### Task 9: jest coverageThreshold + mock-db guard + bcryptjs (minor, O-I3)

**Files:**
- Modify: `jest.config.js`
- Modify: `src/lib/__tests__/helpers/mock-db.ts`
- Modify: `src/lib/password-hash.ts` (komentar/verifikasi rate limit)

- [x] **Step 1: Tambah coverageThreshold konservatif**

Di `jest.config.js`, tambah:

```js
  coverageThreshold: {
    global: {
      statements: 40,
      branches: 30,
      functions: 40,
      lines: 40,
    },
  },
```

> Angka awal konservatif agar tidak langsung gagal; naikkan setelah Fase 4 menambah test API. Tujuannya supaya coverage tidak turun diam-diam.

- [x] **Step 2: mock-db throw pada operator tak didukung**

Di `mock-db.ts`, jika menemui operator where selain equality yang belum didukung (IN/LIKE), `throw new Error("Operator where belum didukung di mock-db: ...")` daripada diam mengembalikan hasil salah.

- [x] **Step 3: Verifikasi rate limit login per-username (O-I3)**

Konfirmasi `/api/auth/login` sudah pakai `loginLimiter` (5/menit per IP). Tambah catatan: bcryptjs cost 12 tetap (Edge tidak punya argon2); untuk Node runtime murni bisa dipertimbangkan `node:crypto scrypt` di masa depan. Tidak ada perubahan kode wajib di sini selain memastikan limiter wired.

- [x] **Step 4: Verifikasi + commit**

Run: `npm test`

```bash
git add jest.config.js src/lib/__tests__/helpers/mock-db.ts
git commit -m "test(ops): coverage threshold + mock-db unsupported-operator guard (O-I3)"
```

---

### Task 10: Minor ops cleanup

**Files:**
- Modify: `package.json` (komentar overrides — jika belum di Task 5)
- Pertimbangkan: `xlsx` → `exceljs` untuk path baru, test naming consistency

- [x] **Step 1: Catat xlsx risk**

`xlsx` 0.18.5 (SheetJS community) tanpa semver guarantee + riwayat prototype-pollution. JANGAN ganti sekarang (berisiko regresi import/export), tapi tambah catatan di summary bahwa path BARU sebaiknya pakai `exceljs`.

- [x] **Step 2: Konsistensi penamaan test (opsional)**

Pilih satu bahasa untuk `describe`/`test`. Sesuai `.cursorrules` (Indonesia-first), gunakan Bahasa Indonesia untuk deskripsi test baru. Tidak perlu refactor test lama secara massal.

- [x] **Step 3: Commit (jika ada perubahan)**

```bash
git add package.json
git commit -m "docs(deps): note xlsx risk and test-naming convention"
```

---

## Self-Review Fase 3

| Temuan | Task | Status |
| ------ | ---- | ------ |
| O-C1 CI/CD | Task 1 + Task 2 | ✓ |
| O-C2 Tauri raw SQL | Task 4 | ✓ |
| O-C3 wipe tanpa guard | Task 3 | ✓ |
| O-C4 0 test API | (Fase 4) | → Fase 4 |
| O-I1 jsdom test env | (Fase 4) | → Fase 4 |
| O-I2 prisma dead dep | Task 5 | ✓ |
| O-I3 bcryptjs cost | Task 9 | ✓ |
| O-I4 script destruktif lain | Task 3 | ✓ |
| O-I5 smoke test standalone | Task 7 | ✓ |
| O-I6 version drift | Task 6 | ✓ |
| O-I7 observability | Task 8 | ✓ |
| O-I8 SESSION_SECRET length | (Fase 1 Task 12) | ✓ Fase 1 |
| O-I9 zod outdated | Task 5 | ✓ |
| Minor (xlsx, mock-db, coverage, test naming) | Task 9, Task 10 | ✓ |

Catatan: O-C4 dan O-I1 (testing) sengaja dipindah ke Fase 4 karena butuh setup test runner tersendiri. CI di Task 1 sudah menjalankan `npm test`, jadi begitu Fase 4 menambah test API, CI otomatis melindunginya.

## Verifikasi akhir Fase 3

```bash
npm run lint && npm run type-check && npm test && npm run build
npm run check:versions
node scripts/wipe-supabase-public.mjs --dry-run   # harus aman, tidak menulis
```

CI: PR harus menampilkan check hijau.

## Catatan untuk owner (Bahasa Indonesia)

- Sekarang setiap perubahan yang masuk lewat PR otomatis dicek (lint, type, test, build). Bug build tidak bisa lolos ke main diam-diam.
- Script berbahaya (wipe database) sekarang minta konfirmasi dan menolak kalau target adalah database produksi.
- Aplikasi desktop (Tauri) lebih aman dari penyalahgunaan akses database lokal.
- Set secret dummy di GitHub Actions tidak perlu; CI sudah menyediakannya untuk build.

