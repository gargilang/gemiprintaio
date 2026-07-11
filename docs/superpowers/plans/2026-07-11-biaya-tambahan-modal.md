# Biaya Tambahan Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan field opsional `modal` per baris biaya tambahan sehingga porsi biaya pihak ketiga tercatat sebagai pengeluaran kas (kategori `BIAYA`) dan masuk perhitungan HPP/margin item, tanpa mengubah total tagihan pelanggan.

**Architecture:** Tambah kolom DB `modal` di `biaya_tambahan_penjualan` (3 tempat sinkron), teruskan `modal` dari cart POS → payload → `createSale`, post 1 baris keuangan `BIAYA` ber-`[REF:saleId]` saat transaksi dibuat bila total modal > 0, dan bebankan modal ke `hpp_total` item terkait.

**Tech Stack:** Next.js (App Router), TypeScript, better-sqlite3 (desktop) + Supabase Postgres (web), Zod, Jest (jsdom + node), db-unified data layer.

## Global Constraints

- Runtime: Node.js 22 + npm. Bahasa Indonesia untuk string UI, komentar/JSDoc baru, dan nama tabel/kolom baru.
- Skema baru wajib sinkron di TIGA tempat (iron rule 2): migrasi `supabase/migrations/`, `database/sqlite-schema.sql`, runtime `ALTER TABLE ADD COLUMN` di `src/lib/db-unified.ts`. Plus perbarui snapshot `supabase/schema.sql`.
- Mutasi keuangan pakai token `[REF:<id>]` di `keperluan` (iron rule 4). Kategori keuangan pakai `BIAYA` (sudah ada; berkontribusi ke Biaya Operasional di `periode-metrics-service.ts`).
- Validasi input hot-path pakai Zod: `z.coerce.number().finite()` untuk uang, `.passthrough()`, `safeParse` → 422 (iron rule 15).
- Modal TIDAK mengubah `total_jumlah` (tagihan pelanggan) maupun PPN. Modal tidak ditampilkan di dokumen pelanggan.
- Verifikasi akhir (iron rule 10): `npm run type-check` (0 error) → `npm run build` → `npx jest <suite terkait>`.

---

### Task 1: Skema DB kolom `modal`

**Files:**
- Modify: `database/sqlite-schema.sql` (definisi tabel `biaya_tambahan_penjualan`, sekitar baris 1432-1452)
- Modify: `src/lib/db-unified.ts` (blok migrasi runtime `biaya_tambahan_penjualan`, sekitar baris 1576-1622)
- Create: `supabase/migrations/20260711120000_biaya_tambahan_modal.sql`
- Modify: `supabase/schema.sql` (definisi tabel `biaya_tambahan_penjualan`)

**Interfaces:**
- Produces: kolom `modal REAL NOT NULL DEFAULT 0` pada tabel `biaya_tambahan_penjualan` di SQLite (fresh + existing) dan Postgres.

- [ ] **Step 1: Tambah kolom di template fresh-install SQLite**

Di `database/sqlite-schema.sql`, pada definisi `CREATE TABLE biaya_tambahan_penjualan`, tambahkan kolom `modal` tepat setelah `nominal`:

```sql
      label TEXT NOT NULL,
      nominal REAL NOT NULL DEFAULT 0,
      modal REAL NOT NULL DEFAULT 0,
      urutan INTEGER NOT NULL DEFAULT 0,
```

- [ ] **Step 2: Tambah migrasi runtime SQLite (existing installs)**

Di `src/lib/db-unified.ts`, di dalam blok migrasi `biaya_tambahan_penjualan` (dekat baris 1576-1622, tempat `ALTER TABLE biaya_tambahan_penjualan ADD COLUMN ...` lain berada), tambahkan pola yang sama untuk `modal`. Ikuti gaya guard kolom yang sudah ada di blok itu (cek `PRAGMA table_info` sebelum ALTER). Contoh baris ALTER yang ditambahkan:

```
"ALTER TABLE biaya_tambahan_penjualan ADD COLUMN modal REAL NOT NULL DEFAULT 0",
```

Sisipkan mengikuti struktur array/daftar ALTER yang sudah ada di blok tersebut (baca 1576-1622 dulu, cocokkan gaya guard-nya).

