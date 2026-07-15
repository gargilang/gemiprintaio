# SPK Roll Komponen Rakitan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Komponen berdimensi dalam produk rakitan mendapat perlakuan roll penuh di SPK (rekomendasi roll, konfirmasi roll variant + panjang aktual, pemotongan stok roll-width-aligned, HPP AVCO akurat) via baris `item_produksi` anak.

**Architecture:** Opsi A — saat `createSale`, untuk item BARANG yang punya komponen BOM berdimensi, buat baris `item_produksi` anak (kolom baru `parent_item_produksi_id`) dengan `barang_id` = komponen. Mesin roll yang sudah ada (`postProductionMaterialConsumption`, roll-aligned `postInventoryMovement`) diperluas untuk menargetkan baris anak. `deductBomComponents` skip komponen berdimensi agar tidak dobel potong. SPK web + cetak menampilkan komponen sebagai sub-baris dengan konfirmasi roll.

**Tech Stack:** Next.js (server actions/services), TypeScript, better-sqlite3 (desktop) + Supabase Postgres (web), Jest (project `node`).

**Spec:** `docs/superpowers/specs/2026-07-15-spk-roll-komponen-rakitan-design.md`

## Global Constraints

- #2 Schema change → TIGA tempat sinkron: (a) `supabase/migrations/<timestamp>_<name>.sql` (additive, `IF NOT EXISTS`), (b) `database/sqlite-schema.sql`, (c) runtime `ALTER TABLE ADD COLUMN` di `src/lib/db-unified.ts`.
- #3 Inventory mutation lewat `postInventoryMovement` (roll-aligned), bukan raw `db.update`.
- #6 Roll/dimensi: `jumlah` (m²) = `jumlah_roll × panjang × lebar`; roll-width-aligned; input Lebar × Panjang.
- #7 Closed-period guard pada mutasi bertanggal (`isDateInClosedPeriod`) — ikuti pola konsumsi berdimensi murni bila ada.
- #9 ID ledger/baris idempoten & deterministik dari source row (mis. `${itemProdIndukId}-komp-${komponen.id}`, `mov-${consumptionId}`).
- #10 Verifikasi: `npm run type-check` (0 error) → `npm run build` → `npx jest <relevant>`.
- Bahasa Indonesia baku untuk komentar/JSDoc/UI baru. Ikon SVG (bukan emoji). Dark mode pair di elemen UI baru.
- Fungsi existing yang dipakai (verified ada): `resolveBomForUnitPrice(barangId, unitPriceId)` (`src/lib/services/bom-service.ts:27`), `hitungQtyKomponenDimensiM2(jumlahRoll, panjang, lebar)` (`src/lib/bom-utils.ts:3`), `suggestSmallestCoveringRollSize(panjang, lebar, sizes)` (`src/lib/roll-size-utils.ts:53`), `getRollVariants(barangId)` (`src/lib/services/inventory-service.ts:114`), `postInventoryMovement` (`src/lib/services/inventory-service.ts`), `getBillableDimensionsForRoll` (`src/lib/roll-size-utils.ts`).

---

### Task 1: Migrasi DB — kolom `parent_item_produksi_id` di `item_produksi`

**Files:**
- Create: `supabase/migrations/20260715120000_item_produksi_komponen_rakitan.sql`
- Modify: `database/sqlite-schema.sql` (definisi `CREATE TABLE item_produksi`)
- Modify: `src/lib/db-unified.ts` (blok runtime ALTER `item_produksi`, dekat baris ~1709-1727)

**Interfaces:**
- Produces: kolom `item_produksi.parent_item_produksi_id TEXT` (nullable). `NULL` = baris induk/normal.

- [ ] **Step 1: Tulis migrasi Supabase**

Buat `supabase/migrations/20260715120000_item_produksi_komponen_rakitan.sql`:

```sql
-- Baris item_produksi anak untuk komponen rakitan berdimensi.
-- parent_item_produksi_id != NULL menandai baris ini adalah komponen (barang_id
-- = komponen berdimensi) dari item produksi induk. NULL = baris normal/induk.
ALTER TABLE item_produksi
  ADD COLUMN IF NOT EXISTS parent_item_produksi_id TEXT
  REFERENCES item_produksi(id) ON DELETE CASCADE;
```

- [ ] **Step 2: Tambah kolom di sqlite-schema.sql**

Di `database/sqlite-schema.sql`, pada `CREATE TABLE item_produksi (...)`, tambahkan kolom sebelum baris `dibuat_pada`/sync (cari kolom `catatan_produksi TEXT,` di sekitar baris 749 sebagai anchor):

```sql
      catatan_produksi TEXT,
      parent_item_produksi_id TEXT,
```

- [ ] **Step 3: Tambah runtime ALTER di db-unified.ts**

Di `src/lib/db-unified.ts`, dalam blok migrasi `item_produksi` (cari `PRAGMA table_info(item_produksi)` — pola sama seperti kolom lain). Tambahkan:

```ts
      if (!cols.includes("parent_item_produksi_id")) {
        db.exec(
          "ALTER TABLE item_produksi ADD COLUMN parent_item_produksi_id TEXT",
        );
      }
```

