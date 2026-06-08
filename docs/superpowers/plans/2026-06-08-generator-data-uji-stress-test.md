# Generator Data Uji Stress Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun generator data uji sintetis yang menjalankan transaksi ber-item (maklon, banner roll, pembelian, pelunasan, VOID) lewat endpoint produksi aplikasi untuk stress test, lengkap dengan token per-run dan perintah bersih-bersih.

**Architecture:** Skrip Node ESM di `scripts/uji/` berbicara ke aplikasi via HTTP ke localhost memakai `Authorization: Bearer <token>` (token dari `POST /api/auth/login`). Lapisan dipisah: `klien-http` (auth + fetch + guard localhost), `primitif` (satu fungsi per endpoint), `pola` (data realistis hasil ekstrak sheet), `skenario` (komposisi transaksi), `bersihkan` (void/hapus by token), `index` (CLI). Dua perbaikan aplikasi prasyarat: seed placeholder maklon di Supabase, dan terima `tipe_vendor` di `POST /api/vendors`.

**Tech Stack:** Node 22 ESM, fetch bawaan, Next.js API routes, Supabase lokal, Zod (schema sudah ada). Verifikasi: `npm run type-check`, `npm run build`, `node --check`.

---

### Task 1: Seed placeholder maklon di Supabase

**Konteks:** Kode POS mematok keras `barang_id: "barang-jasa-maklon"` + `harga_satuan_id: "harga-jasa-maklon-pcs"` (`src/lib/services/pos-mutations.ts` ~618). Placeholder ini di-seed di SQLite (`src/lib/db-sqlite-migrations.ts` ~1756) tapi TIDAK di Supabase (migrasi `20260523230000_maklon_support.sql` baris 106-107 sengaja menghapusnya). Akibatnya semua transaksi maklon gagal FK di web. Tambahkan seed idempoten ke `supabase/seed-default-values.sql` agar `supabase:local:reset` mengembalikannya.

**Files:**
- Modify: `supabase/seed-default-values.sql` (tambah di akhir, sebelum baris penutup bila ada)

- [ ] **Step 1: Tambahkan blok seed placeholder maklon**

Tambahkan ke `supabase/seed-default-values.sql` (idempoten, kolom mengikuti yang dipakai SQLite: `barang` butuh `kategori_id` valid `cat-lain-lain` yang sudah di-seed di file ini):

```sql
-- Placeholder barang untuk pekerjaan maklon (subkontrak). Dipakai keras oleh
-- pos-mutations.ts; tanpa baris ini semua penjualan maklon gagal FK di web.
INSERT INTO barang
  (id, nama, deskripsi, kategori_id, satuan_dasar, jumlah_stok,
   level_stok_minimum, lacak_inventori_status, butuh_dimensi_status)
VALUES
  ('barang-jasa-maklon', 'Jasa Maklon Cetak',
   'Placeholder untuk pekerjaan yang dikerjakan vendor subkontraktor (auto-generated, jangan diedit).',
   'cat-lain-lain', 'pcs', 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO harga_barang_satuan
  (id, barang_id, nama_satuan, faktor_konversi, harga_beli, harga_jual, harga_member, default_status, urutan_tampilan)
VALUES
  ('harga-jasa-maklon-pcs', 'barang-jasa-maklon', 'pcs', 1, 0, 0, 0, 1, 0)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Nama tabel/kolom sudah diverifikasi terhadap `supabase/schema.sql`**

Sudah dipastikan: tabel `barang` (baris 92) punya kolom `id, nama, deskripsi, kategori_id, satuan_dasar, jumlah_stok, level_stok_minimum, lacak_inventori_status, butuh_dimensi_status`. Tabel harga bernama `harga_barang_satuan` (baris 248, BUKAN `harga_satuan`) dengan kolom `id, barang_id, nama_satuan, faktor_konversi, harga_beli, harga_jual, harga_member, default_status, urutan_tampilan`. Tidak perlu mengubah SQL Step 1.

- [ ] **Step 3: Terapkan seed ke Supabase lokal**

Run: `npm run supabase:local:reset`
Expected: selesai tanpa error; seed dijalankan.

- [ ] **Step 4: Verifikasi baris ada**

Run (psql lokal, sesuaikan koneksi bila perlu):
`npx supabase db query "select id from barang where id='barang-jasa-maklon'; select id from harga_barang_satuan where id='harga-jasa-maklon-pcs';"`
Expected: dua baris kembali (placeholder + harga satuannya).

- [ ] **Step 5: Commit**

```bash
git add supabase/seed-default-values.sql
git commit -m "fix: seed placeholder maklon di Supabase (samakan dengan SQLite)"
```

### Task 2: Terima `tipe_vendor` di POST /api/vendors

**Konteks:** `POST /api/vendors` (`src/app/api/vendors/route.ts`) tidak men-destructure `tipe_vendor`, sehingga vendor selalu dibuat default `SUPPLIER`. Maklon butuh vendor `SUBKONTRAKTOR`. `createVendor` sudah meneruskan field apa pun via spread, dan tipe `Vendor` sudah punya `tipe_vendor?: "SUPPLIER" | "SUBKONTRAKTOR" | "KEDUANYA"` (`src/lib/services/vendors-service.ts:26`). Jadi cukup salurkan dari body ke service.

**Files:**
- Modify: `src/app/api/vendors/route.ts` (POST handler: blok destructure ~30-39 dan `createVendor(...)` ~60-69)

- [ ] **Step 1: Tambahkan `tipe_vendor` ke destructure body POST**

Di `src/app/api/vendors/route.ts`, ubah blok destructure dalam `POST` menjadi:

```ts
    const {
      nama_perusahaan,
      email,
      telepon,
      alamat,
      kontak_person,
      ketentuan_bayar,
      aktif_status,
      catatan,
      tipe_vendor,
    } = body;