- [ ] **Step 3: Buat migrasi cloud (Supabase)**

Buat `supabase/migrations/20260711120000_biaya_tambahan_modal.sql`:

```sql
-- Tambah kolom modal (biaya pihak ketiga) ke biaya tambahan penjualan.
-- Additive & idempoten. Default 0 = perilaku lama (murni omzet).
ALTER TABLE "public"."biaya_tambahan_penjualan"
  ADD COLUMN IF NOT EXISTS "modal" real NOT NULL DEFAULT 0;
```

- [ ] **Step 4: Perbarui snapshot skema Supabase**

Di `supabase/schema.sql`, temukan definisi tabel `biaya_tambahan_penjualan` dan tambahkan kolom `modal` agar konsisten dengan migrasi. Cari baris `"nominal"` pada tabel itu dan tambahkan setelahnya:

```sql
    "modal" real DEFAULT 0 NOT NULL,
```

(Sesuaikan sintaks/kutip dengan gaya kolom lain di file itu.)

- [ ] **Step 5: Type-check (skema tidak memengaruhi TS, tapi pastikan tidak ada typo di file TS yang disentuh)**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 6: Commit**

```bash
git add database/sqlite-schema.sql src/lib/db-unified.ts supabase/migrations/20260711120000_biaya_tambahan_modal.sql supabase/schema.sql
git commit -m "feat(db): kolom modal di biaya_tambahan_penjualan"
```

---

### Task 2: Tipe & schema Zod `modal`

**Files:**
- Modify: `src/app/pos/pos-types.ts` (interface `BiayaTambahanItem`, sekitar baris 51-54)
- Modify: `src/lib/schemas/pos.ts` (`biayaTambahanSchema`, baris 13-18)
- Test: `src/lib/__tests__/schemas-pos.test.ts` (tambah kasus modal)

**Interfaces:**
- Consumes: kolom `modal` dari Task 1.
- Produces: `BiayaTambahanItem.modal?: number`; `biayaTambahanSchema` menerima `modal` opsional dengan aturan `0 <= modal <= nominal`.

- [ ] **Step 1: Tambah `modal` ke tipe `BiayaTambahanItem`**

Di `src/app/pos/pos-types.ts`:

```ts
export interface BiayaTambahanItem {
  label: string;
  nominal: number;
  /** Porsi biaya pihak ketiga (modal) dari nominal ini. Kosong/0 = murni omzet.
   *  Diposting sebagai pengeluaran kas kategori BIAYA. Wajib 0..nominal. */
  modal?: number;
}
```

- [ ] **Step 2: Tulis test schema yang gagal dulu**

Di `src/lib/__tests__/schemas-pos.test.ts`, tambahkan (sesuaikan import `createSaleSchema` bila sudah ada di file):

```ts
import { createSaleSchema } from "@/lib/schemas/pos";

describe("biaya tambahan modal (schema)", () => {
  const base = {
    kasir_id: "u1",
    tanggal: "2026-07-11",
    total_jumlah: 50000,
    jumlah_dibayar: 50000,
    metode_pembayaran: "CASH",
    items: [
      {
        barang_id: "b1",
        jumlah: 1,
        nama_satuan: "pcs",
        faktor_konversi: 1,
        harga_satuan: 50000,
        subtotal: 50000,
        biaya_tambahan: [{ label: "Pasang bambu", nominal: 30000, modal: 15000 }],
      },
    ],
  };

  it("menerima modal <= nominal", () => {
    expect(createSaleSchema.safeParse(base).success).toBe(true);
  });

  it("menolak modal > nominal", () => {
    const bad = {
      ...base,
      items: [
        {
          ...base.items[0],
          biaya_tambahan: [{ label: "Ongkir", nominal: 10000, modal: 20000 }],
        },
      ],
    };
    expect(createSaleSchema.safeParse(bad).success).toBe(false);
  });

  it("modal opsional (tanpa modal tetap valid)", () => {
    const ok = {
      ...base,
      items: [
        {
          ...base.items[0],
          biaya_tambahan: [{ label: "Editing", nominal: 20000 }],
        },
      ],
    };
    expect(createSaleSchema.safeParse(ok).success).toBe(true);
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `npx jest schemas-pos -t "biaya tambahan modal"`
Expected: FAIL — kasus "menolak modal > nominal" belum ditolak (schema belum punya aturan).

- [ ] **Step 4: Implement aturan di `biayaTambahanSchema`**

Di `src/lib/schemas/pos.ts`, ganti `biayaTambahanSchema`:

```ts
const biayaTambahanSchema = z
  .object({
    label: z.string(),
    nominal: finiteNumber,
    modal: finiteNumber.nonnegative().optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    // Hanya validasi baris yang akan disimpan (label terisi & nominal > 0).
    const label = String(val.label || "").trim();
    const nominal = Number(val.nominal) || 0;
    const modal = Number(val.modal) || 0;
    if (!label || nominal <= 0) return;
    if (modal > nominal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Modal tidak boleh melebihi nominal biaya tambahan",
        path: ["modal"],
      });
    }
  });
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `npx jest schemas-pos -t "biaya tambahan modal"`
Expected: PASS (3 kasus).

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 7: Commit**