Jika belum ada blok `PRAGMA table_info(item_produksi)`, buat blok baru mengikuti pola blok `item_penjualan` (baris ~1709):

```ts
    // Migrasi (20260715120000): item_produksi kolom parent_item_produksi_id
    // untuk baris anak komponen rakitan berdimensi.
    {
      const cols = (
        db.prepare("PRAGMA table_info(item_produksi)").all() as Array<{
          name: string;
        }>
      ).map((c) => c.name);
      if (!cols.includes("parent_item_produksi_id")) {
        db.exec(
          "ALTER TABLE item_produksi ADD COLUMN parent_item_produksi_id TEXT",
        );
      }
    }
```

- [ ] **Step 4: Verifikasi**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260715120000_item_produksi_komponen_rakitan.sql database/sqlite-schema.sql src/lib/db-unified.ts
git commit -m "feat(spk): migrasi kolom parent_item_produksi_id di item_produksi"
```

---

### Task 2: Buat baris anak komponen berdimensi saat checkout

**Files:**
- Modify: `src/lib/services/pos-mutations.ts` (loop pembuatan `item_produksi`, setelah insert item induk ~baris 1032-1036)
- Test: `src/lib/__tests__/pos-mutations-rakitan-roll.test.ts` (baru)

**Interfaces:**
- Consumes: `resolveBomForUnitPrice`, `hitungQtyKomponenDimensiM2`, `suggestSmallestCoveringRollSize`, `getStoredRollSizes`/`getRollVariants` untuk rekomendasi.
- Produces: baris `item_produksi` dengan `parent_item_produksi_id` terisi, `barang_id` = komponen, `roll_inventory_status = "PENDING"`.

- [ ] **Step 1: Tulis test gagal — createSale rakitan membuat baris anak**

Buat `src/lib/__tests__/pos-mutations-rakitan-roll.test.ts`. Ikuti pola mock dari `src/lib/__tests__/pos-mutations-pending-maklon.test.ts` (mock `db` in-memory via `mockTable`). Setup: barang induk "Kaki Roll Banner" (`butuh_dimensi_status=0`), produk jual "X Banner", barang komponen "Flexi 280" (`butuh_dimensi_status=1`), dan row `barang_komponen` (parent=induk, komponen=Flexi, `panjang=1.3`, `lebar=1.8`, `jumlah_roll=1`, `unit_price_id` = harga produk jual). Jual 1 X Banner.

```ts
it("createSale rakitan → baris item_produksi anak dibuat untuk komponen berdimensi", async () => {
  mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
  // ... setup barang induk, komponen, barang_komponen (lihat pola pending-maklon test) ...
  await createSale(baseSaleRakitan as any);

  const prodItems = Array.from(mockTable("item_produksi").values());
  // 1 induk + 1 anak komponen
  const induk = prodItems.find((r) => !r.parent_item_produksi_id);
  const anak = prodItems.find((r) => r.parent_item_produksi_id);
  expect(induk).toBeTruthy();
  expect(anak).toBeTruthy();
  expect(anak.parent_item_produksi_id).toBe(induk.id);
  expect(anak.barang_id).toBe("flexi-280"); // komponen, bukan induk
  expect(anak.roll_inventory_status).toBe("PENDING");
  // stok komponen TIDAK dipotong saat checkout (tidak ada SALE_ISSUE untuk flexi)
  const issues = Array.from(mockTable("inventory_movements").values()).filter(
    (m) => m.barang_id === "flexi-280" && Number(m.qty_delta) < 0,
  );
  expect(issues).toHaveLength(0);
});
```

- [ ] **Step 2: Run test → verifikasi gagal**

Run: `npx jest pos-mutations-rakitan-roll`
Expected: FAIL (baris anak belum dibuat).

- [ ] **Step 3: Implementasi pembuatan baris anak**

Di `src/lib/services/pos-mutations.ts`, tepat setelah `if (prodItemResult.error) throw prodItemResult.error;` (baris ~1036, setelah insert `item_produksi` induk) dan sebelum blok finishing, tambahkan. Import di atas file: `resolveBomForUnitPrice` dari `./bom-service`, `hitungQtyKomponenDimensiM2` dari `../bom-utils`, `suggestSmallestCoveringRollSize` dari `../roll-size-utils`, `getRollVariants` dari `./inventory-service` (cek dulu import yang sudah ada; tambah hanya yang belum).

```ts
          // Rakitan: buat baris item_produksi anak untuk tiap komponen BOM
          // yang berdimensi. Barang induk (mis. Kaki Roll Banner) bisa non-dimensi,
          // tapi komponen (mis. Flexi 280) berdimensi → butuh jalur roll di SPK.
          if (!isMaklon) {
            const komponenBom = await resolveBomForUnitPrice(
              item.barang_id,
              item.harga_satuan_id ?? null,
            );
            for (const k of komponenBom) {
              const kompRes = await db.queryOne<any>("barang", {
                where: { id: k.komponen_id },
              });
              const kompBarang = kompRes.data;
              const berdimensi =
                kompBarang &&
                Number(kompBarang.butuh_dimensi_status) === 1 &&
                k.panjang != null &&
                k.lebar != null &&
                Number(k.panjang) > 0 &&
                Number(k.lebar) > 0;
              if (!berdimensi) continue;

              const perUnitM2 = hitungQtyKomponenDimensiM2(
                Number(k.jumlah_roll ?? 1),
                Number(k.panjang),
                Number(k.lebar),
              );
              const totalM2 = perUnitM2 * Number(item.jumlah);
              // Rekomendasi lebar roll dari variants komponen.
              let recommended: number | null = null;
              try {
                const variants = await getRollVariants(k.komponen_id);
                const sizes = variants
                  .map((v) => Number(v.lebar_m))
                  .filter((n) => Number.isFinite(n) && n > 0);
                if (sizes.length > 0) {
                  recommended = suggestSmallestCoveringRollSize(
                    Number(k.panjang),
                    Number(k.lebar),
                    sizes,
                  );
                }
              } catch {
                recommended = null;
              }

              const childId = `${itemProdId}-komp-${k.id}`;
              const childItem = {
                id: childId,
                order_produksi_id: orderId,
                item_penjualan_id: itemPenjualan.id,
                parent_item_produksi_id: itemProdId,
                barang_id: k.komponen_id,
                barang_nama: kompBarang.nama || "Komponen",
                jumlah: totalM2,
                nama_satuan: "m²",
                panjang: Number(k.panjang),
                lebar: Number(k.lebar),
                billed_panjang: null,
                billed_lebar: null,
                recommended_roll_width_m: recommended,
                roll_inventory_status: "PENDING" as const,
                status: "MENUNGGU" as const,
              };
              const childRes = await db.insert("item_produksi", childItem);
              if (childRes.error) throw childRes.error;
            }
          }