```

- [ ] **Step 2: Teruskan `tipe_vendor` ke createVendor (validasi enum)**

Di pemanggilan `createVendor({ ... })` dalam `POST`, tambahkan field terakhir:

```ts
      catatan: catatan?.trim() || null,
      tipe_vendor:
        tipe_vendor === "SUBKONTRAKTOR" || tipe_vendor === "KEDUANYA"
          ? tipe_vendor
          : "SUPPLIER",
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/vendors/route.ts
git commit -m "fix: POST /api/vendors terima tipe_vendor (dukung SUBKONTRAKTOR untuk maklon)"
```

### Task 3: Klien HTTP (auth Bearer + guard localhost)

**Konteks:** Login `POST /api/auth/login` mengembalikan `{ success, user, token }` di body. Middleware menerima `Authorization: Bearer <token>` (`src/middleware.ts:132-134`). Jadi skrip tidak perlu cookie jar — cukup simpan token dan kirim sebagai Bearer di tiap request. Base URL default `http://localhost:3000`. Guard: tolak jika base URL bukan localhost/127.0.0.1, supaya tidak tak sengaja kena cloud.

**Files:**
- Create: `scripts/uji/klien-http.mjs`

- [ ] **Step 1: Tulis klien-http.mjs**

```js
// Klien HTTP untuk generator data uji: login sekali, simpan Bearer token,
// kirim di tiap request. Ada guard wajib localhost.
const BASE_URL = process.env.UJI_BASE_URL || "http://localhost:3000";

function pastikanLocalhost(url) {
  const h = new URL(url).hostname;
  if (h !== "localhost" && h !== "127.0.0.1") {
    throw new Error(
      `Guard: UJI_BASE_URL harus localhost, bukan "${h}". Generator menolak berjalan ke target non-lokal.`
    );
  }
}

let token = null;

export async function login() {
  pastikanLocalhost(BASE_URL);
  const username = process.env.UJI_ADMIN_USER || "gemi";
  const password = process.env.UJI_ADMIN_PASS;
  if (!password) {
    throw new Error(
      "UJI_ADMIN_PASS belum di-set. Set di environment (jangan hardcode kredensial)."
    );
  }
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) {
    throw new Error(`Login gagal (${res.status}): ${data.error || "tidak ada token"}`);
  }
  token = data.token;
  return data.user;
}

async function minta(method, path, body) {
  if (!token) throw new Error("Belum login. Panggil login() dulu.");
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const teks = await res.text();
  let data;
  try {
    data = teks ? JSON.parse(teks) : {};
  } catch {
    data = { raw: teks };
  }
  if (!res.ok) {
    const pesan = data.error || data.message || teks || `HTTP ${res.status}`;
    const err = new Error(`${method} ${path} gagal (${res.status}): ${pesan}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const get = (path) => minta("GET", path);
export const post = (path, body) => minta("POST", path, body);
export const del = (path) => minta("DELETE", path);
export { BASE_URL };
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/uji/klien-http.mjs`
Expected: tidak ada output (lolos).

- [ ] **Step 3: Smoke test login (butuh dev server + Supabase lokal jalan)**

Run: `UJI_ADMIN_PASS=admin node -e "import('./scripts/uji/klien-http.mjs').then(async m=>{const u=await m.login();console.log('OK login sebagai',u.nama_pengguna);})"`
Expected: `OK login sebagai gemi`. Jika dev server belum jalan, jalankan `npm run dev` dulu.

- [ ] **Step 4: Commit**

```bash
git add scripts/uji/klien-http.mjs
git commit -m "feat(uji): klien HTTP dengan auth Bearer dan guard localhost"
```

### Task 4: Pola data realistis + RNG deterministik

**Konteks:** Skenario butuh contoh pekerjaan & kisaran nominal yang realistis (diekstrak dari sheet: banner, lanyard, stiker meteran, nota NCR, neon box, form, jilid; bahan: nota NCR, lem, blanko; kurir Lalamove). RNG ber-seed supaya hasil dapat diulang.

**Files:**
- Create: `scripts/uji/pola.mjs`

- [ ] **Step 1: Tulis pola.mjs**

```js
// Pola data realistis hasil ekstrak sheet "Buku Kas" + RNG deterministik.

// RNG mulberry32: deterministik dari seed integer.
export function buatRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const antara = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
// Bulatkan ke ribuan terdekat (nominal toko realistis).
export const ribuan = (n) => Math.max(1000, Math.round(n / 1000) * 1000);

// Pekerjaan maklon (dikerjakan vendor subkontraktor).
export const PEKERJAAN_MAKLON = [
  "Maklon Cetakan Laser",
  "Maklon Stiker Meteran",
  "Maklon Lanyard 100 Pcs",
  "Maklon Cetak Nota NCR",
  "Maklon Jilid Spiral",
  "Maklon Cetakan Albatros",
  "Maklon Form Hotel",
];