```bash
git add src/app/pos/pos-types.ts src/lib/schemas/pos.ts src/lib/__tests__/schemas-pos.test.ts
git commit -m "feat(pos): schema & tipe modal biaya tambahan"
```

---

### Task 3: Simpan `modal` + post pengeluaran keuangan di createSale

**Files:**
- Modify: `src/lib/services/pos-mutations.ts` (insert `biaya_tambahan_penjualan` baris 769-799; penambahan posting keuangan setelah blok OMZET/HPP sekitar 819-835)
- Test: `src/lib/__tests__/biaya-tambahan-modal.test.ts` (baru)

**Interfaces:**
- Consumes: `biayaTambahanSchema` dengan `modal` (Task 2); kolom DB `modal` (Task 1).
- Produces: baris `biaya_tambahan_penjualan.modal` tersimpan; baris keuangan `kategori_transaksi: "BIAYA"`, `reference_type: "SALE_EXTRA_COST"`, `keperluan` mengandung `[REF:<saleId>]`, `kredit = Σ modal`, diposting saat transaksi dibuat bila `Σ modal > 0`.

- [ ] **Step 1: Tulis test yang gagal dulu**

Buat `src/lib/__tests__/biaya-tambahan-modal.test.ts`. Ikuti pola mock pada `src/lib/__tests__/pos-mutations-pending-maklon.test.ts` (mock `@/lib/db-unified` via `helpers/mock-db`, mock `purchases-service`, `inventory-service`, `shop-settings-service`, `finance-service`). Isi test:

