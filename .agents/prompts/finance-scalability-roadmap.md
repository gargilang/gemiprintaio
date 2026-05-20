# Roadmap: Halaman Keuangan Skalabel & Fleksibel
> Agent prompt untuk merombak arsitektur kalkulasi keuangan dari fondasi hardcoded
> menjadi sistem yang bisa menangani bisnis apapun, sekala apapun, tanpa perlu
> programmer lagi untuk menambah karyawan, kategori, atau rumus.

> **Agent melanjutkan pekerjaan?** Langsung ke bagian **[HANDOFF AGENT — Status & Roadmap Lanjutan](#handoff-agent--status--roadmap-lanjutan)** di akhir dokumen.

---

## Konteks & Motivasi

Aplikasi saat ini lahir dari satu file Excel Gemiprint. Kolom G–O adalah
terjemahan langsung kolom Excel ke database. Ini menciptakan batasan yang tidak
bisa dihindari tanpa refactor menyeluruh:

| Batasan sekarang | Dampak |
|---|---|
| Kolom `kasbon_*` dan `bagi_hasil_*` hardcoded di tabel `keuangan` | Maksimal 4 kasbon + 3 bagi hasil selamanya |
| `PROFIT_SHARE_SLOTS` array with 3 items di `profit-share-config.ts` | Tidak bisa tambah investor/pemilik ke-4 |
| Hasil kalkulasi disimpan sebagai kolom di tabel transaksi | Setiap metrik baru = migration database |
| Rumus `cashbook_formula` pakai huruf kolom (G, H, I...) | Konsep Excel bocor ke UI, membingungkan |
| `finance_participants` terpisah dari `cashbook_partner` | Orang yang sama ada di 2 tabel, tidak sinkron |

**Visi target:** user bisa menambah CEO, direktur, manager cabang, supervisor,
designer, karyawan, sales, kasir, tukang sapu — masing-masing dengan peran dan
rumus kalkulasi sendiri — tanpa menyentuh kode atau database migration.

---

## Arsitektur Target

### Prinsip inti

1. **Satu tabel orang** (`business_actors`) — semua pelaku bisnis, semua peran
2. **Kategori transaksi sepenuhnya dinamis** — tidak ada kode hardcoded
3. **Hasil kalkulasi di tabel terpisah** (`transaction_computed`) — tidak ada
   kolom kalkulasi di tabel transaksi utama
4. **Rumus bereferensi nama, bukan huruf** — tidak ada "kolom G", ada "Omzet"
5. **Mesin evaluasi yang sama** — AST engine yang sudah ada tetap dipakai,
   hanya input/output-nya yang berubah

---

## Fase 1 — Database Foundation
> Buat skema baru yang bisa menampung bisnis apapun.

### 1A. Tabel `business_actors` (menggantikan `finance_participants` + `cashbook_partner`)

```sql
CREATE TABLE business_actors (
  id             TEXT PRIMARY KEY,
  display_name   TEXT NOT NULL,
  role_code      TEXT NOT NULL,        -- "CEO", "DIREKTUR", "MANAGER", "SALES",
                                       -- "KARYAWAN", "INVESTOR", "FOUNDER",
                                       -- "KOMISARIS", dll. — bebas, user-defined
  role_label     TEXT NOT NULL,        -- Label tampilan untuk role_code di atas
  is_active      INTEGER NOT NULL DEFAULT 1,
  display_order  INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Tidak ada lagi tabel `cashbook_partner` dan `finance_participants` yang terpisah.**
Semua orang ada di sini. `role_code` bebas diisi user, tidak dibatasi enum.

### 1B. Tabel `actor_roles` (definisi peran — user bisa tambah sendiri)

```sql
CREATE TABLE actor_roles (
  id           TEXT PRIMARY KEY,
  role_code    TEXT NOT NULL UNIQUE,
  role_label   TEXT NOT NULL,           -- "Karyawan", "Investor", "Manager", dll.
  role_group   TEXT NOT NULL DEFAULT 'other',
                                        -- "profit_share" | "cash_advance" | "other"
  description  TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Seed awal: CEO, Direktur, Komisaris, Manager, Supervisor, Designer, Karyawan,
Sales, Kasir, Kurir, Resepsionis, Investor, Founder, dll.

### 1C. Tabel `transaction_computed` (menggantikan kolom G–O di `keuangan`)

```sql
CREATE TABLE transaction_computed (
  transaction_id TEXT NOT NULL REFERENCES keuangan(id) ON DELETE CASCADE,
  formula_key    TEXT NOT NULL,   -- "omzet", "laba_bersih", "kasbon_andi", "bonus_sales", dll.
  value          REAL NOT NULL DEFAULT 0,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transaction_id, formula_key)
);

CREATE INDEX idx_tc_formula_key ON transaction_computed(formula_key);
CREATE INDEX idx_tc_transaction  ON transaction_computed(transaction_id);
```

**Ini adalah perubahan terpenting.** Tidak ada lagi `kasbon_cahaya REAL`,
`bagi_hasil_anwar REAL` di tabel `keuangan`. Semua hasil kalkulasi masuk ke
sini sebagai pasangan `(transaction_id, formula_key, value)`.

Implikasi:
- Tambah karyawan baru → tambah formula baru → langsung jalan, tidak perlu migration
- 15 karyawan kasbon → 15 baris per transaksi di tabel ini
- 4 investor bagi hasil → 4 formula, tidak ada batas

### 1D. Tabel `cashbook_formula` (perbarui skema yang sudah ada)

Hapus `column_key` (huruf Excel G, H, I...). Ganti dengan `formula_key` yang
adalah nama semantik.

```sql
-- Modifikasi cashbook_formula:
-- Hapus kolom: column_key (kolom huruf G-O, tidak relevan)
-- Ubah nama: db_column → formula_key (lebih eksplisit)
-- Tambah: actor_id (jika formula terkait orang tertentu, mis. kasbon Andi)

ALTER TABLE cashbook_formula
  ADD COLUMN formula_key TEXT UNIQUE,  -- "omzet", "laba_bersih", "kasbon_andi"
  ADD COLUMN actor_id TEXT REFERENCES business_actors(id) ON DELETE SET NULL,
  ADD COLUMN formula_group TEXT DEFAULT 'summary';
                                       -- "summary" | "profit_share" | "cash_advance" | "bonus"
```

### 1E. Tabel `keuangan` — bersihkan kolom kalkulasi

```sql
-- Hapus kolom-kolom ini dari tabel keuangan:
ALTER TABLE keuangan
  DROP COLUMN IF EXISTS omzet,
  DROP COLUMN IF EXISTS biaya_operasional,
  DROP COLUMN IF EXISTS biaya_bahan,
  DROP COLUMN IF EXISTS saldo,
  DROP COLUMN IF EXISTS laba_bersih,
  DROP COLUMN IF EXISTS kasbon_anwar,
  DROP COLUMN IF EXISTS kasbon_suri,
  DROP COLUMN IF EXISTS kasbon_cahaya,
  DROP COLUMN IF EXISTS kasbon_dinil,
  DROP COLUMN IF EXISTS bagi_hasil_anwar,
  DROP COLUMN IF EXISTS bagi_hasil_suri,
  DROP COLUMN IF EXISTS bagi_hasil_gemi,
  DROP COLUMN IF EXISTS override_omzet,
  DROP COLUMN IF EXISTS override_biaya_operasional,
  -- ... semua override_* juga
```

Override (nilai manual yang tidak dicomputasi ulang) pindah ke tabel:

```sql
CREATE TABLE transaction_overrides (
  transaction_id TEXT NOT NULL REFERENCES keuangan(id) ON DELETE CASCADE,
  formula_key    TEXT NOT NULL,
  override_value REAL NOT NULL,
  overridden_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transaction_id, formula_key)
);
```

---

## Fase 2 — Formula Engine Upgrade
> Hapus konsep "kolom huruf", ganti dengan formula_key semantik.

### 2A. Update `src/lib/ast/types.ts`

```typescript
// Hapus: OutputColumn = string (tetap string, tapi semantiknya berubah)
// Ubah: column: OutputColumn → formulaKey: string di FormulaDefinition
// Ubah: prevOutput column → prevOutput formulaKey
// Ubah: outputRef column  → outputRef formulaKey

export interface FormulaDefinition {
  id: string;
  name: string;
  formulaKey: string;    // "omzet", "laba_bersih", "kasbon_andi" — TIDAK ada G/H/I
  actorId?: string | null;   // linked actor jika formula untuk orang tertentu
  formulaGroup: "summary" | "profit_share" | "cash_advance" | "bonus" | "custom";
  ast: ASTNode;
  enabled: boolean;
  isSystem: boolean;
  displayOrder: number;
  description?: string | null;
}
```

Node types yang perlu diupdate di `ASTNode`:

```typescript
// Ganti:
| { type: "prevOutput"; column: string }  // column = huruf lama
| { type: "outputRef"; column: string }   // column = huruf lama

// Jadi:
| { type: "prevOutput"; formulaKey: string }  // "omzet", "saldo", dll.
| { type: "outputRef"; formulaKey: string }
```

### 2B. Update `src/lib/ast/evaluator.ts`

`OutputRow` sekarang pakai `formulaKey` bukan huruf:

```typescript
// Sebelum:
export type OutputRow = Record<string, number | string | boolean>;  // key = "G", "H", ...

// Sesudah:
export type OutputRow = Record<string, number | string | boolean>;  // key = "omzet", "laba_bersih", ...
// (tipe sama, tapi semantik key berubah total)
```

### 2C. Update `src/lib/ast/cashbook-recalc.ts`

Perubahan besar:
- Input dari `keuangan` hanya ambil kolom data (id, tanggal, kategori_transaksi, debit, kredit, keperluan, catatan, urutan_tampilan)
- Override dibaca dari tabel `transaction_overrides`, bukan dari kolom `override_*`
- Hasil ditulis ke `transaction_computed` (INSERT OR REPLACE), bukan UPDATE kolom di `keuangan`

```typescript
// Pseudocode alur baru:
export async function recalculateCashbook(db) {
  const rows = loadKeuanganRows(db);          // hanya kolom C, D, E, F + id + urutan
  const overrides = loadOverridesMap(db);     // { [txId]: { [formulaKey]: value } }
  const formulas  = loadFormulas(db);         // sorted by dependency
  const partners  = loadBusinessActors(db);   // menggantikan cashbook_partner

  const batch = computeUpdates(rows, formulas, partners, overrides);

  // Bukan UPDATE keuangan SET omzet=x, tapi:
  db.prepare(`INSERT OR REPLACE INTO transaction_computed
              (transaction_id, formula_key, value, computed_at)
              VALUES (?, ?, ?, datetime('now'))`)
    .run(txId, formulaKey, value);
}
```

### 2D. Migrasi data kalkulasi lama

Buat migration script yang membaca kolom G–O yang lama dari `keuangan` dan
memindahkannya ke `transaction_computed` sebelum kolom-kolom itu dihapus.

```sql
INSERT INTO transaction_computed (transaction_id, formula_key, value)
SELECT id, 'omzet',            COALESCE(omzet, 0)            FROM keuangan
UNION ALL
SELECT id, 'biaya_operasional', COALESCE(biaya_operasional, 0) FROM keuangan
UNION ALL
SELECT id, 'laba_bersih',      COALESCE(laba_bersih, 0)      FROM keuangan
-- ... dst untuk semua kolom G-O
ON CONFLICT DO NOTHING;
```

---

## Fase 3 — Service Layer Rebuild
> Hapus semua file yang hardcoded untuk Gemiprint. Bangun ulang generic.

### File yang perlu dihapus/diganti total

| File lama | Alasan | Pengganti |
|---|---|---|
| `src/lib/profit-share-config.ts` | Hardcoded 3 slot, nama Anwar/Suri/Gemi | `src/lib/services/formula-service.ts` (generic) |
| `src/lib/finance-slot-labels.ts` | Hardcoded label kasbon_cahaya, dll. | Label dari DB langsung |
| `src/lib/ast/defaults.ts` | Seed default formula masih pakai huruf G-O | Seed baru dengan formulaKey semantik |
| `src/lib/services/cashbook-config-sync.ts` | Duplikasi data lama | Tidak perlu lagi (satu tabel orang) |
| `src/lib/services/finance-config-service.ts` | `setupBagiHasilPartner` hardcoded 3 slot | Service baru tanpa batas slot |

### File baru yang perlu dibuat

**`src/lib/services/business-actor-service.ts`**
- CRUD `business_actors` + `actor_roles`
- Saat tambah actor dengan `role_group = profit_share` → auto-buat formula bagi hasil
- Saat hapus actor → nonaktifkan formula terkait (bukan hapus, preserve history)

**`src/lib/services/formula-service.ts`**
- CRUD `cashbook_formula` (generic, tidak ada referensi nama orang)
- `syncFormulasForActor(actorId)` — panggil saat persentase bagi hasil diubah
- `getComputedSummary(month)` — aggregate dari `transaction_computed`

**`src/lib/services/transaction-computed-service.ts`**
- Read/write `transaction_computed`
- `getSummaryByMonth(yearMonth)` → omzet, laba, kasbon per orang, dll.
- `getActorMetrics(actorId, month)` → semua metrik untuk satu orang

---

## Fase 4 — UI Rebuild: Kalkulasi Keuangan
> UI baru yang tidak ada referensi Excel sama sekali.

### 4A. Formula Builder baru

Hapus tab "Mitra" (sudah dipindah ke Kelola Orang). Ubah tampilan tabel:

| Sekarang (jelek) | Target (bersih) |
|---|---|
| Kolom "G", "H", "I"... | Tidak ada kolom huruf |
| Kolom "Kolom DB" (teknikal) | Tidak tampil di UI user |
| Nama "Kasbon Cahaya" hardcoded | Nama otomatis dari actor: "Kasbon [Nama]" |
| Max 9 formula | Tidak ada batas |

UI yang user lihat:

```
┌─────────────────────────────────────────────────┐
│  Rumus Ringkasan                          + Tambah
│  ✓  Omzet             Akumulasi penjualan  [Edit]
│  ✓  Biaya Operasional ...                  [Edit]
│  ✓  Biaya Bahan       ...                  [Edit]
│  ✓  Saldo             Kas berjalan         [Edit]
│  ✓  Laba Bersih       Omzet - semua biaya  [Edit]
├─────────────────────────────────────────────────┤
│  Bagi Hasil (dari Kelola Orang)
│  ✓  Bagi Hasil Suri   40% laba - kasbon    [Edit]
│  ✓  Bagi Hasil Gemi   35% laba             [Edit]
│  ✓  Bagi Hasil Anwar  25% laba - kasbon    [Edit]
├─────────────────────────────────────────────────┤
│  Kasbon (dari Kelola Orang)
│  ✓  Kasbon Cahaya     INVESTOR/BIAYA+nama  [Edit]
│  ✓  Kasbon Dinil      ...                  [Edit]
├─────────────────────────────────────────────────┤
│  Bonus & Kustom                           + Tambah
│  ✓  Bonus Sales       5% dari Omzet       [Edit]
└─────────────────────────────────────────────────┘
```

### 4B. Formula editor: ganti referensi huruf dengan dropdown nama

Saat user mengedit AST rumus "Bagi Hasil Suri":
- Bukan: `outputRef column="K"` (siapa yang tau K itu Laba Bersih?)
- Tapi: `outputRef formulaKey="laba_bersih"` dengan dropdown **"Laba Bersih"**

Node `partnerRef` tidak perlu lagi — ganti dengan `actorRef` yang otomatis
pakai nama orang dari `business_actors`.

---

## Fase 5 — UI Rebuild: Kelola Orang
> Satu halaman untuk semua pelaku bisnis. Bukan modal, tapi halaman penuh.

### 5A. Daftar orang dengan filter per peran

```
┌──────────────────────────────────────────────────────────┐
│  Kelola Orang                            [+ Tambah Orang]
│
│  [Semua] [Pemilik/Investor] [Manajemen] [Karyawan] [Cari]
│
│  Suri          Pemilik      Bagi hasil 40%   [Edit] [Nonaktif]
│  Gemi          Pemilik      Bagi hasil 35%   [Edit] [Nonaktif]
│  Anwar         Pemilik      Bagi hasil 25%   [Edit] [Nonaktif]
│  Cahaya        Karyawan     Kasbon aktif      [Edit] [Nonaktif]
│  Dinil         Karyawan     Kasbon aktif      [Edit] [Nonaktif]
│  [Karyawan baru Sales]  Sales  Bonus 5% omzet [Edit] [Nonaktif]
└──────────────────────────────────────────────────────────┘
```

### 5B. Form tambah orang

```
Nama            : [_____________]
Peran           : [Dropdown role_code — bisa tambah peran baru]
Jenis kalkulasi : ( ) Hanya catatan
                  ( ) Bagi hasil — isi % —> auto-buat formula
                  ( ) Kasbon / pinjaman  —> auto-buat formula kasbon
                  ( ) Bonus kustom       —> buka formula editor
Persentase      : [___] % (jika bagi hasil atau bonus % omzet)
```

Saat **Simpan**:
1. Buat baris di `business_actors`
2. Auto-buat formula di `cashbook_formula` (berdasarkan tipe kalkulasi)
3. Jalankan hitung ulang
4. Tampil di bar ringkasan halaman Keuangan

### 5C. Nonaktifkan vs Hapus

- **Nonaktifkan**: orang tidak tampil di halaman, tapi data historis tetap ada.
  Formula terkait di-disable, nilai lama di `transaction_computed` tidak disentuh.
- **Hapus permanen**: hanya boleh jika orang tidak punya transaksi sama sekali.
  Kalau ada transaksi, sistem tolak dan sarankan nonaktifkan saja.

---

## Fase 6 — UI Rebuild: Halaman Keuangan (ringkasan)
> Bar Bagi Hasil dan Kasbon jadi dinamis total.

### Sekarang (hardcoded)

```typescript
const INITIAL_METRIC_SLOTS: FinanceMetricSlot[] = [
  { source_column: "bagi_hasil_anwar", ... },
  { source_column: "bagi_hasil_suri",  ... },
  { source_column: "bagi_hasil_gemi",  ... },  // 3 slot, titik
  { source_column: "kasbon_cahaya",    ... },
  { source_column: "kasbon_dinil",     ... },  // 2 slot, titik
];
```

### Target (dinamis)

```typescript
// Ambil dari DB semua formula yang aktif dengan actor terkait
const formulas = await getActiveFormulasByGroup();

// Bar Bagi Hasil: semua formula dengan formulaGroup = "profit_share"
// Bar Kasbon: semua formula dengan formulaGroup = "cash_advance"
// Bar Bonus: semua formula dengan formulaGroup = "bonus"
// Tidak ada batas jumlah
```

Nilai yang ditampilkan diambil dari `transaction_computed`:

```typescript
const summary = await getMonthSummary(currentMonth);
// summary["laba_bersih"] = 50_000_000
// summary["kasbon_cahaya"] = 500_000
// summary["bagi_hasil_suri"] = 19_750_000
// summary["bonus_sales_andi"] = 2_500_000
// ... semua dari tabel transaction_computed, tanpa batas
```

---

## Fase 7 — Migrasi Data
> Transisi dari arsitektur lama ke baru tanpa kehilangan data.

### Urutan eksekusi migration

1. **Buat tabel baru** (business_actors, actor_roles, transaction_computed,
   transaction_overrides) — tidak sentuh tabel lama
2. **Migrasi orang**: copy `finance_participants` → `business_actors`
3. **Migrasi formula**: update `cashbook_formula` ganti `column_key` (G-O) ke
   `formula_key` (omzet, laba_bersih, dll.)
4. **Migrasi data kalkulasi**: copy nilai kolom G-O dari `keuangan` ke
   `transaction_computed`
5. **Migrasi override**: copy `override_*` columns ke `transaction_overrides`
6. **Jalankan recalculate full** dengan engine baru — validasi hasil sama
7. **Hapus kolom lama** dari `keuangan` setelah validasi sukses
8. **Hapus tabel lama**: `finance_participants`, `cashbook_partner`,
   `finance_metric_mappings`, `finance_metric_column_rules`

### Rollback plan

Jangan hapus kolom lama sebelum validasi selesai. Pertahankan kedua sistem
berjalan paralel selama 1 siklus tutup buku (1 bulan) sebelum commit penuh.

---

## Fase 8 — Fitur Bonus Berbasis Penjualan (contoh konkret)

Ini adalah contoh skenario yang sebelumnya tidak bisa dilakukan.

### Setup: karyawan sales dengan bonus 5% omzet

1. **Tambah orang**: "Andi" | peran: "Sales" | tipe: "Bonus kustom"
2. **Editor rumus** auto-generate template:
   ```
   Bonus Andi = Omzet × 5%
   ```
   Yang artinya AST:
   ```json
   {
     "type": "binaryOp", "op": "*",
     "left": { "type": "outputRef", "formulaKey": "omzet" },
     "right": { "type": "literal", "value": 0.05 }
   }
   ```
3. **Simpan** → formula `bonus_andi` dibuat, hitung ulang berjalan
4. Di ringkasan bulan: bar "Bonus" muncul dengan nilai Andi

### Setup: kategori BONUS

1. **Tambah kategori**: kode `BONUS`, arah `kredit` (uang keluar)
2. **Hubungkan ke formula**: kategori BONUS berkontribusi ke kolom
   `biaya_operasional` (atau buat kolom baru `biaya_bonus` jika ingin dipisah)
3. Setiap transaksi berkategori BONUS otomatis mengurangi laba bersih

---

## Checklist Implementasi

### Fase 1 — Database
- [ ] Buat tabel `business_actors`
- [ ] Buat tabel `actor_roles` + seed peran umum
- [ ] Buat tabel `transaction_computed`
- [ ] Buat tabel `transaction_overrides`
- [ ] Modifikasi `cashbook_formula` (tambah formula_key, actor_id, formula_group)
- [ ] Migration script: data lama → tabel baru
- [ ] Hapus kolom G-O dari `keuangan` (setelah validasi)
- [ ] Update SQLite schema di `db-unified.ts`

### Fase 2 — Engine
- [ ] Update `src/lib/ast/types.ts` (formulaKey, hapus column huruf)
- [ ] Update `src/lib/ast/evaluator.ts` (OutputRow pakai formulaKey)
- [ ] Update `src/lib/ast/cashbook-recalc.ts` (tulis ke transaction_computed)
- [ ] Update `src/lib/ast/defaults.ts` (seed formula default pakai formulaKey)
- [ ] Hapus `src/lib/profit-share-config.ts`
- [ ] Hapus `src/lib/finance-slot-labels.ts`

### Fase 3 — Services
- [ ] Buat `src/lib/services/business-actor-service.ts`
- [ ] Buat `src/lib/services/formula-service.ts` (generic, tanpa hardcode)
- [ ] Buat `src/lib/services/transaction-computed-service.ts`
- [ ] Hapus `src/lib/services/cashbook-config-sync.ts`
- [ ] Refactor `src/lib/services/finance-config-service.ts`
- [ ] Update API routes di `src/app/api/finance/`

### Fase 4 — UI Kalkulasi Keuangan
- [ ] Update `KalkulasiKeuanganModal.tsx` (hapus tab Mitra, hapus kolom huruf)
- [ ] Update FormulaEditor (dropdown formulaKey, bukan huruf)
- [ ] Tampilkan grup formula (Ringkasan / Bagi Hasil / Kasbon / Bonus / Kustom)

### Fase 5 — UI Kelola Orang
- [ ] Buat `src/app/kelola-orang/page.tsx` (atau modal besar)
- [ ] Buat `src/components/BusinessActorManager.tsx`
- [ ] Buat `src/components/ActorRoleManager.tsx` (manage daftar peran)
- [ ] Form tambah orang dengan tipe kalkulasi
- [ ] Nonaktifkan vs hapus dengan validasi

### Fase 6 — UI Halaman Keuangan
- [ ] Refactor bar Bagi Hasil: load dinamis dari formula group
- [ ] Refactor bar Kasbon: load dinamis
- [ ] Tambah bar Bonus (baru)
- [ ] Hapus semua referensi `INITIAL_METRIC_SLOTS` hardcoded
- [ ] Hapus referensi `kasbon_anwar`, `kasbon_cahaya`, dll. dari page.tsx
- [ ] Nilai ringkasan dari `transaction_computed`, bukan kolom `keuangan`

### Fase 7 — Migrasi & Validasi
- [ ] Script validasi: bandingkan nilai G-O lama vs transaction_computed baru
- [ ] Tutup buku bulan berjalan dengan sistem lama sebelum migrasi
- [ ] Jalankan migration di staging dulu
- [ ] Rollback script siap
- [ ] Setelah 1 bulan validasi: commit, hapus tabel/kolom lama

---

## Prinsip Nol Nama Hardcoded (WAJIB DIBACA SEBELUM APAPUN)

**Tujuan akhir: tidak ada satu pun nama orang (Gemi, Suri, Anwar, Cahaya,
Dinil) yang tersisa di kode atau skema database.** Setelah refactor selesai,
aplikasi berjalan dalam kondisi kosong seperti baru di-install. User memasukkan
nama mereka sendiri dari awal melalui UI.

### Inventaris lengkap nama hardcoded yang HARUS dihapus

Ini adalah daftar exhaustif berdasarkan audit kode per tanggal roadmap ini
dibuat. Setiap file di bawah harus disentuh dan dibersihkan.

#### Database — Supabase & SQLite schema

| File | Baris | Isi yang harus dihapus |
|---|---|---|
| `supabase/schema.sql` | 519–525 | Kolom `kasbon_anwar`, `kasbon_suri`, `kasbon_cahaya`, `kasbon_dinil`, `bagi_hasil_anwar`, `bagi_hasil_suri`, `bagi_hasil_gemi` di tabel `keuangan` |
| `supabase/schema.sql` | 538–544 | Kolom `override_kasbon_*` dan `override_bagi_hasil_*` yang berisi nama |
| `supabase/migrations/20260425120000_initial_schema.sql` | 475–500 | Sama seperti schema.sql — kolom nama hardcoded di `keuangan` |
| `supabase/migrations/20260521010000_cashbook_formula_ast.sql` | 43–45 | Seed `cashbook_partner`: `partner-cahaya`, `partner-suri`, `partner-gemi` |
| `supabase/migrations/20260521010000_cashbook_formula_ast.sql` | 80–97 | Seed formula: `Kasbon Suri`, `Bagi Hasil Suri`, `Bagi Hasil Gemi`, `Kasbon Cahaya` |
| `supabase/migrations/20260519120000_configurable_formula_rules.sql` | 39–49 | Seed rules: `kasbon_anwar`, `kasbon_suri`, `kasbon_cahaya`, `kasbon_dinil`, `bagi_hasil_*` |
| `supabase/migrations/20260517140000_finance_white_label_participants.sql` | Seluruh file | UPDATE yang masih menyebut nama Anwar, Suri, Gemi, Cahaya, Dinil |
| `supabase/migrations/20260517120000_finance_participant_profit_formula.sql` | Seluruh file | UPDATE dengan `fin-participant-anwar`, `fin-participant-suri`, dll. |
| `supabase/migrations/20260509090500_finance_flexible_architecture.sql` | 62–81 | INSERT seed participants dan metric_mappings dengan nama nyata |

#### TypeScript — Kode aplikasi

| File | Isi yang harus dihapus |
|---|---|
| `src/lib/profit-share-config.ts` | **Seluruh file dihapus** — hardcoded 3 slot Anwar/Suri/Gemi, `PROFIT_SHARE_SLOTS` array |
| `src/lib/finance-slot-labels.ts` | **Seluruh file dihapus** — label `kasbon_cahaya`, `bagi_hasil_anwar`, dll. |
| `src/lib/formula-engine.ts` | Baris 178–184: `DEFAULT_COLUMN_RULES` berisi nama kasbon dan bagi hasil hardcoded |
| `src/lib/ast/defaults.ts` | Hapus seed formula L (Kasbon Suri), M (Bagi Hasil Suri), N (Bagi Hasil Gemi), O (Kasbon Cahaya). Pertahankan G–K (Omzet, Biaya Ops, Biaya Bahan, Saldo, Laba Bersih) sebagai referensi logika, ganti ke `formula_key` semantik |
| `src/lib/ast/cashbook-recalc.ts` | Interface `CashbookRecalcInputRow` baris 64–84: field `kasbon_anwar`, `kasbon_suri`, `kasbon_cahaya`, `kasbon_dinil`, `bagi_hasil_anwar/suri/gemi`, `override_kasbon_*`, `override_bagi_hasil_*` — semua ganti dengan output dinamis dari `transaction_computed` |
| `src/lib/services/finance-service.ts` | Baris 41–47: tipe `KeuanganEntry` berisi field nama hardcoded. Baris 117–123: assignment nilai kasbon/bagi_hasil. Baris 168+: kalkulasi `KASBON ANWAR` hardcoded |
| `src/lib/services/finance-config-service.ts` | Baris 93–97: `DEFAULT_MAPPINGS` berisi `bagi_hasil_anwar/suri/gemi`, `kasbon_cahaya/dinil` |
| `src/lib/db-unified.ts` | Baris 322–328: seed `finance_metric_column_rules` berisi nama. Baris 382–403: UPDATE statements menyebut `fin-participant-anwar`, dll. |
| `src/lib/finance-metric-utils.ts` | Komentar dan logika yang referensi suffix nama kolom (bagi_hasil_suri → Suri) |
| `src/app/finance/page.tsx` | `INITIAL_METRIC_SLOTS` hardcoded (baris ~66–104), semua referensi `kasbon_cahaya`, `kasbon_dinil`, `bagi_hasil_anwar`, dll. |

#### Seed default yang harus diganti dengan kosong

File `supabase/seed-default-values.sql` dan semua INSERT dengan nama Gemi, Suri,
Anwar, Cahaya, Dinil di tabel `finance_participants`, `cashbook_partner`,
`finance_metric_mappings` harus **dihapus sepenuhnya atau diubah menjadi data
contoh generik** (mis. "Pemilik 1", "Pemilik 2") yang user ganti saat setup.

### Aturan besi untuk agent

> **Tidak ada satu pun nama orang nyata yang boleh ada di kode setelah fase ini
> selesai.** Satu-satunya tempat nama boleh muncul adalah di tabel database
> yang diisi oleh user melalui UI: `business_actors`, `actor_roles`.

Kalau agent menemukan string `anwar`, `suri`, `gemi`, `cahaya`, atau `dinil`
(case-insensitive) di file `.ts`, `.sql`, atau `.tsx` yang BUKAN di dalam
comment sejarah atau test fixture — itu adalah bug yang harus diperbaiki.

---

## Prinsip Seed "Kosong tapi Siap Pakai"

Setelah refactor, saat aplikasi pertama kali dijalankan, halaman Keuangan
menampilkan:

```
Bar Bagi Hasil     (0 orang) [Kelola]
Bar Kasbon         (0 orang) [Kelola]

Rumus aktif:
  ✓ Omzet          — akumulasi debit dari kategori omzet/penjualan
  ✓ Biaya          — akumulasi kredit dari kategori biaya
  ✓ Saldo          — debit - kredit berjalan
  ✓ Laba Bersih    — Omzet - Biaya

  (Tambahkan orang di Kelola Bagi Hasil atau Kelola Kasbon untuk
   melihat kalkulasi per orang)
```

Rumus dasar (Omzet, Biaya, Saldo, Laba Bersih) adalah **sistem**, tidak bisa
dihapus user, tidak mengandung nama orang. Rumus kasbon dan bagi hasil
**dibuat otomatis** saat user tambah orang pertama kali.

---

## Catatan Penting untuk Agent

Saat mengerjakan roadmap ini:

1. **Tidak ada nama orang di kode.** Ini aturan nomor satu. Lihat bagian
   "Prinsip Nol Nama Hardcoded" di atas untuk daftar lengkap file yang harus
   dibersihkan. Cek ulang dengan `rg -i "anwar|suri|gemi|cahaya|dinil" src/`
   setelah setiap fase selesai — hasil harus nol (atau hanya di test fixture
   yang eksplisit diberi label "legacy test").

2. **Jangan hapus data lama sebelum migration script divalidasi.** Jalankan
   kedua sistem paralel, bandingkan output.

3. **Engine AST (`src/lib/ast/evaluator.ts`) tidak perlu diubah logikanya** —
   hanya nama key output. Ini aset paling berharga di kodebase sekarang.

4. **Gunakan `formula_key` yang human-readable** seperti `omzet`, `laba_bersih`,
   `kasbon_andi`, `bonus_sales`. Bukan `col_g`, bukan `G`, bukan UUID.

5. **Schema harus sinkron di dua tempat:** `supabase/schema.sql` (referensi
   manual) DAN `supabase/migrations/` (urutan migration resmi). Keduanya harus
   mencerminkan skema akhir yang sama. Jangan update salah satu saja.

6. **SQLite di `src/lib/db-unified.ts`** adalah sumber ketiga yang juga harus
   diupdate. Skema SQLite inline di sana (bagian `CREATE TABLE IF NOT EXISTS`)
   harus identik strukturnya dengan Supabase.

7. **RLS Supabase** harus diperbarui untuk semua tabel baru. Gunakan pola yang
   sama dengan tabel `keuangan` yang sudah ada di
   `supabase/migrations/20260513204559_add_rls_policies_anon_access.sql`.

8. **Satu siklus tutup buku = satu bulan.** Jangan migrasi di tengah bulan.
   Tunggu `Tutup Buku` selesai, lalu jalankan migration.

9. **Seed default yang baru = kosong untuk nama orang, ada untuk rumus dasar.**
   Rumus Omzet, Biaya, Saldo, Laba Bersih masuk sebagai `is_system = true`
   dan tidak bisa dihapus user. Rumus kasbon/bagi hasil TIDAK di-seed; dibuat
   otomatis saat user tambah orang pertama kali.

10. **Semua file TypeScript yang berisi `CashbookEntry` atau tipe data `keuangan`**
    harus diperbarui agar tidak lagi memiliki field `kasbon_*` atau
    `bagi_hasil_*` hardcoded. Nilai-nilai itu sekarang ada di
    `transaction_computed` dan diakses lewat `getComputedValue(txId, formulaKey)`.

---

## Referensi File Kritis (baca sebelum mulai)

### File yang DIBACA sebagai referensi (pahami dulu, jangan langsung ubah)

| File | Mengapa dibaca |
|---|---|
| `src/lib/ast/types.ts` | Tipe AST engine — titik awal perubahan formulaKey |
| `src/lib/ast/evaluator.ts` | Engine evaluasi — JANGAN ubah logika, hanya key names |
| `src/lib/ast/defaults.ts` | Seed formula default lama — referensi perilaku yang harus direproduksi |
| `src/lib/ast/cashbook-recalc.ts` | Recalc engine — output akan diarahkan ke `transaction_computed` |
| `src/lib/profit-share-config.ts` | Akan DIHAPUS — baca dulu untuk pahami slot logic yang akan digantikan |
| `src/lib/formula-engine.ts` | Akan DIHAPUS — baca untuk pahami DEFAULT_COLUMN_RULES |
| `src/lib/finance-slot-labels.ts` | Akan DIHAPUS — label hardcoded nama orang |
| `src/lib/services/finance-service.ts` | Interface `KeuanganEntry` yang akan dibersihkan dari field nama |
| `supabase/schema.sql` | **Skema referensi utama** — ini yang harus jadi acuan skema akhir |
| `supabase/migrations/20260425120000_initial_schema.sql` | Skema migration pertama — lihat kolom keuangan yang akan dihapus |
| `supabase/migrations/20260521010000_cashbook_formula_ast.sql` | Seed formula AST lama — referensi format AST JSON |
| `src/lib/db-unified.ts` | Skema SQLite inline — harus disinkronkan dengan Supabase |
| `src/app/finance/page.tsx` | Halaman utama — banyak hardcode `INITIAL_METRIC_SLOTS` yang akan hilang |

### Tiga file skema yang harus selalu sinkron

Ini adalah tiga representasi skema database yang HARUS identik strukturnya
setelah setiap fase selesai:

```
supabase/schema.sql                    ← referensi manual (human-readable)
supabase/migrations/YYYYMMDD_*.sql    ← migration resmi (dijalankan oleh Supabase CLI)
src/lib/db-unified.ts                 ← CREATE TABLE IF NOT EXISTS inline (untuk SQLite)
```

Setiap kali menambah tabel baru atau mengubah kolom, **ketiga file ini harus
diupdate dalam satu commit yang sama.** Jangan biarkan ketiganya tidak sinkron.

### Urutan baca yang disarankan sebelum mulai coding

1. Baca `supabase/schema.sql` baris 506–549 — lihat tabel `keuangan` yang penuh nama
2. Baca `src/lib/ast/defaults.ts` — pahami rumus G–K yang valid, L–O yang hardcoded nama
3. Baca `src/lib/profit-share-config.ts` — pahami slot logic yang akan digantikan
4. Baca `src/app/finance/page.tsx` baris 66–115 — pahami `INITIAL_METRIC_SLOTS` hardcoded
5. Baca `src/lib/services/finance-service.ts` baris 40–50 — lihat tipe data yang akan diubah
6. Baru mulai Fase 1

---

## HANDOFF AGENT — Status & Roadmap Lanjutan

> **Terakhir diperbarui:** 2026-05-21  
> **Baca bagian ini dulu** sebelum melanjutkan. Fase 1–8 di atas = spesifikasi target;
> bagian ini = implementasi aktual, koreksi desain, dan urutan kerja berikutnya.

### Ringkasan progres (checklist fase asli)

| Fase | Judul | Status | Catatan |
|------|--------|--------|---------|
| 1 | Database foundation | ✅ Selesai (additive) | Migration Supabase cloud mungkin belum di-apply |
| 1b | Migration data lama → v2 | ⏳ Belum | `scripts/migrate-finance-to-v2.mjs` belum ada |
| 2 | AST engine + dual-write | ✅ Selesai | |
| 3 | Service layer v2 | ✅ Selesai | Cleanup legacy belum |
| 4 | Formula Builder UI | ⏳ Belum | Masih huruf kolom |
| 5 | Kelola Orang UI | ✅ Selesai | Checkbox bagi hasil/kasbon/bonus |
| 6 | Halaman Keuangan dinamis | 🟡 Parsial | Tabel per baris v2; bar legacy masih ada |
| 7 | DROP kolom lama | ⏳ Belum | Gate: setelah migrasi + validasi |
| 8 | Bonus | 🟡 Backend | Form + AST ada |

---

### Apa yang sudah dikerjakan (ringkas per area)

#### Fase 1: Fondasi DB (selesai, additive)
- `supabase/migrations/20260521090000_business_actors_v2.sql` — tabel `actor_roles`,
  `business_actors`, `transaction_computed`, `transaction_overrides`, ditambah
  kolom `formula_key` / `actor_id` / `formula_group` di `cashbook_formula`, beserta
  RLS policy dan backfill `formula_key` dari `db_column`.
- `supabase/schema.sql` — tabel baru ditambahkan supaya referensi manual tetap sinkron.
- `src/lib/db-unified.ts` — mirror SQLite, seed `actor_roles`, backfill `cashbook_formula`,
  **`migrateActorRolesLegacyCheckConstraint()`** untuk install lama (CHECK `profit_share`…).
- `supabase/migrations/20260521103000_actor_roles_display_groups.sql` — `role_group`
  jadi `owner|management|sales|staff|other` (bukan tipe rumus).
- `scripts/apply-migration.mjs` + `npm run supabase:migrate:apply`.

**Blocker cloud:** Log `PGRST205 actor_roles` = migration belum jalan di Supabase.
App fallback SQLite. User: apply SQL lalu Reload schema di Dashboard.

#### Fase 2: Engine AST
- `src/lib/ast/types.ts` — field opsional `formulaKey`, `actorId`, `formulaGroup`
  (backward-compatible) + helper `resolveFormulaKey()`.
- `src/lib/ast/defaults.ts` — hanya menyisakan rumus sistem (Omzet, Biaya
  Operasional, Biaya Bahan, Saldo, Laba Bersih). `DEFAULT_PARTNERS` jadi array kosong.
- `src/lib/ast/cashbook-recalc.ts` — dual-write: tetap menulis ke kolom legacy
  `keuangan.*` plus upsert ke `transaction_computed`, menghormati `transaction_overrides`.
- `src/lib/services/finance-service.ts` (`recalculateCashbookViaSupabase`) —
  cermin dual-write yang sama untuk path Supabase.
- `src/lib/ast/__tests__/evaluator.test.ts` — diisolasi: rumus legacy
  (Suri/Gemi/Cahaya) dipindah jadi fixture lokal supaya `defaults.ts` bisa
  bebas nama tanpa merusak coverage engine. **Semua 48 test jest hijau.**

**Fase 3: Service layer baru (additive)**
- `src/lib/services/business-actor-service.ts` — CRUD `business_actors` +
  `actor_roles`, JSON serializer kompatibel SQLite & Supabase, plus pengaman
  tidak boleh hard-delete actor yang sudah punya history di `transaction_computed`.
- `src/lib/services/transaction-computed-service.ts` — pembacaan & agregasi
  (`getMonthSummary`, `getLatestPerFormulaKey`, `getComputedRow`, `getActorMetrics`)
  plus `setOverride` / `clearOverride`.
- `src/lib/services/formula-service.ts` — `syncFormulasForActor()` dari **field actor**
  (bisa 0–3 rumus/orang), `getActorFinanceSummaryRows()`, `countLegacyOrphanActorFormulas()`.
- API:
  - `api/business-actors/route.ts` — CRUD + sync formula + recalc
  - `api/actor-roles/route.ts`
  - `api/finance/summary-v2/route.ts` → `{ actorRows, legacyOrphanFormulas }`
  - `api/finance/categories/route.ts` — picker kategori kasbon

#### Fase 5: Kelola Orang ✅
- `src/app/kelola-orang/page.tsx` — centang independen Bagi Hasil / Kasbon / Bonus;
  **picker kategori** dari `finance_category_definitions`; preview rumus.
- `src/components/menuConfig.tsx` — menu + `PAGE_TITLE_MAP`.

#### Fase 6: Keuangan (parsial) 🟡
- Link Kelola Orang di `finance/page.tsx`.
- `DynamicActorSummary.tsx` — **satu baris per orang** (Nama | Jabatan | Bagi hasil | Kasbon | Bonus);
  hanya `business_actors` + `actor_id`; legacy tidak ditampilkan di sini.
- Bar Bagi Hasil / Kasbon **legacy** masih di bawah (duplikasi sampai migrasi).

---

### Koreksi desain (WAJIB — beda dari draft Fase 1 di atas)

1. **`role_group` = label jabatan**, bukan tipe rumus (`owner|management|sales|staff|other`).
2. **Rumus per orang** dari field `profit_share_percent` / `cash_advance_categories` /
   `bonus_percent` — kombinasi bebas.
3. **Ringkasan v2 per baris**, bukan section terpisah per jenis rumus.
4. **Kategori kasbon** sudah ada di DB; UI pakai checkbox, bukan ketik kode.

---

### Roadmap lanjutan — prioritas untuk agent berikutnya

#### P0 — Apply migration Supabase (jika pakai cloud)
```bash
npm run supabase:migrate:apply
# + file 20260521103000_actor_roles_display_groups.sql
```
Reload schema API. Verifikasi: tidak ada `PGRST205` di log.

#### P1 — Script `scripts/migrate-finance-to-v2.mjs`
- Seed `business_actors` dari `finance_participants` + `cashbook_partner`
- Link `cashbook_formula.actor_id` + `formula_key`
- Backfill `transaction_computed` dari kolom `keuangan` legacy
- **Non-destructive** — jangan DROP kolom

#### P2 — Migrasi orang legacy (Suri, Gemi, …)
- Tambah di Kelola Orang dengan kategori dari picker
- Nonaktifkan rumus `bagi_hasil_suri` / `kasbon_suri` tanpa `actor_id`
- Target: `legacyOrphanFormulas === 0`

#### P3 — Refactor `finance/page.tsx` penuh
- Satu ringkasan v2; hapus/sembunyikan bar legacy duplikat
- Deprecate `BagiHasilManageModal`, kurangi `INITIAL_METRIC_SLOTS`
- Tab cashbook pakai label `formula_key`

#### P4 — Formula Builder v2 (`KalkulasiKeuanganModal.tsx`)
- UI: `formula_key` + `formula_group`, bukan huruf G–O

#### P5 — Cleanup legacy code
- `profit-share-config.ts`, `finance-slot-labels.ts`, `hasCahaya`/`hasDinil` di `finance-service.ts`

#### P6 — Fase 7 DROP kolom `keuangan.kasbon_*` / `bagi_hasil_*`
- Hanya setelah validasi + sign-off; hapus dual-write

**Verifikasi rutin:** `npm run type-check` && `npm test` (48 tests).

---

### Prompt untuk agent baru

```
Baca .agents/prompts/finance-scalability-roadmap.md — bagian HANDOFF AGENT.

Legacy (cashbook_formula tanpa actor_id) masih tampil di bar Keuangan lama.
v2 (Kelola Orang + DynamicActorSummary per baris) sudah jalan di SQLite.

Kerja: P0 migration cloud → P1 script migrasi data → P3 refactor finance page.
Jangan DROP kolom keuangan. Ikuti .cursorrules.
```

---

### Indeks file penting

```
supabase/migrations/20260521090000_business_actors_v2.sql
supabase/migrations/20260521103000_actor_roles_display_groups.sql
scripts/apply-migration.mjs
src/lib/services/business-actor-service.ts
src/lib/services/formula-service.ts
src/lib/services/transaction-computed-service.ts
src/app/kelola-orang/page.tsx
src/components/finance/DynamicActorSummary.tsx
src/app/api/business-actors/route.ts
src/app/api/finance/summary-v2/route.ts
src/app/api/finance/categories/route.ts
```

---

### Catatan teknis

- **Dual-write** aktif: `keuangan.*` + `transaction_computed`.
- **`formula_key`** = identifier baru; huruf kolom = legacy internal.
- **Inactive actor** → formula `enabled: false`, tidak di-delete.
- **JSONB vs TEXT** untuk `cash_advance_categories` — lihat `business-actor-service.ts`.
- Spesifikasi Fase 1–8 di dokumen ini tetap target akhir; HANDOFF = state kode saat ini.