// Nama pelanggan karangan.
export const NAMA_PELANGGAN = [
  "Boca Junior", "Toto Haerudin", "Sri Agustina", "M. Yusuf",
  "Iman Jayadi", "Yanti", "Wawan", "Hendri", "Ismi", "Planet Bakery",
];

// Vendor supplier bahan.
export const VENDOR_SUPPLIER = [
  "CV Sumber Rejeki", "Toko Plastik Jaya", "PD Tinta Makmur",
];

// Vendor subkontraktor (percetakan rekanan).
export const VENDOR_SUBKON = [
  "Percetakan Laser Cepat", "Digital Print Partner", "Sablon Mitra Sejati",
];

// Bahan yang dibeli (non-maklon).
export const BAHAN = [
  { nama: "Nota NCR", satuan: "rim" },
  { nama: "Lem Spanduk", satuan: "kaleng" },
  { nama: "Blanko Undangan", satuan: "pak" },
  { nama: "Mata Ayam", satuan: "pak" },
];

// Biaya operasional.
export const BIAYA_OPERASIONAL = [
  "Bensin", "Kopi", "Detergent", "Iuran Sampah", "Tagihan PAM",
  "Tagihan Internet", "Oli Motor", "Konsumsi Lembur",
];
```

- [ ] **Step 2: Syntax check + uji determinisme RNG**

Run: `node -e "import('./scripts/uji/pola.mjs').then(m=>{const r1=m.buatRng(42),r2=m.buatRng(42);console.log(r1()===r2()?'RNG deterministik OK':'GAGAL');})"`
Expected: `RNG deterministik OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/uji/pola.mjs
git commit -m "feat(uji): pola data realistis + RNG deterministik"
```

### Task 5: Primitif (pembungkus endpoint)

**Konteks:** Satu fungsi tipis per endpoint, memakai kontrak yang sudah diverifikasi:
- `POST /api/pelanggan` body `{ nama, telepon?, alamat?, ... }` → `{ customer: {id,...} }`.
- `POST /api/vendors` body `{ nama_perusahaan, tipe_vendor?, ... }` → `{ vendor: {id,...} }` (butuh Task 2).
- `POST /api/barang` body `{ nama, satuan_dasar, lacak_inventori_status, butuh_dimensi_status, unit_prices:[{nama_satuan,faktor_konversi,harga_jual,harga_beli,default_status}] }` → `{ material: {id,...} }`.
- `POST /api/pos/sales` body sesuai `createSaleSchema` → `{ success, sale:{id,nomor_faktur} }`.
- `POST /api/pembelian` body sesuai `createPurchaseSchema` (wajib `nomor_faktur`) → `{ purchase:{id,...} }`.
- `GET /api/pos/receivables` → `{ receivables:[...] }`; `POST /api/pos/pay-receivable` body `{ piutang_id, jumlah_bayar, ... }`.
- `GET /api/pembelian` → `{ purchases:[...] }`; `POST /api/pembelian/pay-debt` body `{ purchase_id, jumlah_bayar, ... }`.
Semua transaksi menyertakan token `[UJI:<runId>]` di `catatan`/keterangan.

**Files:**
- Create: `scripts/uji/primitif.mjs`

- [ ] **Step 1: Tulis primitif.mjs**

```js
// Primitif: pembungkus tipis tiap endpoint produksi. Semua data uji
// menyertakan token [UJI:<runId>] supaya bisa dibersihkan.
import { get, post } from "./klien-http.mjs";

export function token(runId) {
  return `[UJI:${runId}]`;
}

export async function buatPelanggan(runId, nama, extra = {}) {
  const data = await post("/api/pelanggan", {
    nama,
    alamat: `${token(runId)} alamat uji`,
    telepon: extra.telepon || "0800000000",
    ...extra,
  });
  return data.customer;
}

export async function buatVendor(runId, namaPerusahaan, tipeVendor = "SUPPLIER") {
  const data = await post("/api/vendors", {
    nama_perusahaan: namaPerusahaan,
    tipe_vendor: tipeVendor,
    catatan: token(runId),
  });
  return data.vendor;
}

// Barang biasa (lembaran) atau dimensional (banner roll).
export async function buatBarang(runId, opsi) {
  const {
    nama,
    satuan = "pcs",
    hargaJual = 0,
    hargaBeli = 0,
    lacakInventori = true,
    butuhDimensi = false,
  } = opsi;
  const data = await post("/api/barang", {
    nama,
    deskripsi: `${token(runId)} barang uji`,
    kategori_id: "cat-media-cetak",
    satuan_dasar: satuan,
    lacak_inventori_status: lacakInventori,
    butuh_dimensi_status: butuhDimensi,
    unit_prices: [
      {
        nama_satuan: butuhDimensi ? "m²" : satuan,
        faktor_konversi: 1,
        harga_jual: hargaJual,
        harga_beli: hargaBeli,
        harga_member: hargaJual,
        default_status: 1,
      },
    ],
  });
  return data.material;
}

