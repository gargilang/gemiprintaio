/**
 * POS/Sales Service
 * Universal API for Point of Sale on Tauri and Web
 *
 * Handles: Sales transactions, Receivables, Stock management, Finance entries
 */

import "server-only";

import {
  db,
  generateId,
  getCurrentTimestamp,
  getServerSupabaseClient,
  isCompositeTransactionAtomic,
} from "../db-unified";
import {
  createMaklonPurchase,
  deleteMaklonPurchasesForSale,
} from "./purchases-service";
import {
  recalculateCashbookIfAvailable,
  resolveOpenPeriodeIdForKeuangan,
} from "./finance-service";
import {
  ID_BARANG_PLACEHOLDER_MAKLON,
  ID_HARGA_PLACEHOLDER_MAKLON,
} from "../barang-placeholder";
import {
  getInventoryMovements,
  postInventoryMovement,
  rebuildInventoryBalance,
  getRollVariants,
} from "./inventory-service";
import { resolveBomForUnitPrice } from "./bom-service";
import { hitungQtyKomponenDimensiM2 } from "../bom-utils";
import { suggestSmallestCoveringRollSize } from "../roll-size-utils";
import { hitungPpn } from "../ppn-helpers";
import { getShopSettings } from "./shop-settings-service";
import { friendlyPgError } from "../pg-error";
import { withDuplicateNumberRetry } from "../retry-utils";
import { computeBomCostPerUnit } from "./bom-service";
import { isDateInClosedPeriod } from "./accounting-periods-service";
import {
  DEFAULT_NOMOR_DATE_FORMAT,
  buildNomorUrut,
  extractNomorSequence,
  formatNomorDatePart,
  normalizeNomorDateFormat,
  sameNomorResetScope,
  type NomorFormat,
  type NomorReset,
} from "../numbering-utils";

// ============================================================================
// TIPE
// ============================================================================

import type {
  Sale,
  SaleItem,
  Receivable,
  POSInitData,
  CreateSaleData,
} from "./pos-queries";

function getTodayJakarta(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Jakarta",
  });
}

function positiveNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isRollInventoryLine(
  material: any,
  item: {
    panjang?: number | null;
    lebar?: number | null;
    recommended_roll_width_m?: number | null;
    selectedRollSize?: number | null;
  },
): boolean {
  return (
    Number(material?.lacak_inventori_status) !== 0 &&
    Number(material?.butuh_dimensi_status) === 1 &&
    (positiveNumber(item.recommended_roll_width_m) > 0 ||
      positiveNumber(item.selectedRollSize) > 0 ||
      (positiveNumber(item.panjang) > 0 && positiveNumber(item.lebar) > 0))
  );
}

async function fallbackAverageCostPerBaseUnit(
  barangId: string,
  hargaSatuanId?: string | null,
): Promise<number> {
  const unitPricesResult = await db.query<any>("harga_barang_satuan", {
    where: { barang_id: barangId },
    orderBy: { column: "urutan_tampilan", ascending: true },
  });
  const rows = unitPricesResult.data || [];
  const preferred = hargaSatuanId
    ? rows.find((r: Record<string, unknown>) => r.id === hargaSatuanId)
    : null;
  const unit =
    preferred ||
    rows.find((r: Record<string, unknown>) => Number(r.default_status) === 1) ||
    rows.find(
      (r: Record<string, unknown>) => Number(r.faktor_konversi) === 1,
    ) ||
    rows[0];
  const factor = positiveNumber(unit?.faktor_konversi) || 1;
  return positiveNumber(unit?.harga_beli) / factor;
}

/** Hitung urutan berikutnya dalam cakupan reset yang sama. */
function resolveNextSequenceFromRows(
  rows: any[],
  options: {
    numberColumn: string;
    dateColumn: string;
    prefix: string;
    format: NomorFormat;
    reset: NomorReset;
    targetDate: string;
    startSeq: number;
  },
): number {
  let maxSeq = 0;
  for (const row of rows) {
    const rowDate = String(row?.[options.dateColumn] || row?.dibuat_pada || "");
    if (!sameNomorResetScope(rowDate, options.targetDate, options.reset)) {
      continue;
    }
    const seq = extractNomorSequence(
      row?.[options.numberColumn],
      options.prefix,
      options.format,
    );
    if (seq && seq > maxSeq) maxSeq = seq;
  }
  return maxSeq > 0 ? maxSeq + 1 : options.startSeq;
}

async function generateInvoiceNumber(tanggal: string): Promise<string> {
  const settings = await getShopSettings();
  const prefix = settings.inv_prefix || "INV";
  const format = (settings.inv_format || "PREFIX-DATE-SEQ") as NomorFormat;
  const reset = (settings.inv_reset || "daily") as NomorReset;
  const dateFormat = normalizeNomorDateFormat(
    settings.inv_date_format || DEFAULT_NOMOR_DATE_FORMAT,
  );
  const padding = settings.inv_padding ?? 3;
  const startSeq = settings.inv_start_seq ?? 1;

  const datePart =
    format === "PREFIX-DATE-SEQ" ? formatNomorDatePart(tanggal, dateFormat) : "";

  const invoiceResult = await db.query("penjualan", {
    orderBy: { column: "dibuat_pada", ascending: false },
  });

  const seq = resolveNextSequenceFromRows(invoiceResult.data || [], {
    numberColumn: "nomor_faktur",
    dateColumn: "tanggal",
    prefix,
    format,
    reset,
    targetDate: tanggal,
    startSeq,
  });

  const seqStr = String(seq).padStart(Math.max(1, padding), "0");
  return buildNomorUrut(prefix, format, datePart, seqStr);
}

/** Preview nomor faktur berikutnya TANPA persist (untuk tombol "Lihat Faktur"). */
export async function previewNextInvoiceNumber(): Promise<string> {
  return generateInvoiceNumber(getTodayJakarta());
}