```ts
import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual(
    "./helpers/mock-db",
  ) as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
    isCompositeTransactionAtomic: async () => false,
  };
});

jest.mock("@/lib/services/purchases-service", () => ({
  __esModule: true,
  createMaklonPurchase: jest.fn(),
  deleteMaklonPurchasesForSale: jest.fn(),
}));
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  postInventoryMovement: jest.fn().mockResolvedValue({}),
  getInventoryMovements: jest.fn().mockResolvedValue([]),
  rebuildInventoryBalance: jest.fn().mockResolvedValue(undefined),
  getRollVariants: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/lib/services/shop-settings-service", () => ({
  __esModule: true,
  getShopSettings: jest.fn().mockResolvedValue({
    inv_prefix: "INV", inv_format: "PREFIX-DATE-SEQ", inv_reset: "daily",
    inv_padding: 3, inv_start_seq: 1, spk_prefix: "SPK", spk_format: "PREFIX-SEQ",
    spk_reset: "never", spk_padding: 4, spk_start_seq: 1,
  }),
}));
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: jest.fn().mockResolvedValue(undefined),
  resolveOpenPeriodeIdForKeuangan: jest.fn().mockResolvedValue(null),
}));

import { createSale } from "../services/pos-service";

beforeEach(() => resetMockDb());

function saleWith(biaya: any[], metode = "CASH") {
  return {
    kasir_id: "u1",
    pelanggan_id: "p1",
    tanggal: "2026-07-11",
    total_jumlah: 80000,
    jumlah_dibayar: metode === "NET30" ? 0 : 80000,
    jumlah_kembalian: 0,
    metode_pembayaran: metode,
    items: [
      {
        tipe_item: "BARANG",
        barang_id: "b1",
        harga_satuan_id: "h1",
        nama_satuan: "pcs",
        faktor_konversi: 1,
        harga_satuan: 50000,
        jumlah: 1,
        subtotal: 50000,
        biaya_tambahan: biaya,
      },
    ],
  } as any;
}

describe("biaya tambahan modal -> keuangan", () => {
  it("modal > 0 -> baris keuangan BIAYA dengan [REF] & modal tersimpan", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    mockTable("barang").set("b1", { id: "b1", nama: "Banner", average_cost_per_base_unit: 0 });
    await createSale(saleWith([{ label: "Pasang bambu", nominal: 30000, modal: 15000 }]));

    const rows = Array.from(mockTable("biaya_tambahan_penjualan").values());
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].modal)).toBe(15000);

    const keu = Array.from(mockTable("keuangan").values());
    const biayaRow = keu.find((k) => k.kategori_transaksi === "BIAYA");
    expect(biayaRow).toBeTruthy();
    expect(Number(biayaRow.kredit)).toBe(15000);
    expect(String(biayaRow.keperluan)).toContain("[REF:");
    expect(biayaRow.reference_type).toBe("SALE_EXTRA_COST");
  });

  it("modal 0 -> tidak ada baris keuangan BIAYA", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    mockTable("barang").set("b1", { id: "b1", nama: "Banner", average_cost_per_base_unit: 0 });
    await createSale(saleWith([{ label: "Editing", nominal: 20000 }]));
    const keu = Array.from(mockTable("keuangan").values());
    expect(keu.some((k) => k.kategori_transaksi === "BIAYA")).toBe(false);
  });

  it("NET30 -> modal tetap diposting saat transaksi dibuat", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    mockTable("barang").set("b1", { id: "b1", nama: "Banner", average_cost_per_base_unit: 0 });
    await createSale(saleWith([{ label: "Ongkir", nominal: 20000, modal: 20000 }], "NET30"));
    const keu = Array.from(mockTable("keuangan").values());
    const biayaRow = keu.find((k) => k.kategori_transaksi === "BIAYA");
    expect(biayaRow).toBeTruthy();
    expect(Number(biayaRow.kredit)).toBe(20000);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx jest biaya-tambahan-modal`
Expected: FAIL — `modal` belum disimpan & baris keuangan BIAYA belum ada.

- [ ] **Step 3: Simpan `modal` saat insert biaya tambahan**

Di `src/lib/services/pos-mutations.ts`, blok insert `biaya_tambahan_penjualan` (baris 758-799):

1. Pada `perItemBiaya` map (baris 758-764), tambahkan `modal`:

```ts
      const perItemBiaya = (data.items || []).flatMap((it: any, i: number) =>
        ((it as any).biaya_tambahan || []).map((b: any) => ({
          label: String(b.label || "").trim(),
          nominal: Number(b.nominal) || 0,
          modal: Number(b.modal) || 0,
          item_index: i,
        })),
      );
```

2. Pada `flatBiaya` map (baris 765-768), tambahkan `modal`:

```ts
      const flatBiaya = (data.biaya_tambahan || []).map((b: any) => ({
        label: String(b.label || "").trim(),
        nominal: Number(b.nominal) || 0,
        modal: Number(b.modal) || 0,
      }));
```

3. Pada kedua `db.insert("biaya_tambahan_penjualan", {...})` (baris 775-782 dan 789-796), tambahkan field `modal`:

```ts
            label: b.label,
            nominal: b.nominal,
            modal: Math.min(Number(b.modal) || 0, Number(b.nominal) || 0),
            urutan: urutan++,
```

dan pada insert kedua:

```ts
            label: b.label,
            nominal: b.nominal,
            modal: Math.min(Number(b.modal) || 0, Number(b.nominal) || 0),
            urutan: i,
```

- [ ] **Step 4: Hitung total modal & post keuangan BIAYA**