```

- [ ] **Step 4: Run test → verifikasi lolos**

Run: `npx jest pos-mutations-rakitan-roll`
Expected: PASS.

- [ ] **Step 5: type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/pos-mutations.ts src/lib/__tests__/pos-mutations-rakitan-roll.test.ts
git commit -m "feat(spk): buat baris produksi anak untuk komponen rakitan berdimensi saat checkout"
```

---

### Task 3: `deductBomComponents` skip komponen berdimensi

**Files:**
- Modify: `src/lib/services/production-service.ts` (`deductBomComponents`, baris ~1029-1043)
- Test: `src/lib/__tests__/production-bom-skip-dimensi.test.ts` (baru)

**Interfaces:**
- Consumes: struktur `komponen` dari `resolveBomForUnitPrice`.
- Produces: komponen berdimensi TIDAK dipotong m² polos (dibiarkan ke jalur roll konfirmasi Task 4).

- [ ] **Step 1: Tulis test gagal — komponen berdimensi tidak dipotong m² polos**

Buat `src/lib/__tests__/production-bom-skip-dimensi.test.ts`. Setup BOM dengan 1 komponen berdimensi (Flexi 280, panjang/lebar terisi) + 1 komponen non-dimensi (tiang, qty saja). Panggil `deductBomComponents`.

```ts
it("deductBomComponents skip komponen berdimensi, tetap potong non-dimensi", async () => {
  // ... setup barang komponen dimensi + non-dimensi + barang_komponen rows ...
  await deductBomComponents({
    barangId: "kaki-roll",
    unitPriceId: "pj-xbanner",
    qtySPK: 1,
    spkId: "OP-1",
    nomorSpk: "SPK-1",
    dibuatOleh: "u1",
    itemProduksiId: "IP-1",
  });
  const moves = Array.from(mockTable("inventory_movements").values());
  // Flexi (dimensi) TIDAK dipotong di sini
  expect(moves.find((m) => m.barang_id === "flexi-280")).toBeUndefined();
  // Tiang (non-dimensi) tetap dipotong
  expect(moves.find((m) => m.barang_id === "tiang")).toBeTruthy();
});
```

- [ ] **Step 2: Run test → verifikasi gagal**

Run: `npx jest production-bom-skip-dimensi`
Expected: FAIL (Flexi masih dipotong).

- [ ] **Step 3: Implementasi skip**

Di `src/lib/services/production-service.ts`, dalam `deductBomComponents`, di awal loop `for (const k of komponen)` (baris ~1029), tambahkan guard skip komponen berdimensi. Perlu cek `butuh_dimensi_status` barang komponen:

```ts
  for (const k of komponen) {
    // Komponen berdimensi ditangani jalur roll (baris produksi anak +
    // postProductionMaterialConsumption). Skip di sini agar tidak dobel potong.
    if (
      k.jumlah_roll != null &&
      k.panjang != null &&
      k.lebar != null &&
      Number(k.panjang) > 0 &&
      Number(k.lebar) > 0
    ) {
      const kompRes = await db.queryOne<any>("barang", {
        where: { id: k.komponen_id },
      });
      if (Number(kompRes.data?.butuh_dimensi_status) === 1) continue;
    }
    let perUnitQty = Number(k.qty);
    // ... sisa loop tetap ...
```

- [ ] **Step 4: Run test → verifikasi lolos**