async function generateSPKNumber(): Promise<string> {
  const settings = await getShopSettings();
  const prefix = settings.spk_prefix || "SPK";
  const format = (settings.spk_format || "PREFIX-SEQ") as NomorFormat;
  const reset = (settings.spk_reset || "never") as NomorReset;
  const dateFormat = normalizeNomorDateFormat(
    settings.spk_date_format || DEFAULT_NOMOR_DATE_FORMAT,
  );
  const padding = settings.spk_padding ?? 4;
  const startSeq = settings.spk_start_seq ?? 1;

  const today = new Date().toISOString().slice(0, 10);
  const datePart =
    format === "PREFIX-DATE-SEQ" ? formatNomorDatePart(today, dateFormat) : "";

  const orderResult = await db.query("order_produksi", {
    orderBy: { column: "dibuat_pada", ascending: false },
  });

  const seq = resolveNextSequenceFromRows(orderResult.data || [], {
    numberColumn: "nomor_spk",
    dateColumn: "dibuat_pada",
    prefix,
    format,
    reset,
    targetDate: today,
    startSeq,
  });

  const seqStr = String(seq).padStart(Math.max(1, padding), "0");
  return buildNomorUrut(prefix, format, datePart, seqStr);
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Ambil data awal halaman POS (pelanggan, barang, penjualan terkini)
 */

// ── Mutations ─────────────────────────────────────────

/**
 * Compensating cleanup untuk createSale di jalur NON-ATOMIK (Supabase-only).
 *
 * Saat `db.transaction()` tidak benar-benar atomik (Vercel/next dev), kegagalan
 * di tengah createSale meninggalkan data parsial. Fungsi ini membatalkan jejak
 * yang mungkin sudah tertulis, dengan urutan aman:
 *   1. Reversal inventori via rebuildInventoryBalance (BUKAN delete mentah —
 *      delete tidak mengembalikan stok/AVCO yang sudah berubah).
 *   2. Hapus entri keuangan ber-token [REF:saleId].
 *   3. Lepas kunci NSFP (TERPAKAI → TERSEDIA) bila sempat terkunci.
 *   4. Hapus header penjualan; FK ON DELETE CASCADE membersihkan
 *      item_penjualan, biaya_tambahan_penjualan, order_produksi → item_produksi
 *      → item_finishing, dan piutang_penjualan.
 *
 * Semua langkah best-effort: kegagalan satu langkah tidak menghentikan langkah
 * lain, dan semua error dicatat agar bisa ditelusuri.
 */
async function compensateFailedSale(params: {
  saleId: string;
  affectedBarangIds: Set<string>;
  nsfp?: {
    tahun?: string | null;
    kode_transaksi?: string | null;
    nomor_seri?: string | null;
  } | null;
}): Promise<void> {
  const { saleId, affectedBarangIds, nsfp } = params;

  // 1. Hapus movement inventori milik penjualan ini, lalu rebuild saldo barang
  //    dari ledger tersisa supaya stok + AVCO kembali konsisten.
  try {
    const movements = await getInventoryMovements({
      source_type: "SALE",
      source_id: saleId,
    });
    for (const mov of movements) {
      try {
        await db.delete("inventory_movements", mov.id);
      } catch (e) {
        console.error("[compensateFailedSale] gagal hapus movement", mov.id, e);
      }
    }
    for (const barangId of affectedBarangIds) {
      try {
        await rebuildInventoryBalance(barangId);
      } catch (e) {
        console.error(
          "[compensateFailedSale] gagal rebuild saldo",
          barangId,
          e,
        );
      }
    }
  } catch (e) {
    console.error("[compensateFailedSale] gagal proses inventori:", e);
  }

  // 2. Hapus entri keuangan ber-token [REF:saleId].
  try {
    const financeRes = await db.query<any>("keuangan", {
      where: { reference_id: saleId },
    });
    const rows = financeRes.data || [];
    for (const row of rows) {
      try {
        await db.delete("keuangan", row.id);
      } catch (e) {
        console.error("[compensateFailedSale] gagal hapus keuangan", row.id, e);
      }
    }
  } catch (e) {
    console.error("[compensateFailedSale] gagal proses keuangan:", e);
  }

  // 3. Lepas kunci NSFP bila sempat terkunci ke penjualan ini.
  if (nsfp?.tahun && nsfp.kode_transaksi && nsfp.nomor_seri) {
    try {
      const nsfpRow = await db.queryOne<any>("nsfp_pool", {
        where: {
          tahun: nsfp.tahun,
          kode_transaksi: nsfp.kode_transaksi,
          nomor_seri: nsfp.nomor_seri,
        },
      });
      if (nsfpRow.data && nsfpRow.data.penjualan_id === saleId) {
        await db.update("nsfp_pool", nsfpRow.data.id, {
          status: "TERSEDIA",
          penjualan_id: null,
          diperbarui_pada: getCurrentTimestamp(),
        });
      }
    } catch (e) {
      console.error("[compensateFailedSale] gagal lepas NSFP:", e);
    }
  }

  // 4. Hapus header penjualan; cascade FK membersihkan baris anak.
  try {
    await db.delete("penjualan", saleId);
  } catch (e) {
    console.error("[compensateFailedSale] gagal hapus header penjualan:", e);
  }
}

/**
 * Buat penjualan dengan retry pada tabrakan nomor faktur (D-I5).
 *
 * generateInvoiceNumber membaca MAX(nomor_faktur) lalu insert tanpa lock, jadi
 * dua kasir bersamaan bisa menghasilkan nomor sama → unique constraint reject.
 * Karena composite mutation kini punya compensating cleanup (jalur non-atomik)
 * dan rollback (jalur atomik), percobaan yang gagal tidak meninggalkan sisa,
 * sehingga aman untuk regenerate nomor & ulang. Maks 3 percobaan.
 *
 * Catatan: solusi paling kuat adalah Postgres sequence / RPC next_invoice_number
 * dengan SELECT … FOR UPDATE (butuh migrasi) — peningkatan masa depan.
 */
export async function createSale(data: CreateSaleData): Promise<{
  id: string;
  nomor_faktur: string;
  spk_number: string;
}> {
  return withDuplicateNumberRetry(() => createSaleAttempt(data), {
    label: "createSale",
  });
}

async function createSaleAttempt(data: CreateSaleData): Promise<{
  id: string;
  nomor_faktur: string;
  spk_number: string;
}> {
  // Hoisted untuk compensating cleanup di jalur non-atomik (Supabase-only).
  let saleIdForCleanup: string | null = null;
  const affectedBarangIds = new Set<string>();
  try {
    // Validasi
    if (!data.items || data.items.length === 0) {
      throw new Error("Items tidak boleh kosong");
    }

    if (!data.total_jumlah || data.total_jumlah <= 0) {
      throw new Error("Total jumlah harus lebih dari 0");
    }

    // Validasi maklon per baris. Tampilkan error sebelum membuka transaksi
    // supaya tidak meninggalkan state parsial.
    //
    // Safeguard C2: vendor + biaya + metode bayar OPSIONAL. Baris maklon tanpa
    // vendor/biaya disimpan sebagai pending (pending_vendor_hpp=1, HPP=0,
    // tanpa PO maklon, tanpa item_produksi) dan dapat direconcile ulang.
    // deskripsi_pekerjaan tetap wajib karena menjadi label pekerjaan di SPK/faktur.
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.tipe_item === "MAKLON") {
        if (!item.deskripsi_pekerjaan?.trim()) {
          throw new Error(
            `Item ${i + 1} (Maklon): deskripsi pekerjaan wajib diisi`,
          );
        }
        // Hanya validasi metode bayar kalau vendor + biaya benar-benar diisi.
        // Pending (vendor/biaya kosong) tidak butuh metode bayar.
        if (
          item.vendor_subkontrak_id &&
          (Number(item.biaya_subkontrak) || 0) > 0
        ) {
          if (
            !item.metode_bayar_vendor ||
            !["CASH", "NET30", "TRANSFER"].includes(item.metode_bayar_vendor)
          ) {
            throw new Error(
              `Item ${i + 1} (Maklon): metode bayar vendor tidak valid (CASH/NET30/TRANSFER)`,
            );
          }
        }
      }
    }

    const requiredStock = new Map<string, number>();
    for (const item of data.items) {
      if (item.tipe_item === "MAKLON" || item.tipe_item === "JASA") continue;
      const materialResult = await db.queryOne("barang", {
        where: { id: item.barang_id },
      });
      if (isRollInventoryLine(materialResult.data, item)) continue;
      const qtyBase = item.jumlah * (positiveNumber(item.faktor_konversi) || 1);
      requiredStock.set(
        item.barang_id,
        (requiredStock.get(item.barang_id) || 0) + qtyBase,
      );
    }
    for (const [barangId, requiredQty] of requiredStock) {
      const materialResult = await db.queryOne("barang", {
        where: { id: barangId },
      });
      const material = materialResult.data;
      if (material && material.lacak_inventori_status) {
        const available = Number(material.jumlah_stok || 0);
        if (available < requiredQty) {
          throw new Error(
            `Stok tidak cukup untuk ${material.nama || "barang ini"}. Stok tersedia ${available.toLocaleString(
              "id-ID",
            )}, dibutuhkan ${requiredQty.toLocaleString("id-ID")}.`,
          );
        }
      }
    }

    const saleId = generateId();
    saleIdForCleanup = saleId;
    const tanggalSale = data.tanggal || getTodayJakarta();
    const invoiceNumber = await generateInvoiceNumber(tanggalSale);

    // Tentukan status pembayaran
    const actualPaid = data.jumlah_dibayar || 0;
    const isFullPaymentMethod = ["CASH", "TRANSFER", "QRIS", "DEBIT"].includes(
      data.metode_pembayaran,
    );
    const isLunas = isFullPaymentMethod && actualPaid >= data.total_jumlah;
    const isPiutang =
      ["DOWN_PAYMENT", "NET30"].includes(data.metode_pembayaran) ||
      (isFullPaymentMethod && actualPaid < data.total_jumlah && actualPaid > 0);

    let totalHpp = 0;

    // PPN keluaran setup
    const kenaPpn = data.kena_ppn ? 1 : 0;
    const ppnPersen = kenaPpn === 1 ? Number(data.ppn_persen || 0) : 0;
    const ppnMetode: "EKSKLUSIF" | "INKLUSIF" =
      data.ppn_metode === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF";
    const ppnHeaderBreakdown =
      kenaPpn === 1 && ppnPersen > 0
        ? hitungPpn(data.total_jumlah, ppnPersen, ppnMetode)
        : { dpp: data.total_jumlah, ppn: 0, total: data.total_jumlah };

    if (kenaPpn === 1) {
      if (
        !data.nsfp_kode_transaksi ||
        !data.nsfp_tahun ||
        !data.nsfp_nomor_seri
      ) {
        throw new Error(
          "Faktur kena PPN wajib menyertakan NSFP (Nomor Seri Faktur Pajak) lengkap",
        );
      }
    }

    // Lacak id item maklon yang sudah disisipkan supaya bisa update pembelian_id_terkait
    // setelah auto-PO dibuat. Key-nya adalah indeks item di payload request asal.
    const maklonItemIds = new Map<number, string>();

    // Resolve periode_id untuk penjualan (sama seperti keuangan).
    const salePeriodeId = await resolveOpenPeriodeIdForKeuangan();

    // Eksekusi di dalam transaksi
    const saleResultPayload = await db.transaction(async () => {
      // Buat record penjualan
      const sale = {
        id: saleId,
        nomor_faktur: invoiceNumber,
        pelanggan_id: data.pelanggan_id || null,
        pelanggan_nama_snapshot: data.pelanggan_nama_snapshot?.trim() || null,
        pelanggan_kota: data.pelanggan_kota?.trim() || null,
        total_jumlah: data.total_jumlah,
        jumlah_dibayar: actualPaid,
        jumlah_kembalian: data.jumlah_kembalian || 0,
        metode_pembayaran: data.metode_pembayaran,
        kasir_id: data.kasir_id || null,
        catatan: data.catatan?.trim() || null,
        biaya_tambahan_total: (() => {
          const perItem = (data.items || []).flatMap(
            (it: any) => it.biaya_tambahan || [],
          );
          const source =
            perItem.length > 0 ? perItem : data.biaya_tambahan || [];
          return source.reduce((sum, b) => sum + (Number(b.nominal) || 0), 0);
        })(),
        // PPN keluaran
        kena_ppn: kenaPpn,
        ppn_persen: ppnPersen,
        ppn_metode: ppnMetode,
        dpp_total: ppnHeaderBreakdown.dpp,
        ppn_total: ppnHeaderBreakdown.ppn,
        nsfp_kode_transaksi:
          kenaPpn === 1 ? data.nsfp_kode_transaksi || null : null,
        nsfp_tahun: kenaPpn === 1 ? data.nsfp_tahun || null : null,
        nsfp_nomor_seri: kenaPpn === 1 ? data.nsfp_nomor_seri || null : null,
        tanggal_faktur_pajak:
          kenaPpn === 1 ? data.tanggal_faktur_pajak || tanggalSale : null,
        pelanggan_npwp_snapshot: data.pelanggan_npwp_snapshot || null,
        pelanggan_alamat_npwp_snapshot:
          data.pelanggan_alamat_npwp_snapshot || null,
        pelanggan_nama_npwp_snapshot: data.pelanggan_nama_npwp_snapshot || null,
        periode_id: salePeriodeId,
      };

      const saleResult = await db.insert("penjualan", sale);
      if (saleResult.error) throw saleResult.error;

      // Lock NSFP slot kalau dipakai (status TERSEDIA → TERPAKAI). Lakukan
      // sebelum insert items supaya gagal-tertentu di NSFP rollback semua.
      if (
        kenaPpn === 1 &&
        data.nsfp_tahun &&
        data.nsfp_kode_transaksi &&
        data.nsfp_nomor_seri
      ) {
        const nsfpRow = await db.queryOne<any>("nsfp_pool", {
          where: {
            tahun: data.nsfp_tahun,
            kode_transaksi: data.nsfp_kode_transaksi,
            nomor_seri: data.nsfp_nomor_seri,
          },
        });
        if (!nsfpRow.data) {
          throw new Error(
            `NSFP ${data.nsfp_kode_transaksi}.${data.nsfp_tahun}.${data.nsfp_nomor_seri} tidak ditemukan di pool. Impor dulu dari Coretax.`,
          );
        }
        if (nsfpRow.data.status !== "TERSEDIA") {
          throw new Error(
            `NSFP ${data.nsfp_kode_transaksi}.${data.nsfp_tahun}.${data.nsfp_nomor_seri} sudah ${nsfpRow.data.status}. Pilih nomor lain.`,
          );
        }
        const upd = await db.update("nsfp_pool", nsfpRow.data.id, {
          status: "TERPAKAI",
          penjualan_id: saleId,
          diperbarui_pada: getCurrentTimestamp(),
        });
        if (upd.error) throw upd.error;
      }

      // Sisipkan baris penjualan dan perbarui stok.
      // Simpan ID tiap item_penjualan per indeks supaya loop produksi memakai
      // ID yang tepat (D-I1) — JANGAN re-query by timestamp offset karena
      // timestamp bisa kembar dan menyebabkan finishing terpasang ke item salah.
      const insertedItemIds: string[] = [];
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const itemId = generateId();
        const isMaklon = item.tipe_item === "MAKLON";
        const isJasa = item.tipe_item === "JASA";
        // Safeguard C2: maklon tanpa vendor/biaya → pending (HPP=0, no PO, no SPK item).
        const isPendingMaklon =
          isMaklon &&
          (!item.vendor_subkontrak_id ||
            !item.biaya_subkontrak ||
            Number(item.biaya_subkontrak) <= 0);

        // BARANG: HPP berasal dari biaya rata-rata bergerak barang.
        // MAKLON: HPP = biaya_subkontrak (yang dibayar ke percetakan rekanan).
        //   Pending maklon (tanpa vendor/biaya) → HPP=0; baru dicatat saat reconcile.
        // JASA: HPP = 0 (tidak ada barang dasar; murni margin).
        let hppSatuan = 0;
        let hppTotal = 0;
        let material: any = null;
        if (isMaklon) {
          if (isPendingMaklon) {
            hppSatuan = 0;
            hppTotal = 0;
          } else {
            // biaya_subkontrak dari POS = harga PER LEMBAR (dari katalog),
            // jadi HPP total = biaya per lembar × jumlah lembar.
            const biayaPerLbr = Number(item.biaya_subkontrak) || 0;
            hppSatuan = biayaPerLbr;
            hppTotal = biayaPerLbr * (item.jumlah > 0 ? item.jumlah : 1);
          }
        } else if (isJasa) {
          hppSatuan = 0;
          hppTotal = 0;
        } else {
          const materialResult = await db.queryOne("barang", {
            where: { id: item.barang_id },
          });
          material = materialResult.data;
          const averageCostPerBaseUnit =
            positiveNumber(material?.average_cost_per_base_unit) ||
            (await fallbackAverageCostPerBaseUnit(
              item.barang_id,
              item.harga_satuan_id,
            ));
          const baseHppSatuan =
            averageCostPerBaseUnit *
            (positiveNumber(item.faktor_konversi) || 1);
          // B2.f: tambah biaya BOM per unit produk jual. Kegagalan helper
          // ditoleransi (bomCostPerUnit = 0) supaya checkout tidak gagal.
          let bomCostPerUnit = 0;
          try {
            bomCostPerUnit = await computeBomCostPerUnit(
              item.barang_id,
              item.harga_satuan_id,
            );
          } catch (e) {
            console.warn(
              `[HPP BOM] Gagal hitung BOM untuk barang ${item.barang_id}:`,
              e,
            );
          }
          hppSatuan = baseHppSatuan + bomCostPerUnit;
          hppTotal = hppSatuan * item.jumlah;
        }
        const recommendedRollWidth =
          positiveNumber(item.recommended_roll_width_m) ||
          positiveNumber(item.selectedRollSize) ||
          null;
        const rollInventoryDeferred =
          !isMaklon &&
          !isJasa &&
          isRollInventoryLine(material, {
            ...item,
            recommended_roll_width_m: recommendedRollWidth,
          });
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

        const grossProfit = item.subtotal - hppTotal;
        const grossMargin =
          item.subtotal > 0 ? (grossProfit / item.subtotal) * 100 : 0;
        // HPP baris maklon TIDAK dimasukkan ke agregat kas "HPP" — biaya
        // subkontrak dicatat sekali saja via createMaklonPurchase (baris
        // "MAKLON"/hutang vendor). Memasukkannya di sini menyebabkan saldo
        // terpotong dua kali. hpp_total per item tetap disimpan (untuk margin).
        if (!isMaklon) {
          // Kurangi modal biaya tambahan dari agregat kas HPP: modal diposting
          // terpisah sebagai kategori BIAYA, jadi tidak boleh dobel di sini.
          totalHpp += hppTotal - modalBiayaItem;
        }

        // Per-line PPN breakdown (kalau header kena_ppn=1)
        const lineBreakdown =
          kenaPpn === 1 && ppnPersen > 0
            ? hitungPpn(item.subtotal, ppnPersen, ppnMetode)
            : { dpp: item.subtotal, ppn: 0, total: item.subtotal };
        const lineDppSatuan =
          item.jumlah !== 0 ? lineBreakdown.dpp / item.jumlah : 0;
        const linePpnSatuan =
          item.jumlah !== 0 ? lineBreakdown.ppn / item.jumlah : 0;

        const saleItem = {
          id: itemId,
          penjualan_id: saleId,
          // Baris maklon memakai barang placeholder yang sudah di-seed agar FK valid
          // tanpa memasukkan baris stok palsu di katalog.
          barang_id: isMaklon ? ID_BARANG_PLACEHOLDER_MAKLON : item.barang_id,
          harga_satuan_id: isMaklon
            ? ID_HARGA_PLACEHOLDER_MAKLON
            : item.harga_satuan_id || null,
          jumlah: item.jumlah,
          nama_satuan: item.nama_satuan,
          nama_produk_jual: item.nama_produk_jual?.trim() || null,
          faktor_konversi: item.faktor_konversi,
          harga_satuan: item.harga_satuan,
          subtotal: item.subtotal,
          hpp_satuan: hppSatuan,
          hpp_total: hppTotal,
          gross_profit: grossProfit,
          gross_margin: grossMargin,
          panjang: item.panjang ?? null,
          lebar: item.lebar ?? null,
          billed_panjang: item.billed_panjang ?? null,
          billed_lebar: item.billed_lebar ?? null,
          recommended_roll_width_m: recommendedRollWidth,
          roll_inventory_deferred: rollInventoryDeferred ? 1 : 0,
          tipe_item: item.tipe_item || "BARANG",
          vendor_subkontrak_id: isMaklon ? item.vendor_subkontrak_id : null,
          biaya_subkontrak: isMaklon ? item.biaya_subkontrak : null,
          metode_bayar_vendor: isMaklon ? item.metode_bayar_vendor : null,
          pembelian_id_terkait: null,
          deskripsi_pekerjaan: item.deskripsi_pekerjaan?.trim() || null,
          // Safeguard C2: tandai baris maklon pending + simpan asal katalog_maklon.
          pending_vendor_hpp: isPendingMaklon ? 1 : 0,
          katalog_maklon_id: isMaklon ? item.katalog_maklon_id || null : null,
          catatan_item: (item as any).catatan_item?.trim() || null,
          // Info nesting roll (saran billing/SPK) — nullable untuk data lama.
          roll_items_per_row: (item as any).roll_items_per_row ?? null,
          roll_rows: (item as any).roll_rows ?? null,
          roll_panjang_total_m: (item as any).roll_panjang_total_m ?? null,
          dpp_satuan: lineDppSatuan,
          ppn_satuan: linePpnSatuan,
          dpp_total: lineBreakdown.dpp,
          ppn_total: lineBreakdown.ppn,
        };

        const itemResult = await db.insert("item_penjualan", saleItem);
        if (itemResult.error) throw itemResult.error;
        insertedItemIds[i] = itemId;

        if (isMaklon) {
          maklonItemIds.set(i, itemId);
          // Baris maklon tidak pernah menyentuh stok atau frekuensi terjual
          // — karena tidak ada barang dasar di katalog kita.
        } else if (
          material &&
          material.lacak_inventori_status &&
          !rollInventoryDeferred
        ) {
          const stockReduction = item.jumlah * item.faktor_konversi;
          affectedBarangIds.add(item.barang_id);
          await postInventoryMovement({
            id: `mov-${itemId}`,
            barang_id: item.barang_id,
            tanggal: tanggalSale,
            movement_type: "SALE_ISSUE",
            qty_delta: -stockReduction,
            unit_cost:
              positiveNumber(material.average_cost_per_base_unit) ||
              hppSatuan / (positiveNumber(item.faktor_konversi) || 1),
            source_type: "SALE",
            source_id: saleId,
            source_line_id: itemId,
            catatan: `Penjualan ${invoiceNumber}`,
            dibuat_oleh: data.kasir_id || null,
          });
          await db.update("barang", item.barang_id, {
            frekuensi_terjual: (material.frekuensi_terjual || 0) + 1,
          });
        } else if (material) {
          // Inventori non-tracked (lacak_inventori_status=0): cukup naikkan
          // popularitas supaya grid barang POS berurut benar.
          await db.update("barang", item.barang_id, {
            frekuensi_terjual: (material.frekuensi_terjual || 0) + 1,
          });
        }
      }

      // Sisipkan baris biaya tambahan (ongkir, biaya pasang, dll). Lewati baris
      // dengan label kosong atau nominal 0. Preferensi: biaya per-item
      // (data.items[i].biaya_tambahan) ditautkan ke item_penjualan_id supaya
      // reprint struk/faktur/SPK bisa menampilkannya sebagai sub-baris item.
      // Fallback ke biaya header (data.biaya_tambahan) untuk klien legacy yang
      // belum mengirim per-item — biaya ini tidak ditautkan (item_penjualan_id null).
      const perItemBiaya = (data.items || []).flatMap((it: any, i: number) =>
        ((it as any).biaya_tambahan || []).map((b: any) => ({
          label: String(b.label || "").trim(),
          nominal: Number(b.nominal) || 0,
          modal: Number(b.modal) || 0,
          item_index: i,
        })),
      );
      const flatBiaya = (data.biaya_tambahan || []).map((b: any) => ({
        label: String(b.label || "").trim(),
        nominal: Number(b.nominal) || 0,
        modal: Number(b.modal) || 0,
      }));
      if (perItemBiaya.length > 0) {
        let urutan = 0;
        for (const b of perItemBiaya) {
          if (!b.label || b.nominal <= 0) continue;
          const itemId = insertedItemIds[b.item_index];
          if (!itemId) continue;
          const r = await db.insert("biaya_tambahan_penjualan", {
            id: generateId(),
            penjualan_id: saleId,
            item_penjualan_id: itemId,
            label: b.label,
            nominal: b.nominal,
            modal: Math.min(Number(b.modal) || 0, Number(b.nominal) || 0),
            urutan: urutan++,
          });
          if (r.error) throw r.error;
        }
      } else if (flatBiaya.length > 0) {
        for (let i = 0; i < flatBiaya.length; i++) {
          const b = flatBiaya[i];
          if (!b.label || b.nominal <= 0) continue;
          const r = await db.insert("biaya_tambahan_penjualan", {
            id: generateId(),
            penjualan_id: saleId,
            item_penjualan_id: null,
            label: b.label,
            nominal: b.nominal,
            modal: Math.min(Number(b.modal) || 0, Number(b.nominal) || 0),
            urutan: i,
          });
          if (r.error) throw r.error;
        }
      }

      // Buat entri keuangan kalau LUNAS
      if (isLunas) {
        await createFinanceEntry({
          tanggal: tanggalSale,
          kategori_transaksi: "OMZET",
          debit: data.total_jumlah,
          keperluan: await buildKeperluan(
            invoiceNumber,
            data.pelanggan_id,
            data.catatan,
            saleId,
          ),
          omzet: data.total_jumlah,
          catatan: data.catatan,
          dibuat_oleh: data.kasir_id,
          reference_type: "SALE",
          reference_id: saleId,
        });
      }

      if (totalHpp > 0) {
        await createFinanceEntry({
          tanggal: tanggalSale,
          kategori_transaksi: "HPP",
          debit: 0,
          kredit: totalHpp,
          keperluan: `HPP ${invoiceNumber} [REF:${saleId}]`,
          omzet: 0,
          biaya_bahan: totalHpp,
          catatan: data.catatan,
          dibuat_oleh: data.kasir_id,
          reference_type: "SALE_HPP",
          reference_id: saleId,
        });
      }

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
          biaya_operasional: totalModalBiaya,
          catatan: data.catatan,
          dibuat_oleh: data.kasir_id,
          reference_type: "SALE_EXTRA_COST",
          reference_id: saleId,
        });
      }

      // Buat piutang kalau perlu
      if (isPiutang) {
        const piutangId = generateId();
        const jatuhTempo =
          data.metode_pembayaran === "NET30"
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0]
            : null;

        const jumlahTerbayar = actualPaid;
        const sisaPiutang = data.total_jumlah - jumlahTerbayar;

        let statusPiutang: "AKTIF" | "SEBAGIAN" = "AKTIF";
        let catatanPiutang = "";

        if (data.metode_pembayaran === "NET30") {
          catatanPiutang = "Piutang dengan jatuh tempo 30 hari";
        } else if (data.metode_pembayaran === "DOWN_PAYMENT") {
          catatanPiutang = "Down Payment - pembayaran sebagian";
          if (sisaPiutang > 0 && jumlahTerbayar > 0) {
            statusPiutang = "SEBAGIAN";
          }
        } else {
          catatanPiutang = `Pembayaran ${data.metode_pembayaran} tidak mencukupi`;
          if (sisaPiutang > 0 && jumlahTerbayar > 0) {
            statusPiutang = "SEBAGIAN";
          }
        }

        const piutang = {
          id: piutangId,
          id_penjualan: saleId,
          jumlah_piutang: data.total_jumlah,
          jumlah_terbayar: jumlahTerbayar,
          sisa_piutang: sisaPiutang,
          jatuh_tempo: jatuhTempo,
          status: statusPiutang,
          catatan: catatanPiutang,
        };

        const piutangResult = await db.insert("piutang_penjualan", piutang);
        if (piutangResult.error) throw piutangResult.error;

        // Kalau ada pembayaran sebagian, catat di keuangan
        if (jumlahTerbayar > 0) {
          await createFinanceEntry({
            tanggal: tanggalSale,
            kategori_transaksi: "PIUTANG",
            debit: jumlahTerbayar,
            keperluan: await buildPiutangKeperluan(
              invoiceNumber,
              data.pelanggan_id,
              data.metode_pembayaran,
              jumlahTerbayar,
              data.total_jumlah,
              saleId,
            ),
            omzet: jumlahTerbayar,
            catatan: data.catatan,
            dibuat_oleh: data.kasir_id,
            reference_type: "SALE_RECEIVABLE_DP",
            reference_id: saleId,
          });
        }
      }

      // Buat order produksi
      const spkNumber = await generateSPKNumber();
      const orderId = `OP-${Date.now()}`;

      const customerResult = data.pelanggan_id
        ? await db.queryOne("pelanggan", { where: { id: data.pelanggan_id } })
        : { data: null };

      const productionOrder = {
        id: orderId,
        penjualan_id: saleId,
        nomor_spk: spkNumber,
        pelanggan_nama:
          customerResult.data?.nama || data.pelanggan_nama_snapshot || null,
        total_item: data.items.length,
        status: "MENUNGGU" as const,
        prioritas: data.prioritas || ("NORMAL" as const),
        catatan: data.catatan?.trim() || null,
        dibuat_oleh: data.kasir_id || null,
      };

      const orderResult = await db.insert("order_produksi", productionOrder);
      if (orderResult.error) throw orderResult.error;

      // Buat item produksi
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const isMaklon = item.tipe_item === "MAKLON";
        // Catatan: maklon pending (tanpa vendor/biaya) TETAP dibuatkan
        // item_produksi supaya kerjaan langsung muncul di SPK sejak checkout.
        // Penjualannya belum masuk keuangan (pending_vendor_hpp=1, HPP=0) sampai
        // vendor/HPP di-reconcile di halaman Katalog Extra — tapi operator sudah
        // bisa melihat kerjaan yang masuk. Reconcile bersifat idempoten
        // (createProductionItemForReconciledMaklon), jadi tidak ada duplikat.

        // Ambil item_penjualan via ID yang sudah ditangkap saat insert (D-I1).
        // Pakai ID eksplisit, BUKAN offset+orderBy dibuat_pada — timestamp bisa
        // kembar untuk insert beruntun sehingga item ke-i bisa salah ambil dan
        // finishing/SPK terpasang ke item yang keliru.
        const itemPenjualanId = insertedItemIds[i];
        const itemPenjualanResult = itemPenjualanId
          ? await db.query("item_penjualan", {
              where: { id: itemPenjualanId },
              limit: 1,
            })
          : { data: [] as any[] };

        if (itemPenjualanResult.data && itemPenjualanResult.data.length > 0) {
          const itemPenjualan = itemPenjualanResult.data[0];
          const itemProdId = `IP-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;

          // Untuk baris maklon kita pakai deskripsi_pekerjaan sebagai nama item
          // produksi (deskripsi bebas pekerjaan, bukan item katalog).
          // Untuk BARANG/JASA kita lookup nama barang seperti biasa.
          let barangNama = "Unknown";
          if (isMaklon) {
            barangNama = item.deskripsi_pekerjaan?.trim()
              ? `[MAKLON] ${item.deskripsi_pekerjaan.trim()}`
              : "[MAKLON] Pekerjaan subkontrak";
          } else {
            const materialResult = await db.queryOne("barang", {
              where: { id: item.barang_id },
            });
            barangNama = materialResult.data?.nama || "Unknown";
          }

          const productionItem = {
            id: itemProdId,
            order_produksi_id: orderId,
            item_penjualan_id: itemPenjualan.id,
            barang_id: isMaklon ? null : itemPenjualan.barang_id,
            barang_nama: barangNama,
            jumlah: item.jumlah,
            nama_satuan: item.nama_satuan,
            panjang: item.panjang || null,
            lebar: item.lebar || null,
            billed_panjang: item.billed_panjang ?? null,
            billed_lebar: item.billed_lebar ?? null,
            recommended_roll_width_m:
              (itemPenjualan as any).recommended_roll_width_m ?? null,
            roll_inventory_status:
              (itemPenjualan as any).roll_inventory_deferred === 1
                ? "PENDING"
                : "NOT_REQUIRED",
            status: "MENUNGGU" as const,
          };

          const prodItemResult = await db.insert(
            "item_produksi",
            productionItem,
          );
          if (prodItemResult.error) throw prodItemResult.error;

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

          // Buat item finishing kalau ada
          if (item.finishing && item.finishing.length > 0) {
            for (const fin of item.finishing) {
              const finId = `FIN-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 9)}`;

              const finishingItem = {
                id: finId,
                item_produksi_id: itemProdId,
                jenis_finishing: fin.jenis_finishing,
                keterangan: fin.keterangan?.trim() || null,
                status: "MENUNGGU" as const,
              };

              const finResult = await db.insert(
                "item_finishing",
                finishingItem,
              );
              if (finResult.error) throw finResult.error;
            }
          }
        }
      }

      return {
        id: saleId,
        nomor_faktur: invoiceNumber,
        spk_number: spkNumber,
      };
    });

    // Maklon: otomatis buat PO vendor untuk baris maklon di penjualan ini.
    // Dilakukan DI LUAR transaksi penjualan utama supaya:
    //   1. Tiap PO maklon jalan di db.transaction-nya sendiri (rollback lebih bersih).
    //   2. Kegagalan di sini tidak rollback penjualan ke pelanggan, yang
    //      adalah hal utama yang dipedulikan kasir. Error tetap dicatat dan
    //      ditampilkan via payload yang dikembalikan, tapi penjualan tetap commit.
    if (maklonItemIds.size > 0) {
      // Kelompokkan item maklon berdasarkan (vendor_subkontrak_id, metode_bayar_vendor).
      // Satu PO per grup: vendor sama + metode bayar sama = satu faktur dari sisi vendor.
      // Beda metode bayar ke vendor yang sama dipecah jadi PO berbeda karena
      // bentuk pembukuannya beda (CASH masuk keuangan, NET30 masuk hutang_pembelian).
      type GroupKey = string;
      const groups = new Map<
        GroupKey,
        {
          vendorId: string;
          metodeBayar: "CASH" | "NET30" | "TRANSFER";
          items: Array<{
            itemIndex: number;
            saleItemId: string;
            deskripsi_pekerjaan: string;
            jumlah: number;
            biaya_subkontrak: number;
          }>;
        }
      >();

      for (const [idx, saleItemId] of maklonItemIds) {
        const it = data.items[idx];
        // Safeguard C2: skip pending maklon — PO vendor dibuat saat reconcile (Task 5).
        const isPending =
          !it.vendor_subkontrak_id ||
          !it.biaya_subkontrak ||
          Number(it.biaya_subkontrak) <= 0;
        if (isPending) continue;
        const key = `${it.vendor_subkontrak_id}::${it.metode_bayar_vendor}`;
        if (!groups.has(key)) {
          groups.set(key, {
            vendorId: it.vendor_subkontrak_id!,
            metodeBayar: it.metode_bayar_vendor as
              | "CASH"
              | "NET30"
              | "TRANSFER",
            items: [],
          });
        }
        groups.get(key)!.items.push({
          itemIndex: idx,
          saleItemId,
          deskripsi_pekerjaan: (it.deskripsi_pekerjaan || "").trim(),
          jumlah: it.jumlah,
          // biaya_subkontrak dari POS = PER LEMBAR; createMaklonPurchase
          // memperlakukan angka ini sebagai TOTAL, jadi kalikan dengan jumlah.
          biaya_subkontrak:
            (Number(it.biaya_subkontrak) || 0) * (it.jumlah > 0 ? it.jumlah : 1),
        });
      }

      for (const group of groups.values()) {
        try {
          const { id: pembelianId } = await createMaklonPurchase({
            saleId,
            saleInvoiceNumber: invoiceNumber,
            vendorId: group.vendorId,
            metodeBayar: group.metodeBayar,
            tanggal: tanggalSale,
            catatan: data.catatan,
            dibuatOleh: data.kasir_id || null,
            items: group.items.map((g) => ({
              deskripsi_pekerjaan: g.deskripsi_pekerjaan,
              jumlah: g.jumlah,
              biaya_subkontrak: g.biaya_subkontrak,
            })),
          });
          // Tautkan kembali tiap baris penjualan maklon ke PO yang memenuhinya.
          for (const g of group.items) {
            await db.update("item_penjualan", g.saleItemId, {
              pembelian_id_terkait: pembelianId,
            });
          }
        } catch (err) {
          console.error(
            "[createSale] createMaklonPurchase failed for vendor",
            group.vendorId,
            err,
          );
          // Tampilkan tapi jangan throw — penjualan sendiri sudah commit.
        }
      }
    }

    await recalculateCashbookIfAvailable();
    return saleResultPayload;
  } catch (error: any) {
    console.error("Error creating sale:", error);
    // Di jalur NON-ATOMIK (Supabase-only), db.transaction() tidak rollback.
    // Jalankan compensating cleanup supaya tidak meninggalkan penjualan parsial
    // (header tanpa item, NSFP hangus, dll). Di jalur atomik (Tauri/SQLite),
    // transaksi sudah otomatis rollback jadi cleanup tidak diperlukan.
    if (saleIdForCleanup) {
      try {
        const atomic = await isCompositeTransactionAtomic();
        if (!atomic) {
          await compensateFailedSale({
            saleId: saleIdForCleanup,
            affectedBarangIds,
            nsfp: {
              tahun: data.nsfp_tahun,
              kode_transaksi: data.nsfp_kode_transaksi,
              nomor_seri: data.nsfp_nomor_seri,
            },
          });
        }
      } catch (cleanupErr) {
        console.error(
          "[createSale] compensating cleanup gagal (data mungkin perlu diperiksa manual):",
          cleanupErr,
        );
      }
    }
    throw error;
  }
}

/**
 * Hapus penjualan (kembalikan stok dan keuangan).
 *
 * Pola pembersihan best-effort: tiap langkah dibungkus terpisah supaya
 * satu langkah gagal tidak membatalkan langkah lain. Baris penjualan itu
 * sendiri dihapus terakhir — kalau langkah lain berhasil walau sebagian,
 * penjualan tetap dihapus supaya tidak muncul lagi di riwayat. Kegagalan
 * dikumpulkan dan ditampilkan via error yang dilempar supaya pengguna tahu
 * persis apa yang ter-orphan.
 *
 * Untuk transaksi atomik penuh lintas langkah, migrasikan ke fungsi RPC
 * Postgres (lihat roadmap di docs repo).
 */
export async function voidSale(
  id: string,
  reason = "Penjualan dibatalkan",
  actorId?: string | null,
): Promise<boolean> {
  const sb =
    process.env.TAURI === "true" || process.env.TAURI === "1"
      ? null
      : getServerSupabaseClient();
  if (sb) {
    const { error } = await sb.rpc("void_sale_with_inventory", {
      sale_id: id,
      reason,
      actor_id: actorId || null,
    });
    if (error) {
      throw new Error(friendlyPgError(error, "penjualan"));
    }
    try {
      await deleteMaklonPurchasesForSale(id);
    } catch (err) {
      console.warn("[voidSale] failed to void linked maklon purchases:", err);
    }
    await recalculateCashbookIfAvailable();
    return true;
  }

  const saleResult = await db.queryOne<any>("penjualan", { where: { id } });
  if (saleResult.error) throw saleResult.error;
  const sale = saleResult.data;
  if (!sale) {
    throw new Error("Transaksi tidak ditemukan");
  }
  if (sale.status_transaksi === "VOIDED") {
    throw new Error("Transaksi sudah dibatalkan");
  }

  // Cek status produksi — kalau SPK sudah PROSES atau SELESAI, void tidak
  // diizinkan karena barang sudah dikerjakan. Tampilkan nomor SPK spesifik.
  const prodResult = await db.query<any>("order_produksi", {
    where: { penjualan_id: id },
  });
  if (!prodResult.error) {
    const activeOrders = (prodResult.data || []).filter(
      (o: any) =>
        o.status === "PROSES" ||
        o.status === "SELESAI" ||
        o.status === "PRINTING" ||
        o.status === "FINISHING",
    );
    if (activeOrders.length > 0) {
      const spkList = activeOrders
        .map((o: Record<string, unknown>) => {
          const status = o.status;
          return `${o.nomor_spk} (${status})`;
        })
        .join(", ");
      throw new Error(
        `Tidak bisa dibatalkan. Penjualan ini sudah masuk produksi: ${spkList}. ` +
          `Batalkan atau selesaikan SPK tersebut dulu sebelum membatalkan penjualan.`,
      );
    }
  }

  const piutangResult = await db.query<any>("piutang_penjualan", {
    where: { id_penjualan: id },
  });
  if (piutangResult.error) throw piutangResult.error;

  for (const piutang of piutangResult.data || []) {
    const paymentsResult = await db.query("pelunasan_piutang", {
      where: { id_piutang: piutang.id },
    });
    if (paymentsResult.error) throw paymentsResult.error;
    if ((paymentsResult.data || []).length > 0) {
      throw new Error(
        "Penjualan sudah memiliki pelunasan piutang. Revert pembayaran dulu sebelum membatalkan transaksi.",
      );
    }
  }

  await db.transaction(async () => {
    const itemsResult = await db.query<any>("item_penjualan", {
      where: { penjualan_id: id },
    });
    if (itemsResult.error) throw itemsResult.error;
    const movements = await getInventoryMovements({
      source_type: "SALE",
      source_id: id,
    });

    for (const item of itemsResult.data || []) {
      if (item.tipe_item === "MAKLON" || item.tipe_item === "JASA") {
        continue;
      }
      const original = movements.find(
        (m) => m.source_line_id === item.id && m.movement_type === "SALE_ISSUE",
      );
      const qtyBase =
        original?.qty_delta != null
          ? Math.abs(Number(original.qty_delta))
          : Number(item.jumlah || 0) *
            (positiveNumber(item.faktor_konversi) || 1);
      const unitCost =
        positiveNumber(original?.unit_cost) ||
        positiveNumber(item.hpp_satuan) /
          (positiveNumber(item.faktor_konversi) || 1);

      await postInventoryMovement({
        id: original ? `void-${original.id}` : `void-${item.id}`,
        barang_id: item.barang_id,
        tanggal: new Date().toISOString().split("T")[0],
        movement_type: "SALE_VOID",
        qty_delta: qtyBase,
        unit_cost: unitCost,
        source_type: "SALE_VOID",
        source_id: id,
        source_line_id: item.id,
        reversal_of_id: original?.id || null,
        catatan: reason,
        dibuat_oleh: actorId || null,
      });
    }

    const financeResult = await db.query<any>("keuangan");
    if (financeResult.error) throw financeResult.error;
    for (const entry of financeResult.data || []) {
      if (!entry.keperluan?.includes(`[REF:${id}]`)) continue;
      const upd = await db.update("keuangan", entry.id, {
        status_transaksi: "VOIDED",
        voided_at: getCurrentTimestamp(),
        voided_by: actorId || null,
        void_reason: reason,
        diperbarui_pada: getCurrentTimestamp(),
      });
      if (upd.error) throw upd.error;
    }

    for (const piutang of piutangResult.data || []) {
      const upd = await db.update("piutang_penjualan", piutang.id, {
        jumlah_terbayar: 0,
        sisa_piutang: 0,
        status: "LUNAS",
        catatan: `${piutang.catatan || ""} (Penjualan dibatalkan)`.trim(),
        diperbarui_pada: getCurrentTimestamp(),
      });
      if (upd.error) throw upd.error;
    }

    const upd = await db.update("penjualan", id, {
      status_transaksi: "VOIDED",
      voided_at: getCurrentTimestamp(),
      voided_by: actorId || null,
      void_reason: reason,
      diperbarui_pada: getCurrentTimestamp(),
    });
    if (upd.error) throw upd.error;

    // Lepas NSFP yang terkunci ke penjualan ini (TERPAKAI -> TERSEDIA),
    // konsisten dengan compensateFailedSale. Faktur pajak batal => nomor seri
    // bisa dipakai lagi untuk faktur lain.
    const nsfpRows = await db.query<any>("nsfp_pool", {
      where: { penjualan_id: id },
    });
    if (nsfpRows.error) throw nsfpRows.error;
    for (const n of nsfpRows.data || []) {
      if (n.status !== "TERPAKAI") continue;
      const updNsfp = await db.update("nsfp_pool", n.id, {
        status: "TERSEDIA",
        penjualan_id: null,
        diperbarui_pada: getCurrentTimestamp(),
      });
      if (updNsfp.error) throw updNsfp.error;
    }

    // Batalkan SPK (order_produksi) yang dibuat penjualan ini beserta itemnya.
    // Guard di atas sudah menolak void bila ada SPK PROSES/PRINTING/FINISHING/
    // SELESAI, jadi yang tersisa di sini hanya MENUNGGU/DIBATALKAN. Soft-cancel
    // (tandai DIBATALKAN) konsisten dengan soft-void penjualan/keuangan, bukan
    // hard delete — penjualan tidak dihapus jadi FK CASCADE tidak jalan.
    for (const order of prodResult.data || []) {
      if (order.status === "DIBATALKAN" || order.status === "SELESAI") continue;
      const orderItemsResult = await db.query<any>("item_produksi", {
        where: { order_produksi_id: order.id },
      });
      if (orderItemsResult.error) throw orderItemsResult.error;
      for (const prodItem of orderItemsResult.data || []) {
        if (prodItem.status === "DIBATALKAN" || prodItem.status === "SELESAI") {
          continue;
        }
        const itemUpd = await db.update("item_produksi", prodItem.id, {
          status: "DIBATALKAN",
          diperbarui_pada: getCurrentTimestamp(),
        });
        if (itemUpd.error) throw itemUpd.error;
      }
      const orderUpd = await db.update("order_produksi", order.id, {
        status: "DIBATALKAN",
        diperbarui_pada: getCurrentTimestamp(),
      });
      if (orderUpd.error) throw orderUpd.error;
    }
  });

  try {
    await deleteMaklonPurchasesForSale(id);
  } catch (err) {
    console.warn("[voidSale] failed to void linked maklon purchases:", err);
  }

  await recalculateCashbookIfAvailable();
  return true;
}

/**
 * Hapus penjualan = void penjualan (membatalkan stok + keuangan + produksi
 * terkait). Delegasi ke voidSale yang sudah menangani reversal lengkap +
 * idempoten. (Implementasi kedua yang tak pernah terjangkau setelah
 * `return voidSale(...)` dihapus di Fase 6 — itu dead code.)
 */
export async function deleteSale(id: string): Promise<boolean> {
  return voidSale(id, "Penjualan dibatalkan");
}

/**
 * Ambil semua piutang
 */
export async function payReceivable(data: {
  piutang_id: string;
  jumlah_bayar: number;
  tanggal_bayar?: string;
  metode_pembayaran?: string;
  referensi?: string;
  catatan?: string;
  dibuat_oleh?: string;
}): Promise<{
  id: string;
  jumlah_bayar: number;
  status_baru: string;
  sisa_piutang: number;
}> {
  // Validasi — wajib lulus sebelum melakukan tulis apa pun.
  if (!data.jumlah_bayar || data.jumlah_bayar <= 0) {
    throw new Error("Jumlah pembayaran harus lebih dari 0");
  }

  const piutangResult = await db.queryOne("piutang_penjualan", {
    where: { id: data.piutang_id },
  });
  if (!piutangResult.data) {
    throw new Error("Piutang tidak ditemukan");
  }
  const piutang = piutangResult.data as any;

  if (data.jumlah_bayar > piutang.sisa_piutang) {
    throw new Error("Jumlah pembayaran tidak boleh melebihi sisa piutang");
  }

  // Resolve penjualan + pelanggan untuk string keperluan keuangan.
  const saleResult = await db.queryOne("penjualan", {
    where: { id: piutang.id_penjualan },
  });
  const sale = saleResult.data;
  let customer: any = null;
  if (sale?.pelanggan_id) {
    const customerResult = await db.queryOne("pelanggan", {
      where: { id: sale.pelanggan_id },
    });
    customer = customerResult.data;
  }

  const failures: string[] = [];

  // Langkah 1 (wajib): buat record pembayaran. Tanpa baris ini, pembayaran
  // dianggap tidak pernah terjadi — keluar daripada menulis state parsial.
  const paymentId = generateId();
  const payment = {
    id: paymentId,
    id_piutang: data.piutang_id,
    tanggal_bayar: data.tanggal_bayar || getTodayJakarta(),
    jumlah_bayar: data.jumlah_bayar,
    metode_pembayaran: data.metode_pembayaran || "CASH",
    referensi: data.referensi || null,
    catatan: data.catatan || null,
    dibuat_oleh: data.dibuat_oleh || null,
  };
  const paymentResult = await db.insert("pelunasan_piutang", payment);
  if (paymentResult.error) {
    throw paymentResult.error;
  }

  // Langkah 2 (best-effort): update total + status piutang.
  const newJumlahTerbayar = piutang.jumlah_terbayar + data.jumlah_bayar;
  const newSisaPiutang = piutang.sisa_piutang - data.jumlah_bayar;
  const newStatus =
    newSisaPiutang <= 0
      ? "LUNAS"
      : newJumlahTerbayar > 0
        ? "SEBAGIAN"
        : "AKTIF";

  try {
    const upd = await db.update("piutang_penjualan", data.piutang_id, {
      jumlah_terbayar: newJumlahTerbayar,
      sisa_piutang: newSisaPiutang,
      status: newStatus,
    });
    if (upd.error) throw upd.error;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[payReceivable] failed to update piutang:", e);
    failures.push(`update piutang: ${msg}`);
  }

  // Langkah 3 (best-effort): buat entri keuangan yang sesuai.
  try {
    const kategori = newStatus === "LUNAS" ? "LUNAS" : "PIUTANG";
    let keperluan = `Bayar Piutang ${sale?.nomor_faktur || ""}`;
    if (customer) {
      keperluan += ` - ${customer.nama}`;
    }
    if (newStatus === "LUNAS") {
      keperluan += " (LUNAS)";
    } else {
      keperluan += ` (Sisa: Rp ${newSisaPiutang.toLocaleString("id-ID")})`;
    }
    keperluan += ` [REF:${piutang.id_penjualan}]`;

    await createFinanceEntry({
      tanggal: data.tanggal_bayar || getTodayJakarta(),
      kategori_transaksi: kategori,
      debit: data.jumlah_bayar,
      keperluan,
      omzet: data.jumlah_bayar,
      catatan: data.catatan,
      dibuat_oleh: data.dibuat_oleh,
      reference_type: "SALE_RECEIVABLE_PAYMENT",
      reference_id: piutang.id_penjualan,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[payReceivable] failed to create finance entry:", e);
    failures.push(`finance entry: ${msg}`);
  }

  await recalculateCashbookIfAvailable();

  if (failures.length > 0) {
    console.warn(
      `[payReceivable] payment ${paymentId} recorded with ${failures.length} non-fatal failures:`,
      failures,
    );
    // Catatan: kita sengaja TIDAK throw di sini. Baris pembayaran adalah
    // sumber kebenaran — kehilangan baris itu jauh lebih buruk daripada
    // status piutang sedikit out-of-sync. Tampilkan warning lewat console
    // dan biarkan caller lanjut sukses.
  }

  return {
    id: paymentId,
    jumlah_bayar: data.jumlah_bayar,
    status_baru: newStatus,
    sisa_piutang: newSisaPiutang,
  };
}

/**
 * Bayar beberapa tagihan piutang sekaligus dengan alokasi FIFO otomatis.
 *
 * Alur:
 *  1. Validasi jumlah > 0. Guard periode tertutup (#7).
 *  2. Ambil baris piutang untuk tagihan_ids, saring yang masih aktif/sebagian.
 *  3. Urutkan FIFO server-side (dibuat_pada asc) — tidak percaya urutan klien.
 *  4. Alokasi: per tagihan bayar min(sisa_uang, tagihan.sisa_piutang) via payReceivable.
 *  5. Kelebihan uang dikembalikan sebagai sisa_uang (tidak disimpan).
 */
export async function payReceivableLumpSum(input: {
  tagihan_ids: string[];
  jumlah_bayar: number;
  tanggal_bayar?: string;
  metode_pembayaran?: string;
  referensi?: string;
  catatan?: string;
  dibuat_oleh?: string;
}): Promise<{
  total_dialokasikan: number;
  sisa_uang: number;
  alokasi: Array<{ piutang_id: string; dibayar: number; status_baru: string }>;
}> {
  if (!input.jumlah_bayar || input.jumlah_bayar <= 0) {
    throw new Error("Jumlah pembayaran harus lebih dari 0");
  }

  // Guard periode tertutup (#7)
  const tgl = input.tanggal_bayar || getTodayJakarta();
  if (await isDateInClosedPeriod(tgl)) {
    throw new Error(
      "Tanggal pembayaran berada di periode akuntansi yang sudah ditutup. Pilih tanggal pada periode terbuka.",
    );
  }

  // Ambil baris piutang, saring yang masih punya sisa & aktif/sebagian
  const rows: any[] = [];
  for (const id of input.tagihan_ids) {
    const r = await db.queryOne("piutang_penjualan", { where: { id } });
    const p = r.data as any;
    if (
      p &&
      (p.status === "AKTIF" || p.status === "SEBAGIAN") &&
      Number(p.sisa_piutang) > 0
    ) {
      rows.push(p);
    }
  }

  // FIFO server-side (tidak percaya urutan klien)
  rows.sort((a, b) =>
    String(a.dibuat_pada || "").localeCompare(String(b.dibuat_pada || "")),
  );

  let sisa = input.jumlah_bayar;
  const alokasi: Array<{
    piutang_id: string;
    dibayar: number;
    status_baru: string;
  }> = [];

  for (const p of rows) {
    if (sisa <= 0) break;
    const bayar = Math.min(sisa, Number(p.sisa_piutang));
    if (bayar <= 0) continue;
    const hasil = await payReceivable({
      piutang_id: p.id,
      jumlah_bayar: bayar,
      tanggal_bayar: tgl,
      metode_pembayaran: input.metode_pembayaran,
      referensi: input.referensi || undefined,
      catatan: input.catatan || undefined,
      dibuat_oleh: input.dibuat_oleh,
    });
    alokasi.push({
      piutang_id: p.id,
      dibayar: bayar,
      status_baru: hasil.status_baru,
    });
    sisa -= bayar;
  }

  return {
    total_dialokasikan: input.jumlah_bayar - sisa,
    sisa_uang: Math.max(0, sisa),
    alokasi,
  };
}

/**
 * Revert pembayaran (jadikan piutang AKTIF lagi)
 */
export async function revertSalePayment(data: {
  sale_id: string;
  dibuat_oleh?: string;
}): Promise<number> {
  // Fase validasi — wajib sukses sebelum ada penghapusan apa pun.
  const saleResult = await db.queryOne("penjualan", {
    where: { id: data.sale_id },
  });
  if (!saleResult.data) {
    throw new Error("Penjualan tidak ditemukan");
  }
  const sale = saleResult.data;

  const piutangResult = await db.query("piutang_penjualan", {
    where: { id_penjualan: data.sale_id },
  });
  if (!piutangResult.data || piutangResult.data.length === 0) {
    throw new Error("Transaksi ini tidak memiliki piutang");
  }
  const piutang = piutangResult.data[0] as any;

  const paymentsResult = await db.query("pelunasan_piutang", {
    where: { id_piutang: piutang.id },
  });
  const payments = paymentsResult.data || [];
  if (payments.length === 0) {
    throw new Error("Tidak ada catatan pembayaran piutang untuk transaksi ini");
  }

  // Pembersihan best-effort. Tiap langkah terisolasi supaya satu kegagalan
  // tidak membatalkan langkah lain.
  const failures: string[] = [];

  // Langkah 1: hapus semua record pembayaran.
  for (const payment of payments) {
    try {
      const del = await db.delete("pelunasan_piutang", (payment as any).id);
      if (del.error) throw del.error;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[revertSalePayment] failed to delete pelunasan_piutang ${(payment as any).id}:`,
        e,
      );
      failures.push(`delete pelunasan_piutang ${(payment as any).id}: ${msg}`);
    }
  }

  // Langkah 2: hapus entri keuangan terkait (LUNAS / PIUTANG yang match faktur).
  try {
    const financeResult = await db.query("keuangan");
    const financeEntries = financeResult.data || [];
    for (const entry of financeEntries as any[]) {
      if (
        (entry.kategori_transaksi === "LUNAS" ||
          entry.kategori_transaksi === "PIUTANG") &&
        entry.keperluan?.includes(sale.nomor_faktur)
      ) {
        try {
          const del = await db.delete("keuangan", entry.id);
          if (del.error) throw del.error;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          failures.push(`delete keuangan ${entry.id}: ${msg}`);
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`scan keuangan: ${msg}`);
  }

  // Langkah 3: reset piutang ke kondisi awal.
  try {
    const upd = await db.update("piutang_penjualan", piutang.id, {
      jumlah_terbayar: 0,
      sisa_piutang: piutang.jumlah_piutang,
      status: "AKTIF",
    });
    if (upd.error) throw upd.error;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`reset piutang: ${msg}`);
  }

  // Langkah 4: perbarui timestamp diperbarui_pada di penjualan.
  try {
    const upd = await db.update("penjualan", data.sale_id, {
      diperbarui_pada: getCurrentTimestamp(),
    });
    if (upd.error) throw upd.error;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`bump penjualan timestamp: ${msg}`);
  }

  await recalculateCashbookIfAvailable();

  if (failures.length > 0) {
    console.warn(
      `[revertSalePayment] sale ${data.sale_id} reverted with ${failures.length} non-fatal failures:`,
      failures,
    );
    throw new Error(
      `Pembayaran sebagian berhasil direvert (${payments.length} pembayaran), tetapi ada ${failures.length} kesalahan saat membersihkan data terkait. Periksa log untuk detail.`,
    );
  }

  return payments.length;
}