export async function buatPenjualan(runId, payload) {
  const body = {
    ...payload,
    catatan: `${token(runId)} ${payload.catatan || ""}`.trim(),
  };
  const data = await post("/api/pos/sales", body);
  return data.sale;
}

export async function buatPembelian(runId, payload) {
  const body = {
    ...payload,
    catatan: `${token(runId)} ${payload.catatan || ""}`.trim(),
  };
  const data = await post("/api/pembelian", body);
  return data.purchase;
}

export async function daftarPiutang() {
  const data = await get("/api/pos/receivables");
  return data.receivables || [];
}

export async function bayarPiutang(piutangId, jumlah) {
  return post("/api/pos/pay-receivable", {
    piutang_id: piutangId,
    jumlah_bayar: jumlah,
  });
}

export async function daftarPembelian() {
  const data = await get("/api/pembelian");
  return data.purchases || [];
}

export async function bayarHutang(purchaseId, jumlah) {
  return post("/api/pembelian/pay-debt", {
    purchase_id: purchaseId,
    jumlah_bayar: jumlah,
  });
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/uji/primitif.mjs`
Expected: lolos tanpa output.

- [ ] **Step 3: Commit**

```bash
git add scripts/uji/primitif.mjs
git commit -m "feat(uji): primitif pembungkus endpoint produksi"
```

### Task 6: Setup master data uji

**Konteks:** Setelah reset, belum ada pelanggan/vendor/barang. Skenario butuh: beberapa pelanggan, vendor supplier + subkontraktor, satu banner roll (dimensional), satu barang lembaran, satu jasa. Modul ini membuat semuanya lewat primitif dan mengembalikan referensinya. Fail-fast bila placeholder maklon belum ada (cek via daftar barang).

**Files:**
- Create: `scripts/uji/master-data.mjs`

- [ ] **Step 1: Tulis master-data.mjs**

```js
// Bangun master data uji (pelanggan, vendor, barang) lewat primitif.
import { get } from "./klien-http.mjs";
import {
  buatPelanggan, buatVendor, buatBarang,
} from "./primitif.mjs";
import {
  pick, antara, ribuan, NAMA_PELANGGAN, VENDOR_SUPPLIER, VENDOR_SUBKON,
} from "./pola.mjs";

// Pastikan placeholder maklon ada di DB (Task 1). Tanpa ini, penjualan
// maklon akan gagal FK. Fail-fast dengan pesan jelas.
export async function pastikanPlaceholderMaklon() {
  const data = await get("/api/barang");
  const ada = (data.barang || []).some((b) => b.id === "barang-jasa-maklon");
  if (!ada) {
    throw new Error(
      "Placeholder 'barang-jasa-maklon' tidak ada di DB. Jalankan Task 1 (seed) + `npm run supabase:local:reset` dulu."
    );
  }
}

export async function setupMasterData(runId, rng) {
  await pastikanPlaceholderMaklon();

  const pelanggan = [];
  for (let i = 0; i < 6; i++) {
    pelanggan.push(await buatPelanggan(runId, `${pick(rng, NAMA_PELANGGAN)} ${runId}-${i}`));
  }

  const supplier = [];
  for (let i = 0; i < 2; i++) {
    supplier.push(await buatVendor(runId, `${pick(rng, VENDOR_SUPPLIER)} ${runId}-${i}`, "SUPPLIER"));
  }

  const subkon = [];
  for (let i = 0; i < 2; i++) {
    subkon.push(await buatVendor(runId, `${pick(rng, VENDOR_SUBKON)} ${runId}-${i}`, "SUBKONTRAKTOR"));
  }

  // Banner roll: dimensional (m²). Harga jual per m².
  const bannerRoll = await buatBarang(runId, {
    nama: `Banner Flexi 280gr ${runId}`,
    satuan: "m²",
    hargaJual: ribuan(antara(rng, 18000, 25000)),
    hargaBeli: ribuan(antara(rng, 12000, 16000)),
    lacakInventori: true,
    butuhDimensi: true,
  });

  // Barang lembaran biasa.
  const lembaran = await buatBarang(runId, {
    nama: `Stiker Vinyl A3 ${runId}`,
    satuan: "lembar",
    hargaJual: ribuan(antara(rng, 5000, 9000)),
    hargaBeli: ribuan(antara(rng, 2500, 4000)),
    lacakInventori: true,
    butuhDimensi: false,
  });

  // Jasa (tanpa stok).
  const jasa = await buatBarang(runId, {
    nama: `Jasa Desain ${runId}`,
    satuan: "pcs",
    hargaJual: ribuan(antara(rng, 50000, 150000)),
    hargaBeli: 0,
    lacakInventori: false,
    butuhDimensi: false,
  });

  return { pelanggan, supplier, subkon, bannerRoll, lembaran, jasa };
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/uji/master-data.mjs`
Expected: lolos.

- [ ] **Step 3: Commit**

```bash
git add scripts/uji/master-data.mjs
git commit -m "feat(uji): setup master data + fail-fast placeholder maklon"
```

### Task 7: Skenario transaksi

**Konteks:** Lapisan komposisi yang memakai primitif + pola untuk menghasilkan transaksi realistis. Mengikuti kontrak yang diverifikasi:
- Item maklon: `barang_id:"barang-jasa-maklon"`, `harga_satuan_id:"harga-jasa-maklon-pcs"`, `nama_satuan:"pcs"`, `faktor_konversi:1`, `tipe_item:"MAKLON"`, `vendor_subkontrak_id`, `biaya_subkontrak`, `metode_bayar_vendor:"CASH"|"NET30"`, `deskripsi_pekerjaan`. `harga_satuan` = harga jual ke pelanggan, `subtotal` = jumlah×harga_satuan.
- Item banner roll: `barang_id` = id banner roll, `nama_satuan:"m²"`, `faktor_konversi:1`, `panjang`/`lebar` (meter), `jumlah` = m² = panjang×lebar (qty roll 1 untuk penjualan eceran), `tipe_item:"BARANG"`.
- `total_jumlah` = jumlah semua subtotal. CASH → `jumlah_dibayar=total`, `jumlah_kembalian=0`. NET30 → `jumlah_dibayar=0`, `metode_pembayaran:"NET30"`.
- Pembelian: wajib `nomor_faktur` unik; item `{barang_id, nama_satuan, faktor_konversi, jumlah, harga_satuan}`; dimensional + `panjang/lebar/jumlah_roll` untuk isi stok banner roll.

**Files:**
- Create: `scripts/uji/skenario.mjs`

- [ ] **Step 1: Tulis kerangka + penjualan tunai biasa (lembaran)**

```js
// Skenario: komposisi transaksi realistis dari primitif + pola.
import {
  buatPenjualan, buatPembelian, daftarPiutang, bayarPiutang,
  daftarPembelian, bayarHutang,
} from "./primitif.mjs";
import {
  pick, antara, ribuan, PEKERJAAN_MAKLON, BAHAN,
} from "./pola.mjs";

let nomorFakturUrut = 1;
function nomorFakturVendor(runId) {
  return `UJI-${runId}-PB-${String(nomorFakturUrut++).padStart(4, "0")}`;
}

// Penjualan tunai 1 item lembaran biasa.
export async function penjualanLembaran(runId, rng, master) {
  const qty = antara(rng, 1, 10);
  const harga = master.lembaran.unit_prices?.[0]?.harga_jual
    || ribuan(antara(rng, 5000, 9000));
  const subtotal = qty * harga;
  const pel = pick(rng, master.pelanggan);
  return buatPenjualan(runId, {
    pelanggan_id: pel.id,
    items: [{
      barang_id: master.lembaran.id,
      harga_satuan_id: master.lembaran.unit_prices?.[0]?.id,
      jumlah: qty,
      nama_satuan: "lembar",
      faktor_konversi: 1,
      harga_satuan: harga,
      subtotal,
      tipe_item: "BARANG",
    }],
    total_jumlah: subtotal,
    jumlah_dibayar: subtotal,
    jumlah_kembalian: 0,
    metode_pembayaran: "CASH",
  });
}
```

- [ ] **Step 2: Syntax check kerangka**

Run: `node --check scripts/uji/skenario.mjs`
Expected: lolos.

- [ ] **Step 3: Commit kerangka**

```bash
git add scripts/uji/skenario.mjs
git commit -m "feat(uji): kerangka skenario + penjualan lembaran"
```

- [ ] **Step 4: Tambahkan penjualan maklon (CASH & NET30 ke vendor)**

Tambahkan ke `scripts/uji/skenario.mjs`:

```js
// Penjualan maklon: 1 baris item MAKLON, auto memicu PO ke subkontraktor.
// metodeBayarVendor: "CASH" -> kas keluar; "NET30" -> hutang ke vendor.
export async function penjualanMaklon(runId, rng, master, metodeBayarVendor) {
  const pel = pick(rng, master.pelanggan);
  const vendor = pick(rng, master.subkon);
  const deskripsi = pick(rng, PEKERJAAN_MAKLON);
  const qty = antara(rng, 1, 5);
  const biayaVendorSatuan = ribuan(antara(rng, 50000, 200000)); // HPP ke vendor
  const hargaJualSatuan = ribuan(biayaVendorSatuan * (1.3 + rng() * 0.5)); // margin
  const subtotal = qty * hargaJualSatuan;
  return buatPenjualan(runId, {
    pelanggan_id: pel.id,
    items: [{
      barang_id: "barang-jasa-maklon",
      harga_satuan_id: "harga-jasa-maklon-pcs",
      jumlah: qty,
      nama_satuan: "pcs",
      faktor_konversi: 1,
      harga_satuan: hargaJualSatuan,
      subtotal,
      tipe_item: "MAKLON",
      vendor_subkontrak_id: vendor.id,
      biaya_subkontrak: biayaVendorSatuan,
      metode_bayar_vendor: metodeBayarVendor,
      deskripsi_pekerjaan: deskripsi,
    }],
    total_jumlah: subtotal,
    jumlah_dibayar: subtotal,
    jumlah_kembalian: 0,
    metode_pembayaran: "CASH", // pelanggan bayar tunai
  });
}
```

- [ ] **Step 5: Tambahkan pembelian bahan (isi stok) + penjualan banner roll**

Banner roll harus diisi stok lewat pembelian dimensional dulu, baru bisa dijual. Tambahkan:

```js
// Pembelian bahan lembaran (isi stok barang lembaran), CASH atau NET30.
export async function pembelianBahan(runId, rng, master, metode = "CASH") {
  const vendor = pick(rng, master.supplier);
  const qty = antara(rng, 10, 50);
  const harga = ribuan(antara(rng, 2500, 4000));
  return buatPembelian(runId, {
    nomor_faktur: nomorFakturVendor(runId),
    vendor_id: vendor.id,
    metode_pembayaran: metode,
    items: [{
      barang_id: master.lembaran.id,
      nama_satuan: "lembar",
      faktor_konversi: 1,
      jumlah: qty,
      harga_satuan: harga,
    }],
  });
}

// Pembelian banner roll (dimensional): isi stok via panjang x lebar x jumlah_roll.
export async function pembelianBannerRoll(runId, rng, master, metode = "CASH") {
  const vendor = pick(rng, master.supplier);
  const lebar = pick(rng, [0.9, 1.27, 1.52]); // lebar roll meter
  const panjang = antara(rng, 30, 50); // meter per roll
  const jumlahRoll = antara(rng, 1, 3);
  const hargaPerM2 = ribuan(antara(rng, 12000, 16000));
  const luas = panjang * lebar * jumlahRoll;
  return buatPembelian(runId, {
    nomor_faktur: nomorFakturVendor(runId),
    vendor_id: vendor.id,
    metode_pembayaran: metode,
    items: [{
      barang_id: master.bannerRoll.id,
      nama_satuan: "m²",
      faktor_konversi: 1,
      jumlah: luas,
      harga_satuan: hargaPerM2,
      panjang,
      lebar,
      jumlah_roll: jumlahRoll,
    }],
  });
}

// Penjualan banner roll eceran (kurangi stok): input Lebar x Panjang.
export async function penjualanBannerRoll(runId, rng, master) {
  const pel = pick(rng, master.pelanggan);
  const lebar = pick(rng, [0.9, 1.27]);
  const panjang = antara(rng, 1, 4);
  const luas = panjang * lebar;
  const hargaPerM2 = master.bannerRoll.unit_prices?.[0]?.harga_jual
    || ribuan(antara(rng, 18000, 25000));
  const subtotal = ribuan(luas * hargaPerM2);
  return buatPenjualan(runId, {
    pelanggan_id: pel.id,
    items: [{
      barang_id: master.bannerRoll.id,
      harga_satuan_id: master.bannerRoll.unit_prices?.[0]?.id,
      jumlah: luas,
      nama_satuan: "m²",
      faktor_konversi: 1,
      harga_satuan: hargaPerM2,
      subtotal,
      panjang,
      lebar,
      tipe_item: "BARANG",
    }],
    total_jumlah: subtotal,
    jumlah_dibayar: subtotal,
    jumlah_kembalian: 0,
    metode_pembayaran: "CASH",
  });
}
```

- [ ] **Step 6: Tambahkan penjualan NET30 (piutang) + pelunasan sebagian**

```js
// Penjualan NET30 -> menimbulkan piutang. Kembalikan sale untuk pelunasan.
export async function penjualanNet30(runId, rng, master) {
  const pel = pick(rng, master.pelanggan);
  const qty = antara(rng, 1, 6);
  const harga = ribuan(antara(rng, 50000, 150000));
  const subtotal = qty * harga;
  return buatPenjualan(runId, {
    pelanggan_id: pel.id,
    items: [{
      barang_id: master.jasa.id,
      harga_satuan_id: master.jasa.unit_prices?.[0]?.id,
      jumlah: qty,
      nama_satuan: "pcs",
      faktor_konversi: 1,
      harga_satuan: harga,
      subtotal,
      tipe_item: "JASA",
    }],
    total_jumlah: subtotal,
    jumlah_dibayar: 0,
    jumlah_kembalian: 0,
    metode_pembayaran: "NET30",
  });
}

// Lunasi sebagian piutang uji (token tidak terbawa di receivables, jadi
// lunasi sebagian dari daftar piutang yang ada).
export async function lunasiSebagianPiutang(rng) {
  const piutang = await daftarPiutang();
  if (!piutang.length) return null;
  const p = pick(rng, piutang);
  const sisa = Number(p.sisa_piutang ?? p.sisa ?? 0);
  if (sisa <= 0) return null;
  const bayar = ribuan(Math.max(1000, Math.floor(sisa / 2)));
  return bayarPiutang(p.id ?? p.piutang_id, bayar);
}
```

- [ ] **Step 7: Syntax check seluruh skenario**

Run: `node --check scripts/uji/skenario.mjs`
Expected: lolos.

- [ ] **Step 8: Commit**

```bash
git add scripts/uji/skenario.mjs
git commit -m "feat(uji): skenario maklon, banner roll, pembelian, piutang NET30"
```

### Task 8: Bersih-bersih (void by run-log)

**Konteks:** Endpoint void: `DELETE /api/pos/sales/<id>` (void penjualan, kembalikan stok, otomatis void PO maklon terkait via `deleteMaklonPurchasesForSale`) dan `DELETE /api/pembelian/<id>` (void pembelian). Cara paling andal: generator menulis run-log JSON berisi ID penjualan & pembelian yang dibuat (plus master data). Cleanup membaca log dan void penjualan dulu (agar PO maklon ikut ter-void), lalu pembelian non-maklon yang tersisa. Master data uji (pelanggan/vendor/barang) dibiarkan secara default (tidak punya endpoint void yang aman bila sudah dipakai); cukup catat untuk hapus manual bila perlu. Token `[UJI:<runId>]` tetap tertanam di catatan untuk pencarian manual.

**Files:**
- Create: `scripts/uji/bersihkan.mjs`

- [ ] **Step 1: Tulis bersihkan.mjs**

```js
// Bersih-bersih data uji berdasarkan run-log. Void penjualan dulu (agar PO
// maklon ikut ter-void), lalu pembelian non-maklon yang tersisa.
import { readFile } from "node:fs/promises";
import { del } from "./klien-http.mjs";

export async function bersihkan(runLogPath) {
  const log = JSON.parse(await readFile(runLogPath, "utf8"));
  let okSale = 0, gagalSale = 0, okBeli = 0, gagalBeli = 0;

  for (const id of log.penjualanIds || []) {
    try {
      await del(`/api/pos/sales/${id}`);
      okSale++;
    } catch (e) {
      gagalSale++;
      console.warn(`  void penjualan ${id} gagal: ${e.message}`);
    }
  }

  // Pembelian maklon biasanya sudah ter-void bersama penjualannya; sisanya
  // (pembelian bahan langsung) di-void di sini. Abaikan error "sudah dibatalkan".
  for (const id of log.pembelianIds || []) {
    try {
      await del(`/api/pembelian/${id}`);
      okBeli++;
    } catch (e) {
      const msg = String(e.message || "");
      if (msg.includes("dibatalkan") || msg.includes("tidak ditemukan")) continue;
      gagalBeli++;
      console.warn(`  void pembelian ${id} gagal: ${e.message}`);
    }
  }

  console.log(
    `Bersih-bersih selesai: penjualan ${okSale} ok / ${gagalSale} gagal; ` +
    `pembelian ${okBeli} ok / ${gagalBeli} gagal.`
  );
  if ((log.pelangganIds?.length || log.vendorIds?.length || log.barangIds?.length)) {
    console.log(
      "Catatan: master data uji (pelanggan/vendor/barang) dibiarkan. " +
      "Hapus manual bila perlu, atau jalankan `npm run supabase:local:reset`."
    );
  }
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/uji/bersihkan.mjs`
Expected: lolos.

- [ ] **Step 3: Commit**

```bash
git add scripts/uji/bersihkan.mjs
git commit -m "feat(uji): bersih-bersih via run-log (void penjualan & pembelian)"
```

### Task 9: CLI orkestrator (index.mjs)

**Konteks:** Entry point. Parse argumen: `--skala kecil|besar` (default kecil), `--seed <int>` (default 42), `--bersihkan <path-runlog>`. Mode normal: login → setup master data → jalankan campuran skenario sesuai distribusi (mayoritas omzet+maklon) → tulis run-log JSON ke `scripts/uji/run-<timestamp>.json`. Mode bersihkan: panggil `bersihkan(path)`.

**Files:**
- Create: `scripts/uji/index.mjs`

- [ ] **Step 1: Tulis index.mjs**

```js
// CLI generator data uji. Mode normal (generate) atau --bersihkan <runlog>.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { login } from "./klien-http.mjs";
import { setupMasterData } from "./master-data.mjs";
import { buatRng } from "./pola.mjs";
import { bersihkan } from "./bersihkan.mjs";
import {
  penjualanLembaran, penjualanMaklon, penjualanBannerRoll,
  pembelianBahan, pembelianBannerRoll, penjualanNet30, lunasiSebagianPiutang,
} from "./skenario.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(nama, fallback) {
  const i = process.argv.indexOf(nama);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function jalankanGenerate() {
  const skala = arg("--skala", "kecil");
  const seed = parseInt(arg("--seed", "42"), 10);
  const jumlah = skala === "besar" ? 200 : 20;
  const runId = `R${Date.now().toString(36)}`;
  const rng = buatRng(seed);

  const user = await login();
  console.log(`Login OK sebagai ${user.nama_pengguna}. Run ${runId}, skala ${skala} (${jumlah} transaksi).`);

  const master = await setupMasterData(runId, rng);
  console.log("Master data uji dibuat.");

  // Isi stok banner roll dulu (beberapa pembelian dimensional).
  const pembelianIds = [];
  for (let i = 0; i < Math.max(2, Math.floor(jumlah * 0.1)); i++) {
    const p = await pembelianBannerRoll(runId, rng, master);
    if (p?.id) pembelianIds.push(p.id);
  }
  for (let i = 0; i < Math.max(2, Math.floor(jumlah * 0.1)); i++) {
    const p = await pembelianBahan(runId, rng, master, rng() < 0.5 ? "CASH" : "NET30");
    if (p?.id) pembelianIds.push(p.id);
  }

  // Distribusi penjualan: ~60% maklon, ~20% lembaran, ~10% banner, ~10% NET30.
  const penjualanIds = [];
  for (let i = 0; i < jumlah; i++) {
    const r = rng();
    let sale;
    if (r < 0.6) {
      sale = await penjualanMaklon(runId, rng, master, rng() < 0.5 ? "CASH" : "NET30");
    } else if (r < 0.8) {
      sale = await penjualanLembaran(runId, rng, master);
    } else if (r < 0.9) {
      sale = await penjualanBannerRoll(runId, rng, master);
    } else {
      sale = await penjualanNet30(runId, rng, master);
    }
    if (sale?.id) penjualanIds.push(sale.id);
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${jumlah} penjualan...`);
  }

  // Lunasi sebagian piutang (beberapa kali).
  for (let i = 0; i < Math.max(1, Math.floor(jumlah * 0.1)); i++) {
    await lunasiSebagianPiutang(rng);
  }

  const runLog = {
    runId, seed, skala,
    penjualanIds, pembelianIds,
    pelangganIds: master.pelanggan.map((p) => p.id),
    vendorIds: [...master.supplier, ...master.subkon].map((v) => v.id),
    barangIds: [master.bannerRoll.id, master.lembaran.id, master.jasa.id],
  };
  const out = path.join(__dirname, `run-${runId}.json`);
  await writeFile(out, JSON.stringify(runLog, null, 2), "utf8");
  console.log(`Selesai. ${penjualanIds.length} penjualan, ${pembelianIds.length} pembelian.`);
  console.log(`Run-log: ${out}`);
  console.log(`Bersih-bersih: node scripts/uji/index.mjs --bersihkan "${out}"`);
}

async function main() {
  const runlog = arg("--bersihkan", null);
  if (runlog) {
    await login();
    await bersihkan(runlog);
    return;
  }
  await jalankanGenerate();
}

main().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/uji/index.mjs`
Expected: lolos.

- [ ] **Step 3: Commit**

```bash
git add scripts/uji/index.mjs
git commit -m "feat(uji): CLI orkestrator generate + bersihkan"
```

### Task 10: Jalankan end-to-end + verifikasi

**Konteks:** Prasyarat: Task 1 & 2 sudah diterapkan, `npm run dev` jalan, Supabase lokal jalan, `UJI_ADMIN_PASS=admin` di-set. Jalankan skala kecil dulu, verifikasi efeknya, baru bersih-bersih. Ini sekaligus stress test pertama — error apa pun di sini = bug nyata aplikasi yang harus dicatat/diperbaiki sebelum scale-up.

**Files:**
- (tidak ada file baru; eksekusi + verifikasi)

- [ ] **Step 1: Pastikan prasyarat jalan**

Run (terminal terpisah): `npm run dev`
Expected: server di `http://localhost:3000`. Pastikan Supabase lokal juga jalan.

- [ ] **Step 2: Jalankan generator skala kecil**

Run: `UJI_ADMIN_PASS=admin node scripts/uji/index.mjs --skala kecil --seed 42`
Expected: log "Login OK", "Master data uji dibuat", progres penjualan, lalu "Selesai. ~20 penjualan, ~N pembelian." + path run-log. Tidak ada "GAGAL".

- [ ] **Step 3: Verifikasi efek di aplikasi (browser)**

Buka `http://localhost:3000`, cek:
- Halaman POS → Riwayat Penjualan: muncul transaksi uji; transaksi maklon ada.
- Halaman Pembelian: PO maklon auto-terbentuk untuk penjualan maklon (cari yang ber-tipe Maklon); pembelian bahan/banner ada.
- Halaman Barang: stok banner roll bertambah dari pembelian, berkurang dari penjualan; AVCO/average cost terisi.
- Halaman Keuangan: omzet & biaya maklon tercatat; saldo bergerak.
- Halaman Hutang: ada hutang dari pembelian/maklon NET30. Piutang: ada dari penjualan NET30, sebagian sudah berkurang.
Expected: semua konsisten; tidak ada error 500 di Network tab.

- [ ] **Step 4: Jika ada error saat generate**

Catat pesan error (sudah diformat `METHOD path gagal (status): pesan`). Itu temuan stress test. Perbaiki di aplikasi (bukan di skrip, kecuali skrip yang salah kontrak), lalu ulangi Step 2. Gunakan superpowers:systematic-debugging bila perlu.

- [ ] **Step 5: Bersih-bersih dan verifikasi DB kembali bersih**

Run: `UJI_ADMIN_PASS=admin node scripts/uji/index.mjs --bersihkan "scripts/uji/run-<runId>.json"` (ganti `<runId>`).
Expected: "Bersih-bersih selesai: penjualan N ok ...". Cek di browser: Riwayat Penjualan/Pembelian uji kini berstatus VOID; stok banner roll kembali ke baseline. Master data uji dibiarkan (sesuai catatan).

- [ ] **Step 6: Verifikasi kode generator (type-safe untuk app, syntax untuk skrip)**

Run: `npm run type-check && npm run build`
Expected: 0 error (skrip `.mjs` di luar `tsconfig` app, tapi perubahan Task 1/2 ikut terverifikasi).
Run: `node --check scripts/uji/index.mjs scripts/uji/skenario.mjs scripts/uji/primitif.mjs scripts/uji/master-data.mjs scripts/uji/klien-http.mjs scripts/uji/pola.mjs scripts/uji/bersihkan.mjs`
Expected: semua lolos.

- [ ] **Step 7: Commit (bila ada perubahan tersisa, mis. .gitignore run-log)**

Tambahkan run-log ke gitignore agar artefak run tidak ter-commit:

```bash
echo "scripts/uji/run-*.json" >> .gitignore
git add .gitignore
git commit -m "chore(uji): abaikan run-log generator dari git"
```

