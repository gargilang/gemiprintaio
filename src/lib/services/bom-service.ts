/** Service BOM (Bill of Materials) rakitan barang. */
import { db } from "@/lib/db-unified";

export interface BarangKomponenRow {
  id: string;
  parent_barang_id: string;
  komponen_id: string;
  qty: number;
  jumlah_roll?: number | null;
  panjang?: number | null;
  lebar?: number | null;
  satuan?: string | null;
  catatan?: string | null;
  unit_price_id?: string | null;
  is_deleted?: number;
}

/**
 * Resolusi BOM per produk jual (B2.b).
 * 1. unitPriceId non-null & ada row → pakai row itu saja (exclusive scope).
 * 2. Tidak ada scope per-produk-jual → fallback ke scope barang-level (NULL).
 * 3. unitPriceId null → hanya cari scope barang-level.
 * 4. Keduanya tidak ada → return [].
 * Query error ditoleransi (return []) supaya flow tidak gagal total.
 */
export async function resolveBomForUnitPrice(
  barangId: string,
  unitPriceId: string | null | undefined,
): Promise<BarangKomponenRow[]> {
  if (unitPriceId) {
    try {
      const scoped = await db.query<BarangKomponenRow>("barang_komponen", {
        where: {
          parent_barang_id: barangId,
          unit_price_id: unitPriceId,
          is_deleted: 0,
        },
      });
      if (scoped.data && scoped.data.length > 0) return scoped.data;
    } catch (e) {
      console.warn(`[BOM] Gagal query scope per-produk-jual (${barangId}/${unitPriceId}):`, e);
    }
  }

  try {
    const general = await db.query<BarangKomponenRow>("barang_komponen", {
      where: {
        parent_barang_id: barangId,
        unit_price_id: null,
        is_deleted: 0,
      },
    });
    return general.data || [];
  } catch (e) {
    console.warn(`[BOM] Gagal query scope barang-level (${barangId}):`, e);
    return [];
  }
}