Di `src/lib/services/pos-mutations.ts`, tepat setelah blok HPP (`if (totalHpp > 0) { ... }` yang berakhir sekitar baris 835), tambahkan:

```ts
      // Porsi modal biaya tambahan = pengeluaran kas pihak ketiga. Dicatat
      // sebagai kategori BIAYA dengan token [REF:saleId] (void otomatis).
      // Selalu diposting saat transaksi dibuat (kas keluar riil), terlepas
      // metode bayar penjualan. Tidak mengubah total tagihan pelanggan.
      const totalModalBiaya = (() => {
        const perItem = (data.items || []).flatMap(
          (it: any) => it.biaya_tambahan || [],
        );
        const source = perItem.length > 0 ? perItem : data.biaya_tambahan || [];
        return source.reduce((sum: number, b: any) => {
          const label = String(b?.label || "").trim();
          const nominal = Number(b?.nominal) || 0;
          const modal = Number(b?.modal) || 0;
          if (!label || nominal <= 0 || modal <= 0) return sum;
          return sum + Math.min(modal, nominal);
        }, 0);
      })();
      if (totalModalBiaya > 0) {
        await createFinanceEntry({
          tanggal: tanggalSale,
          kategori_transaksi: "BIAYA",
          debit: 0,
          kredit: totalModalBiaya,
          keperluan: `Biaya tambahan ${invoiceNumber} [REF:${saleId}]`,
          omzet: 0,
          catatan: data.catatan,
          dibuat_oleh: data.kasir_id,
          reference_type: "SALE_EXTRA_COST",
          reference_id: saleId,
        });
      }
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `npx jest biaya-tambahan-modal`
Expected: PASS (3 kasus).

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/pos-mutations.ts src/lib/__tests__/biaya-tambahan-modal.test.ts
git commit -m "feat(keuangan): post pengeluaran BIAYA dari modal biaya tambahan"
```

---

### Task 4: Modal masuk HPP/margin item

**Files:**
- Modify: `src/lib/services/pos-mutations.ts` (perhitungan `grossProfit`/`totalHpp` sekitar baris 649-658)
- Test: `src/lib/__tests__/biaya-tambahan-modal.test.ts` (tambah kasus margin)

**Interfaces:**
- Consumes: `item.biaya_tambahan[].modal` pada cart item; `hppTotal` per item yang sudah dihitung.
- Produces: `item_penjualan.hpp_total` & `gross_profit` memasukkan modal biaya tambahan item; agregat kas `totalHpp` TIDAK memasukkan modal (dicegah dobel karena modal sudah diposting terpisah sebagai `BIAYA` di Task 3).

- [ ] **Step 1: Tulis test margin yang gagal dulu**

Tambahkan ke `src/lib/__tests__/biaya-tambahan-modal.test.ts`:

```ts
describe("biaya tambahan modal -> margin item", () => {
  it("modal membebani hpp_total & gross_profit item", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    mockTable("barang").set("b1", { id: "b1", nama: "Banner", average_cost_per_base_unit: 0 });
    // item subtotal 50000, HPP barang 0, biaya tambahan modal 15000
    await createSale({
      kasir_id: "u1", pelanggan_id: "p1", tanggal: "2026-07-11",
      total_jumlah: 80000, jumlah_dibayar: 80000, jumlah_kembalian: 0,
      metode_pembayaran: "CASH",
      items: [{
        tipe_item: "BARANG", barang_id: "b1", harga_satuan_id: "h1",
        nama_satuan: "pcs", faktor_konversi: 1, harga_satuan: 50000,
        jumlah: 1, subtotal: 50000,
        biaya_tambahan: [{ label: "Pasang bambu", nominal: 30000, modal: 15000 }],
      }],
    } as any);

    const ip = Array.from(mockTable("item_penjualan").values())[0];
    expect(Number(ip.hpp_total)).toBe(15000);
    expect(Number(ip.gross_profit)).toBe(50000 - 15000);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx jest biaya-tambahan-modal -t "margin item"`
Expected: FAIL — `hpp_total` masih 0 (modal belum dibebankan).

- [ ] **Step 3: Bebankan modal ke hppTotal item (sebelum grossProfit)**