Run: `npx jest production-bom-skip-dimensi`
Expected: PASS.

- [ ] **Step 5: type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/production-service.ts src/lib/__tests__/production-bom-skip-dimensi.test.ts
git commit -m "feat(spk): deductBomComponents skip komponen berdimensi (dobel-potong guard)"
```

---

### Task 4: Konfirmasi roll untuk baris anak — perluas resolver & konsumsi

**Files:**
- Modify: `src/lib/services/production-service.ts` (`resolveProductionConsumptionContext` ~751-778, `getRollVariantsForProductionItem` ~780-785, `postProductionMaterialConsumption` ~787-912)
- Test: `src/lib/__tests__/production-konsumsi-komponen-roll.test.ts` (baru)

**Interfaces:**
- Consumes: baris anak dari Task 2 (`parent_item_produksi_id != null`, `barang_id` = komponen, `roll_inventory_status = "PENDING"`).
- Produces: konsumsi roll-aligned untuk komponen; `item_produksi` anak → `roll_inventory_status = "POSTED"`; HPP komponen ter-post via `postInventoryMovement`.

- [ ] **Step 1: Tulis test gagal — konfirmasi roll baris anak memotong stok roll-aligned**

Buat `src/lib/__tests__/production-konsumsi-komponen-roll.test.ts`. Setup baris `item_produksi` anak (parent terisi, barang_id=flexi-280, panjang/lebar, PENDING) + `barang_roll_variants` untuk flexi-280. Panggil `postProductionMaterialConsumption` dengan `item_produksi_id` = baris anak.

```ts
it("konfirmasi roll baris anak → potong stok flexi roll-aligned, status POSTED", async () => {
  // ... setup item_produksi anak + roll variant flexi (lebar_m 1.5) ...
  await postProductionMaterialConsumption({
    item_produksi_id: "IP-1-komp-bk1",
    roll_variant_id: "rv-flexi-15",
    linear_used_m: 1.8,
    operator_id: "u1",
  });
  const moves = Array.from(mockTable("inventory_movements").values());
  const issue = moves.find(
    (m) => m.barang_id === "flexi-280" && m.movement_type === "PRODUCTION_ISSUE",
  );
  expect(issue).toBeTruthy();
  expect(issue.roll_variant_id).toBe("rv-flexi-15");
  expect(Number(issue.roll_width_m)).toBe(1.5);
  const anak = mockTable("item_produksi").get("IP-1-komp-bk1");
  expect(anak.roll_inventory_status).toBe("POSTED");
});
```

- [ ] **Step 2: Run test → verifikasi gagal**

Run: `npx jest production-konsumsi-komponen-roll`
Expected: FAIL (resolver memakai `saleItem.barang_id` induk, bukan komponen; guard `roll_inventory_deferred` menolak).

- [ ] **Step 3: Perluas `resolveProductionConsumptionContext`**

Di `src/lib/services/production-service.ts`, ubah resolver agar untuk baris anak, `material` diambil dari `item.barang_id` (komponen), bukan `saleItem.barang_id`. Tambahkan flag `isKomponen`:

```ts
async function resolveProductionConsumptionContext(itemId: string): Promise<{
  item: any;
  saleItem: any;
  material: any;
  isKomponen: boolean;
}> {
  const itemResult = await db.queryOne<any>("item_produksi", {
    where: { id: itemId },
  });
  if (itemResult.error) throw itemResult.error;
  const item = itemResult.data;
  if (!item) throw new Error("Item produksi tidak ditemukan");

  const saleItemResult = await db.queryOne<any>("item_penjualan", {
    where: { id: item.item_penjualan_id },
  });
  if (saleItemResult.error) throw saleItemResult.error;
  const saleItem = saleItemResult.data;
  if (!saleItem) throw new Error("Item penjualan terkait tidak ditemukan");

  // Baris anak komponen rakitan: material = barang komponen (item.barang_id),
  // dimensi dari item (bukan dari saleItem induk yang bisa non-dimensi).
  const isKomponen = !!item.parent_item_produksi_id;
  const materialBarangId = isKomponen ? item.barang_id : saleItem.barang_id;
  const materialResult = await db.queryOne<any>("barang", {
    where: { id: materialBarangId },
  });
  if (materialResult.error) throw materialResult.error;
  const material = materialResult.data;
  if (!material) throw new Error("Barang produksi tidak ditemukan");

  return { item, saleItem, material, isKomponen };
}
```

- [ ] **Step 4: Perluas `getRollVariantsForProductionItem`**

```ts
export async function getRollVariantsForProductionItem(
  itemId: string,
): Promise<RollVariant[]> {
  const { item, saleItem, isKomponen } =
    await resolveProductionConsumptionContext(itemId);
  return getRollVariants(isKomponen ? item.barang_id : saleItem.barang_id);
}
```

- [ ] **Step 5: Perluas `postProductionMaterialConsumption`**

Ubah bagian awal fungsi: guard kelayakan + sumber roll variants + dimensi + `barang_id` movement. Ganti blok baris ~794-855 dengan versi yang sadar komponen. Kunci perubahan:
- Destructure `isKomponen`.
- Guard: untuk komponen, syarat `item.roll_inventory_status === "PENDING"`; untuk murni, tetap `saleItem.roll_inventory_deferred === 1`.
- `consumptionBarangId` = `isKomponen ? item.barang_id : saleItem.barang_id`.
- Variants dari `consumptionBarangId`.
- Dimensi pesanan (`orderP`, `orderL`) dari `item.panjang/lebar` bila komponen, else `saleItem.panjang/lebar ?? item...`.
- `billedArea` dari `item.jumlah` bila komponen (m² kebutuhan), else `saleItem.jumlah`.
- Semua `postInventoryMovement` + `consumption.barang_id` pakai `consumptionBarangId`.

```ts
  const { item, saleItem, material, isKomponen } =
    await resolveProductionConsumptionContext(input.item_produksi_id);
  if (Number(material.lacak_inventori_status) === 0) {
    throw new Error("Barang ini tidak melacak inventori");
  }
  const perluKonfirmasi = isKomponen
    ? item.roll_inventory_status === "PENDING"
    : Number(saleItem.roll_inventory_deferred || 0) === 1;
  if (!perluKonfirmasi) {
    throw new Error("Item ini tidak membutuhkan konfirmasi roll produksi");
  }

  const existing = await db.query<any>("production_material_consumptions", {
    where: { item_produksi_id: input.item_produksi_id },
  });
  const active = (existing.data || []).find(
    (row: any) => row.status === "POSTED",
  );
  if (active) {
    throw new Error("Konsumsi bahan untuk item ini sudah diposting");
  }

  const consumptionBarangId = isKomponen ? item.barang_id : saleItem.barang_id;
  const variants = await getRollVariants(consumptionBarangId);
  const variant = variants.find((row) => row.id === input.roll_variant_id);
  if (!variant) throw new Error("Varian roll tidak valid untuk barang ini");

  const rollWidth = positiveNumber(variant.lebar_m);
  const orderP = positiveNumber(
    isKomponen ? item.panjang : saleItem.panjang ?? item.panjang,
  );
  const orderL = positiveNumber(
    isKomponen ? item.lebar : saleItem.lebar ?? item.lebar,
  );
  const billedArea = positiveNumber(isKomponen ? item.jumlah : saleItem.jumlah);