// ============================================================================
// FUNGSI HELPER (PRIVATE)
// ============================================================================

async function createFinanceEntry(data: {
  tanggal: string;
  kategori_transaksi: string;
  debit?: number;
  kredit?: number;
  keperluan: string;
  omzet?: number;
  biaya_operasional?: number;
  biaya_bahan?: number;
  catatan?: string | null;
  dibuat_oleh?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
}) {
  // Ambil urutan_tampilan tertinggi
  const maxOrderResult = await db.query("keuangan", {
    orderBy: { column: "urutan_tampilan", ascending: false },
    limit: 1,
  });

  const maxOrder =
    maxOrderResult.data && maxOrderResult.data.length > 0
      ? (maxOrderResult.data[0] as any).urutan_tampilan
      : 0;

  const nextDisplayOrder = (maxOrder || 0) + 1;

  const keuanganId = generateId();
  const debit = data.debit ?? 0;
  const kredit = data.kredit ?? 0;
  const periodeId = await resolveOpenPeriodeIdForKeuangan();
  const finance = {
    id: keuanganId,
    tanggal: data.tanggal,
    kategori_transaksi: data.kategori_transaksi,
    debit,
    kredit,
    keperluan: data.keperluan,
    omzet: data.omzet ?? 0,
    biaya_operasional: data.biaya_operasional ?? 0,
    biaya_bahan: data.biaya_bahan ?? 0,
    catatan: data.catatan || null,
    dibuat_oleh: data.dibuat_oleh || null,
    urutan_tampilan: nextDisplayOrder,
    reference_type: data.reference_type || null,
    reference_id: data.reference_id || null,
    periode_id: periodeId,
  };

  const result = await db.insert("keuangan", finance);
  if (result.error) throw result.error;
}