Di `src/lib/services/pos-mutations.ts`, sebelum baris `const grossProfit = item.subtotal - hppTotal;` (baris 649), tambahkan:

```ts
        // Modal biaya tambahan item = bagian HPP item (untuk margin akurat).
        // Tidak ditambahkan ke agregat kas totalHpp: modal sudah diposting
        // terpisah sebagai kategori BIAYA (hindari dobel di kas).
        const modalBiayaItem = ((item as any).biaya_tambahan || []).reduce(
          (sum: number, b: any) => {
            const nominal = Number(b?.nominal) || 0;
            const modal = Number(b?.modal) || 0;
            if (nominal <= 0 || modal <= 0) return sum;
            return sum + Math.min(modal, nominal);
          },
          0,
        );
        hppTotal += modalBiayaItem;
```

Catatan: `totalHpp += hppTotal` di baris 656-658 tetap hanya untuk `!isMaklon`. Karena modal sekarang bagian dari `hppTotal`, ini akan menaikkan `totalHpp` (agregat kas HPP) — YANG SALAH (dobel dgn baris BIAYA). Untuk mencegah, ubah akumulasi `totalHpp` agar TIDAK memasukkan modal biaya tambahan.

Catatan item maklon: untuk `isMaklon`, `hppTotal` (kini termasuk `modalBiayaItem`) tetap tersimpan di `item_penjualan.hpp_total` untuk margin, dan tidak masuk `totalHpp` sama sekali (memang di-skip). Modal biaya tambahan pada item maklon tetap tercatat sebagai pengeluaran lewat baris `BIAYA` global (Task 3) — jadi tidak hilang dan tidak dobel.

Ganti blok baris 656-658:

```ts
        if (!isMaklon) {
          // Kurangi modal biaya tambahan dari agregat kas HPP: modal diposting
          // terpisah sebagai kategori BIAYA, jadi tidak boleh dobel di sini.
          totalHpp += hppTotal - modalBiayaItem;
        }
```

- [ ] **Step 4: Jalankan test margin, pastikan lulus**

Run: `npx jest biaya-tambahan-modal -t "margin item"`
Expected: PASS.

- [ ] **Step 5: Jalankan seluruh test biaya-tambahan-modal + regres HPP**

Run: `npx jest biaya-tambahan-modal pos-mutations-hpp-bom`
Expected: PASS semua (memastikan perubahan totalHpp tidak merusak HPP barang biasa).

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/pos-mutations.ts src/lib/__tests__/biaya-tambahan-modal.test.ts
git commit -m "feat(margin): modal biaya tambahan masuk HPP item tanpa dobel kas"
```

---

### Task 5: UI input Modal di POS

**Files:**
- Modify: `src/app/pos/page.tsx` (editor `formBiayaTambahan`, baris ~2178-2245; state add-row baris ~2160-2166; validasi build cart baris ~662-664)

**Interfaces:**
- Consumes: `BiayaTambahanItem.modal` (Task 2).
- Produces: input "Modal" per baris; payload checkout menyertakan `modal`.

- [ ] **Step 1: Add-row default sertakan modal**

Di `src/app/pos/page.tsx` tombol "+ Tambah" (baris 2162-2166), ubah default row:

```tsx
                                onClick={() =>
                                  setFormBiayaTambahan([
                                    ...formBiayaTambahan,
                                    { label: "", nominal: 0, modal: 0 },
                                  ])
                                }
```

- [ ] **Step 2: Tambah input Modal di tiap baris**

Di `src/app/pos/page.tsx`, di dalam `.map` baris biaya tambahan (setelah input `nominal`, sebelum tombol hapus — sekitar baris 2214), tambahkan input Modal:

```tsx
                                    <input
                                      type="number"
                                      step="1000"
                                      min="0"
                                      value={biaya.modal || ""}
                                      onChange={(e) => {
                                        const next = [...formBiayaTambahan];
                                        next[idx] = {
                                          ...next[idx],
                                          modal: parseFloat(e.target.value) || 0,
                                        };
                                        setFormBiayaTambahan(next);
                                      }}
                                      placeholder="Modal"
                                      title="Modal / biaya pihak ketiga (opsional). Porsi ini jadi pengeluaran, sisanya omzet."
                                      className="w-20 px-1.5 py-1 text-xs text-right bg-amber-50 dark:bg-amber-950/20 text-gray-900 dark:text-slate-100 border border-amber-300 dark:border-amber-800 rounded focus:outline-none focus:border-amber-500 font-semibold"
                                    />
