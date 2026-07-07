"use server";

/**
 * Server Action untuk Halaman POS
 * Menyediakan operasi data sisi-server untuk komponen klien.
 */

import { requireAdminOrManager, requireSession } from "@/lib/auth-guard-server";
import { db } from "@/lib/db-unified";
import {
  getPOSInitData,
  createSale,
  deleteSale,
  voidSale,
  revertSalePayment,
  getReceivables,
  payReceivable,
  type Sale,
  type CreateSaleData,
} from "@/lib/services/pos-service";
import { createPelanggan } from "@/lib/services/customers-service";
import { getFinishingOptions } from "@/lib/services/finishing-options-service";

/**
 * Ambil data awal untuk POS (barang, pelanggan, dll.)
 */
export async function getPOSInitDataAction() {
  try {
    return await getPOSInitData();
  } catch (error) {
    console.error("Gagal getPOSInitDataAction:", error);
    throw error;
  }
}

/**
 * Buat penjualan baru
 */
export async function createSaleAction(data: CreateSaleData) {
  try {
    return await createSale(data);
  } catch (error) {
    console.error("Gagal createSaleAction:", error);
    throw error;
  }
}

/**
 * Hapus penjualan
 */
export async function deleteSaleAction(id: string): Promise<boolean> {
  try {
    await requireAdminOrManager();
    return await deleteSale(id);
  } catch (error) {
    console.error("Gagal deleteSaleAction:", error);
    throw error;
  }
}

export async function voidSaleAction(
  id: string,
  reason = "Penjualan dibatalkan",
): Promise<boolean> {
  try {
    const s = await requireAdminOrManager();
    return await voidSale(id, reason, s.uid);
  } catch (error) {
    console.error("Gagal voidSaleAction:", error);
    throw error;
  }
}

/**
 * Revert pembayaran penjualan (jadikan piutang aktif lagi)
 */
export async function revertSalePaymentAction(data: {
  sale_id: string;
}): Promise<number> {
  try {
    return await revertSalePayment(data);
  } catch (error) {
    console.error("Gagal revertSalePaymentAction:", error);
    throw error;
  }
}

/**
 * Buat pelanggan baru
 */
export async function createPelangganAction(data: {
  tipe_pelanggan: string;
  nama: string;
  nama_perusahaan?: string;
  telepon?: string;
  email?: string;
  alamat?: string;
  member_status: number;
}) {
  try {
    return await createPelanggan(data as any);
  } catch (error) {
    console.error("Gagal createPelangganAction:", error);
    throw error;
  }
}

/**
 * Ambil semua piutang aktif
 */
export async function getReceivablesAction() {
  try {
    return await getReceivables();
  } catch (error) {
    console.error("Gagal getReceivablesAction:", error);
    throw error;
  }
}

/**
 * Bayar piutang
 */
export async function payReceivableAction(data: {
  piutang_id: string;
  jumlah_bayar: number;
  tanggal_bayar: string;
  metode_pembayaran: string;
  referensi?: string;
  catatan?: string;
  dibuat_oleh?: string;
}) {
  try {
    return await payReceivable(data);
  } catch (error) {
    console.error("Gagal payReceivableAction:", error);
    throw error;
  }
}

/**
 * Ambil opsi finishing untuk modal finishing di POS
 */
export async function getFinishingOptionsAction() {
  try {
    return await getFinishingOptions();
  } catch (error) {
    console.error("Gagal getFinishingOptionsAction:", error);
    throw error;
  }
}

/**
 * Hitung item "Populer" (C5) untuk sort POS.
 *
 * Aturan:
 *  - Auto-compute: hitung transaksi `item_penjualan` 30 hari terakhir.
 *    Barang dikelompokkan per `harga_satuan_id`; maklon per `katalog_maklon_id`.
 *    Threshold >= 3 transaksi → populer.
 *  - Manual override: `populer_status = 1` di `harga_barang_satuan` /
 *    `katalog_maklon` selalu populer walau 0 transaksi.
 *
 * N+1 note: db-unified `where` hanya mendukung equality + array IN (tidak ada
 * range tanggal / ne). Maka fetch semua `item_penjualan` lalu filter tanggal
 * in-memory. Acceptable untuk MVP (~ribuan baris).
 */
export async function getPopularItemsAction(): Promise<{
  barangUnitPriceIds: Set<string>;
  katalogMaklonIds: Set<string>;
}> {
  await requireSession();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // Fetch semua item_penjualan (bounded untuk MVP), filter tanggal in-memory.
  const salesRes = await db.query<{
    tipe_item: string;
    harga_satuan_id: string | null;
    katalog_maklon_id: string | null;
    dibuat_pada: string;
  }>("item_penjualan", {});
  const sales = salesRes.data || [];

  const barangCounts = new Map<string, number>();
  const maklonCounts = new Map<string, number>();
  for (const it of sales) {
    if (!it.dibuat_pada || it.dibuat_pada < since) continue;
    if (it.tipe_item === "BARANG" && it.harga_satuan_id) {
      barangCounts.set(
        it.harga_satuan_id,
        (barangCounts.get(it.harga_satuan_id) || 0) + 1,
      );
    } else if (it.tipe_item === "MAKLON" && it.katalog_maklon_id) {
      maklonCounts.set(
        it.katalog_maklon_id,
        (maklonCounts.get(it.katalog_maklon_id) || 0) + 1,
      );
    }
  }

  // Manual override: populer_status = 1. Filter is_deleted in-memory karena
  // representasi boolean (Postgres) vs integer (SQLite) berbeda antar backend.
  const manualBarangRes = await db.query<{
    id: string;
    populer_status: number;
    is_deleted?: unknown;
  }>("harga_barang_satuan", { where: { populer_status: 1 } });
  const manualMaklonRes = await db.query<{
    id: string;
    populer_status: number;
    is_deleted?: unknown;
  }>("katalog_maklon", { where: { populer_status: 1 } });

  const THRESHOLD = 3;
  const barangUnitPriceIds = new Set<string>([
    ...[...barangCounts.entries()]
      .filter(([, c]) => c >= THRESHOLD)
      .map(([id]) => id),
    ...(manualBarangRes.data || [])
      .filter((r) => Number(r.is_deleted) !== 1)
      .map((r) => r.id),
  ]);
  const katalogMaklonIds = new Set<string>([
    ...[...maklonCounts.entries()]
      .filter(([, c]) => c >= THRESHOLD)
      .map(([id]) => id),
    ...(manualMaklonRes.data || [])
      .filter((r) => Number(r.is_deleted) !== 1)
      .map((r) => r.id),
  ]);
  return { barangUnitPriceIds, katalogMaklonIds };
}