async function buildKeperluan(
  invoiceNumber: string,
  pelanggan_id?: string,
  catatan?: string,
  saleId?: string,
): Promise<string> {
  let keperluan = `Penjualan ${invoiceNumber}`;

  if (pelanggan_id) {
    const customerResult = await db.queryOne("pelanggan", {
      where: { id: pelanggan_id },
    });
    if (customerResult.data) {
      keperluan += ` - ${customerResult.data.nama}`;
    } else {
      keperluan += " - Pelanggan Umum";
    }
  } else {
    keperluan += " - Pelanggan Umum";
  }

  if (catatan?.trim()) {
    const excerpt = catatan.trim().substring(0, 25);
    keperluan += ` (${excerpt}${catatan.trim().length > 25 ? "..." : ""})`;
  }

  if (saleId) {
    keperluan += ` [REF:${saleId}]`;
  }

  return keperluan;
}

async function buildPiutangKeperluan(
  invoiceNumber: string,
  pelanggan_id?: string,
  metode_pembayaran?: string,
  jumlahTerbayar?: number,
  total_jumlah?: number,
  saleId?: string,
): Promise<string> {
  let keperluan = "";

  if (metode_pembayaran === "DOWN_PAYMENT") {
    keperluan = `DP ${invoiceNumber}`;
  } else {
    keperluan = `Pembayaran Sebagian ${invoiceNumber}`;
  }

  if (pelanggan_id) {
    const customerResult = await db.queryOne("pelanggan", {
      where: { id: pelanggan_id },
    });
    if (customerResult.data) {
      keperluan += ` - ${customerResult.data.nama}`;
    } else {
      keperluan += " - Pelanggan Umum";
    }
  } else {
    keperluan += " - Pelanggan Umum";
  }

  if (jumlahTerbayar && total_jumlah) {
    keperluan += ` (Rp ${jumlahTerbayar.toLocaleString(
      "id-ID",
    )} dari Rp ${total_jumlah.toLocaleString("id-ID")})`;
  }

  if (saleId) {
    keperluan += ` [REF:${saleId}]`;
  }

  return keperluan;
}