```

- [ ] **Step 3: Bawa `modal` di validFormBiayaTambahan (buildCartItem)**

Di `src/app/pos/page.tsx` sekitar baris 662-664, sertakan `modal` dan clamp ke nominal:

```tsx
    const validFormBiayaTambahan = formBiayaTambahan
      .filter((b) => b.label.trim() && b.nominal > 0)
      .map((b) => ({
        label: b.label.trim(),
        nominal: b.nominal,
        modal: Math.min(Math.max(Number(b.modal) || 0, 0), b.nominal),
      }));
```

- [ ] **Step 4: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error, build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/app/pos/page.tsx
git commit -m "feat(pos-ui): input Modal per baris biaya tambahan"
```

---

### Task 6: Void reversal — verifikasi (tanpa kode baru)

**Files:**
- Test: `src/lib/__tests__/biaya-tambahan-modal.test.ts` (tambah kasus void)

**Interfaces:**
- Consumes: `voidSale` yang menandai VOIDED semua baris keuangan ber-`[REF:saleId]`.
- Produces: bukti bahwa baris `BIAYA` (SALE_EXTRA_COST) ikut ter-void tanpa kode tambahan.

- [ ] **Step 1: Tulis test void**

Tambahkan ke `src/lib/__tests__/biaya-tambahan-modal.test.ts` (import `voidSale` dari `../services/pos-mutations`; mock `purchases-service.deleteMaklonPurchasesForSale` sudah ada):

```ts
import { voidSale } from "../services/pos-mutations";

describe("void -> baris BIAYA modal ikut ter-void", () => {
  it("menandai VOIDED baris keuangan SALE_EXTRA_COST", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    mockTable("barang").set("b1", { id: "b1", nama: "Banner", average_cost_per_base_unit: 0 });
    const res = await createSale(saleWith([{ label: "Ongkir", nominal: 20000, modal: 20000 }]));
    const saleId = (res as any).id;

    await voidSale(saleId, "uji void", "u1");

    const keu = Array.from(mockTable("keuangan").values());
    const biayaRow = keu.find((k) => k.reference_type === "SALE_EXTRA_COST");
    expect(biayaRow).toBeTruthy();
    expect(biayaRow.status_transaksi).toBe("VOIDED");
  });
});
```

- [ ] **Step 2: Jalankan test**

Run: `npx jest biaya-tambahan-modal -t "void"`
Expected: PASS (void sudah menangani via `[REF:saleId]`). Jika FAIL, periksa apakah `voidSale` butuh setup penjualan `status_transaksi: "POSTED"` — sesuaikan seed mengikuti `void-sale-side-effects.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/biaya-tambahan-modal.test.ts
git commit -m "test(void): baris BIAYA modal ikut ter-void via [REF]"
```

---

### Task 7: Verifikasi menyeluruh + migrasi DB

**Files:** (tidak ada perubahan kode; verifikasi & migrasi)

- [ ] **Step 1: Type-check penuh**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sukses.

- [ ] **Step 3: Jest suite terkait**

Run: `npx jest biaya-tambahan-modal schemas-pos pos-mutations void-sale finance keuangan`
Expected: semua PASS.

- [ ] **Step 4: Terapkan migrasi lokal**

Run: `npx supabase migration up --local`
Expected: migrasi `20260711120000_biaya_tambahan_modal` ter-apply (atau "up to date" bila sudah).

- [ ] **Step 5: Terapkan migrasi cloud**

Run: `npx supabase db push`
Expected: kolom `modal` ter-apply di remote (atau "up to date").

- [ ] **Step 6: Commit (bila ada perubahan snapshot) & selesai**

```bash
git add -A
git commit -m "chore: verifikasi & migrasi modal biaya tambahan" || echo "tidak ada perubahan untuk di-commit"
```