```

Lalu ganti semua occurrence `barang_id: saleItem.barang_id` di `postInventoryMovement` issue & waste + `consumption.barang_id` menjadi `consumptionBarangId`. Dan `item_penjualan_id: saleItem.id` tetap (baris anak berbagi item_penjualan induk).

- [ ] **Step 6: Run test → verifikasi lolos**

Run: `npx jest production-konsumsi-komponen-roll`
Expected: PASS.

- [ ] **Step 7: Regression — test konsumsi berdimensi murni tetap lolos**

Run: `npx jest production-consumption production-order-detail`
Expected: PASS (semua). Perbaiki bila `resolveProductionConsumptionContext` mengubah return shape memecah pemanggil lain — grep `resolveProductionConsumptionContext(` untuk pastikan semua destructure kompatibel (menambah field aman).

- [ ] **Step 8: type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 9: Commit**

```bash
git add src/lib/services/production-service.ts src/lib/__tests__/production-konsumsi-komponen-roll.test.ts
git commit -m "feat(spk): konfirmasi roll roll-aligned untuk baris komponen rakitan"
```

---

### Task 5: Sinkron HPP komponen ke item_penjualan induk

**Files:**
- Modify: `src/lib/services/production-service.ts` (`postProductionMaterialConsumption`, setelah insert consumption ~892, sebelum return)
- Test: `src/lib/__tests__/production-konsumsi-komponen-roll.test.ts` (tambah kasus)

**Interfaces:**
- Consumes: movement issue komponen (unit_cost × area) dari Task 4.
- Produces: `item_penjualan` induk `hpp_total`/`gross_profit`/`gross_margin` diperbarui dari HPP komponen aktual.

- [ ] **Step 1: Tulis test gagal — HPP item penjualan tersinkron**

Tambahkan kasus di test Task 4:

```ts
it("konfirmasi roll komponen → hpp_total item_penjualan induk ikut terupdate", async () => {
  // setup: item_penjualan induk hpp_total=0, subtotal=100000
  // roll variant average_cost_per_m2 = 20000, area terpakai 1.5*1.8=2.7 m2
  await postProductionMaterialConsumption({
    item_produksi_id: "IP-1-komp-bk1",
    roll_variant_id: "rv-flexi-15",
    linear_used_m: 1.8,
    operator_id: "u1",
  });
  const ip = mockTable("item_penjualan").get("ip-induk");
  expect(Number(ip.hpp_total)).toBeGreaterThan(0); // HPP aktual dari roll
  expect(Number(ip.gross_profit)).toBe(
    Number(ip.subtotal) - Number(ip.hpp_total),
  );
});
```

- [ ] **Step 2: Run test → verifikasi gagal**

Run: `npx jest production-konsumsi-komponen-roll`
Expected: FAIL (hpp_total masih 0).

- [ ] **Step 3: Implementasi sinkron HPP**

Di `postProductionMaterialConsumption`, hanya untuk `isKomponen`, setelah insert consumption & sebelum `return consumption`, akumulasi HPP komponen ke item_penjualan induk. HPP komponen aktual = `unitCost × issueArea` (dari movement). Karena satu induk bisa punya banyak komponen, hitung total HPP dari semua consumption POSTED milik item_penjualan ini:

```ts
  if (isKomponen) {
    // Sinkron HPP: jumlahkan biaya semua konsumsi POSTED komponen di bawah
    // item_penjualan induk yang sama, lalu update hpp_total/gross_profit.
    const allCons = await db.query<any>("production_material_consumptions", {
      where: { item_penjualan_id: saleItem.id, status: "POSTED" },
    });
    let hppTotal = 0;
    for (const c of allCons.data || []) {
      const mv = c.movement_id
        ? (
            await db.queryOne<any>("inventory_movements", {
              where: { id: c.movement_id },
            })
          ).data
        : null;
      if (mv) {
        hppTotal +=
          positiveNumber(mv.unit_cost) * Math.abs(Number(mv.qty_delta || 0));
      }
    }
    // consumption saat ini belum tentu ter-load di query di atas (baru di-insert
    // dalam transaksi yang sama) — tambahkan kontribusinya bila belum terhitung.
    const sudahTerhitung = (allCons.data || []).some(
      (c: any) => c.id === consumption.id,
    );
    if (!sudahTerhitung) {
      hppTotal += unitCost * issueArea;
    }

    const subtotal = positiveNumber(saleItem.subtotal);
    const grossProfit = subtotal - hppTotal;
    const grossMargin = subtotal > 0 ? (grossProfit / subtotal) * 100 : 0;
    await db.update("item_penjualan", saleItem.id, {
      hpp_total: hppTotal,
      hpp_satuan:
        positiveNumber(saleItem.jumlah) > 0
          ? hppTotal / Number(saleItem.jumlah)
          : hppTotal,
      gross_profit: grossProfit,
      gross_margin: grossMargin,
    });
  }
```

- [ ] **Step 4: Run test → verifikasi lolos**

Run: `npx jest production-konsumsi-komponen-roll`
Expected: PASS.

- [ ] **Step 5: type-check**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/production-service.ts src/lib/__tests__/production-konsumsi-komponen-roll.test.ts
git commit -m "feat(spk): sinkron HPP komponen roll aktual ke item_penjualan induk"
```

---

### Task 6: Guard SELESAI — induk tak boleh selesai sebelum komponen dikonfirmasi

**Files:**
- Modify: `src/lib/services/production-service.ts` (`updateProductionItemStatus`, blok SELESAI ~1165)
- Test: `src/lib/__tests__/production-komponen-guard-selesai.test.ts` (baru)

**Interfaces:**
- Consumes: baris anak `roll_inventory_status`.
- Produces: error ramah bila menandai induk SELESAI sementara komponen berdimensi masih PENDING.

- [ ] **Step 1: Tulis test gagal**

```ts
it("tidak bisa SELESAI-kan item induk bila komponen roll belum dikonfirmasi", async () => {
  // setup induk + anak PENDING
  await expect(
    updateProductionItemStatus("IP-1", { status: "SELESAI", operator_id: "u1" }),
  ).rejects.toThrow(/roll/i);
});
```

- [ ] **Step 2: Run test → verifikasi gagal**

Run: `npx jest production-komponen-guard-selesai`
Expected: FAIL (belum ada guard).

- [ ] **Step 3: Implementasi guard**

Di `updateProductionItemStatus`, di awal blok `if (data.status === "SELESAI" && cur.data?.status !== "SELESAI")` (baris ~1165), sebelum `deductBomComponents`, cek baris anak PENDING:

```ts
    if (data.status === "SELESAI" && cur.data?.status !== "SELESAI") {
      // Guard: komponen rakitan berdimensi wajib konfirmasi roll dulu.
      const anak = await db.query<any>("item_produksi", {
        where: { parent_item_produksi_id: itemId },
      });
      const belumKonfirmasi = (anak.data || []).filter(
        (r: any) => r.roll_inventory_status === "PENDING",
      );
      if (belumKonfirmasi.length > 0) {
        throw new Error(
          "Konfirmasi roll komponen dulu sebelum menandai item selesai.",
        );
      }
      // ... lanjut deductBomComponents seperti semula ...
```

- [ ] **Step 4: Run test → verifikasi lolos**

Run: `npx jest production-komponen-guard-selesai`
Expected: PASS.

- [ ] **Step 5: type-check + regression**

Run: `npm run type-check && npx jest production`
Expected: 0 error; semua test produksi PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/production-service.ts src/lib/__tests__/production-komponen-guard-selesai.test.ts
git commit -m "feat(spk): guard SELESAI induk sampai roll komponen dikonfirmasi"
```

---

### Task 7: Query SPK — kelompokkan baris anak sebagai komponen

**Files:**
- Modify: `src/lib/services/production-service.ts` (`getProductionOrders` ~163-286 & `getProductionOrderById` ~396-443; tipe `ProductionOrderItem` ~40-89)
- Test: `src/lib/__tests__/production-order-detail.test.ts` (tambah kasus komponen)

**Interfaces:**
- Consumes: baris `item_produksi` dengan `parent_item_produksi_id`.
- Produces: `ProductionOrderItem.komponen_roll?: ProductionOrderItem[]`; baris anak TIDAK muncul top-level.

- [ ] **Step 1: Tambah field tipe**

Di `ProductionOrderItem` (~baris 88), tambahkan:

```ts
  /** Baris komponen rakitan berdimensi (roll) di bawah item ini. */
  komponen_roll?: ProductionOrderItem[];
  /** Referensi ke item induk bila baris ini komponen. */
  parent_item_produksi_id?: string | null;
```

- [ ] **Step 2: Tulis test gagal — komponen dikelompokkan, tidak top-level**

Di `production-order-detail.test.ts`, tambah kasus: order dengan 1 induk + 1 anak → `getProductionOrderById` mengembalikan 1 item top-level dengan `komponen_roll.length === 1`.

```ts
it("baris komponen rakitan dikelompokkan di bawah induk, tidak top-level", async () => {
  // setup induk IP-1 + anak IP-1-komp-x (parent_item_produksi_id=IP-1)
  const order = await getProductionOrderById("OP-1");
  expect(order.items).toHaveLength(1);
  expect(order.items[0].id).toBe("IP-1");
  expect(order.items[0].komponen_roll).toHaveLength(1);
  expect(order.items[0].komponen_roll[0].barang_id).toBe("flexi-280");
});
```

- [ ] **Step 3: Run test → verifikasi gagal**

Run: `npx jest production-order-detail`
Expected: FAIL (anak masih top-level).

- [ ] **Step 4: Implementasi grouping**

Di `getProductionOrders` dan `getProductionOrderById`, setelah membangun array `itemsWithFinishing` (atau setara), pisahkan induk vs anak lalu nest. Terapkan di kedua fungsi (DRY: bisa buat helper `nestKomponenRoll(items)`).

```ts
function nestKomponenRoll<T extends { id: string; parent_item_produksi_id?: string | null }>(
  items: T[],
): (T & { komponen_roll: T[] })[] {
  const anak = items.filter((i) => i.parent_item_produksi_id);
  const induk = items.filter((i) => !i.parent_item_produksi_id);
  const byParent = new Map<string, T[]>();
  for (const a of anak) {
    const pid = String(a.parent_item_produksi_id);
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(a);
  }
  return induk.map((i) => ({ ...i, komponen_roll: byParent.get(i.id) || [] }));
}
```

Panggil `nestKomponenRoll(itemsWithFinishing)` sebelum menaruh ke `items:` hasil. Pastikan tiap item membawa `parent_item_produksi_id` (map dari row) dan field roll (`recommended_roll_width_m`, `roll_inventory_status`, `panjang`, `lebar`, `barang_id`, `barang_nama`, `jumlah`) sudah ada di mapping existing.

- [ ] **Step 5: Run test → verifikasi lolos**

Run: `npx jest production-order-detail`
Expected: PASS.

- [ ] **Step 6: type-check + regression**

Run: `npm run type-check && npx jest production`
Expected: 0 error; semua PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/production-service.ts src/lib/__tests__/production-order-detail.test.ts
git commit -m "feat(spk): kelompokkan baris komponen rakitan di bawah item induk"
```

---

### Task 8: UI SPK — sub-baris komponen + konfirmasi roll

**Files:**
- Modify: `src/app/produksi/spk/components/SpkDetailModal.tsx` (blok item + konfirmasi roll ~253-379)

**Interfaces:**
- Consumes: `item.komponen_roll` (Task 7); handler konfirmasi roll existing yang menargetkan `item_produksi_id`.
- Produces: sub-baris komponen berdimensi dengan blok konfirmasi roll per komponen.

- [ ] **Step 1: Render sub-baris komponen roll**

Di `SpkDetailModal.tsx`, di dalam render tiap item induk (setelah baris komponen teks biasa ~253-261), tambahkan render `item.komponen_roll`. Untuk tiap komponen, tampilkan nama + ukuran cetak + rekomendasi roll, dan blok konfirmasi roll (dropdown variant + input panjang) yang memanggil handler konfirmasi existing dengan `item_produksi_id = komponen.id`. Gunakan komponen/handler yang sama seperti blok `roll_inventory_status === "PENDING"` existing (~314-379) — ekstrak jadi sub-komponen bila perlu agar dipakai ulang untuk induk & komponen.

Karena blok konfirmasi roll existing mengikat ke `item.id`, refactor jadi menerima `targetItemId` + `variants` + `recommended` sebagai props, lalu render sekali untuk item murni dan sekali per komponen roll. Pastikan dark-mode pair + ikon SVG.

- [ ] **Step 2: type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error; build sukses.

- [ ] **Step 3: Commit**

```bash
git add src/app/produksi/spk/components/SpkDetailModal.tsx
git commit -m "feat(spk): tampilkan komponen rakitan sebagai sub-baris + konfirmasi roll di detail SPK"
```

---

### Task 9: Cetak SPK — sub-baris komponen roll

**Files:**
- Modify: `src/app/produksi/spk/components/spk-print.ts` (render item ~220-255)

**Interfaces:**
- Consumes: `item.komponen_roll` (Task 7).
- Produces: sub-baris komponen berdimensi di cetak SPK dengan nama + ukuran cetak + roll rekomendasi/terkonfirmasi.

- [ ] **Step 1: Render sub-baris komponen di cetak**

Di `spk-print.ts`, di dalam loop item (setelah blok `catatan_produksi`/finishing ~251-255), tambahkan render `item.komponen_roll`:

```ts
      ${
        (item.komponen_roll || [])
          .map(
            (k) => `
      <div class="item-detail" style="padding-left:10px;">
        <strong>${escapeHtml(k.barang_nama || "Komponen")}</strong>
        ${k.panjang && k.lebar ? ` — ${Number(k.lebar).toFixed(2)} × ${Number(k.panjang).toFixed(2)} m` : ""}
        ${k.recommended_roll_width_m ? `<br>Roll disarankan: ${Number(k.recommended_roll_width_m).toFixed(2)} m` : ""}
      </div>`,
          )
          .join("")
      }
```

(Sesuaikan field bila roll terkonfirmasi tersedia — bila ada konsumsi POSTED, tampilkan roll terpakai. Untuk MVP tampilkan rekomendasi + ukuran cetak.)

- [ ] **Step 2: type-check + build**

Run: `npm run type-check && npm run build`
Expected: 0 error; build sukses.

- [ ] **Step 3: Commit**

```bash
git add src/app/produksi/spk/components/spk-print.ts
git commit -m "feat(spk): cetak sub-baris komponen rakitan berdimensi dengan info roll"
```

---

### Task 10: Verifikasi akhir & tinjauan manual

- [ ] **Step 1: Full verifikasi**

Run:
```bash
npm run type-check && npm run lint && npm run build && npx jest
```
Expected: 0 error type-check; tidak ada lint warning baru; build sukses; seluruh jest PASS.

- [ ] **Step 2: Tinjauan manual**

- Buat barang "Kaki Roll Banner" (non-dimensi) + "Flexi 280" (berdimensi, punya roll variant).
- Buat produk jual "X Banner" pada Kaki Roll Banner, rakit dengan komponen Flexi 280 (isi lebar × panjang + jumlah roll).
- Jual "X Banner" di POS → cek SPK: muncul sub-baris Flexi 280 dengan rekomendasi + dropdown konfirmasi roll.
- Konfirmasi roll (pilih variant + panjang) → stok Flexi berkurang roll-aligned; HPP item penjualan terupdate; item bisa di-SELESAI-kan setelahnya.
- Cetak SPK → sub-baris komponen + info roll muncul.
- Regresi: jual barang berdimensi murni & barang rakitan non-dimensi → perilaku lama tetap benar.

- [ ] **Step 3: Commit perbaikan bila ada**

```bash
git add -A
git commit -m "fix(spk): perbaikan hasil tinjauan roll komponen rakitan"
```

---

## Self-Review

**Spec coverage:**
- Migrasi `parent_item_produksi_id` (3 tempat) → Task 1. ✅
- Baris anak saat checkout + penahanan stok → Task 2. ✅
- `deductBomComponents` skip berdimensi (dobel-potong) → Task 3. ✅
- Resolver + konsumsi roll-aligned untuk komponen → Task 4. ✅
- HPP sinkron ke item_penjualan induk → Task 5. ✅
- Guard SELESAI → Task 6. ✅
- Query grouping induk-anak → Task 7. ✅
- UI detail SPK sub-baris + konfirmasi → Task 8. ✅
- Cetak SPK sub-baris → Task 9. ✅
- Verifikasi + manual + regresi → Task 10. ✅
- Hanya penjualan baru: dijamin oleh `parent_item_produksi_id` nullable + baris anak hanya dibuat di createSale baru (Task 2). ✅
- Closed-period guard (#7): konsumsi memakai `postInventoryMovement` + jalur `postProductionMaterialConsumption` existing yang sudah bertanggal; bila ada guard periode di jalur itu, ikut otomatis. Task 4 menjaga jalur sama. ✅

**Placeholder scan:** Task 8 mendeskripsikan refactor blok konfirmasi roll tanpa menyalin seluruh JSX existing (blok besar & belum dibaca penuh) — diberi arahan konkret (ekstrak jadi props `targetItemId`/`variants`/`recommended`, render per komponen). Ini satu-satunya bagian non-verbatim; dapat diterima karena implementer harus membaca blok existing yang jadi sumber. Task lain berisi kode lengkap.

**Type consistency:** `resolveProductionConsumptionContext` menambah `isKomponen` (Task 4) — dipakai konsisten di `getRollVariantsForProductionItem` & `postProductionMaterialConsumption`. `komponen_roll` (Task 7) dipakai di Task 8 & 9. `parent_item_produksi_id` konsisten dari Task 1 → 7. `consumptionBarangId` diperkenalkan & dipakai konsisten di Task 4.

## Execution Handoff

Lihat pesan berikut untuk pilihan eksekusi.
