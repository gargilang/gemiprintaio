/** Service BOM (Bill of Materials) rakitan barang. */
import { db } from "@/lib/db-unified";
import { hitungQtyKomponenDimensiM2 } from "../bom-utils";

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
      console.warn(
        `[BOM] Gagal query scope per-produk-jual (${barangId}/${unitPriceId}):`,
        e,
      );
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

function positiveNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Fallback AVCO per base unit: ambil harga_beli unit price pertama
 * (default/faktor 1) dibagi faktor konversi. Konsisten dengan logika
 * `fallbackAverageCostPerBaseUnit` di pos-mutations.ts.
 */
async function fallbackAvcoPerBaseUnit(barangId: string): Promise<number> {
  try {
    const res = await db.query<any>("harga_barang_satuan", {
      where: { barang_id: barangId },
      orderBy: { column: "urutan_tampilan", ascending: true },
    });
    const rows = res.data || [];
    const unit =
      rows.find((r: any) => Number(r.default_status) === 1) ||
      rows.find((r: any) => Number(r.faktor_konversi) === 1) ||
      rows[0];
    const factor = positiveNumber(unit?.faktor_konversi) || 1;
    return positiveNumber(unit?.harga_beli) / factor;
  } catch (e) {
    console.warn(`[BOM HPP] Gagal fallback AVCO komponen ${barangId}:`, e);
    return 0;
  }
}

/**
 * Hitung biaya BOM per unit produk jual (B2.f) untuk HPP penjualan.
 *   bomCostPerUnit = Σ(AVCO komponen × qty per unit produk jual)
 * Komponen berdimensi (jumlah_roll × panjang × lebar) dikonversi ke m²
 * supaya konsisten dengan pemotongan stok di deductBomComponents.
 * AVCO komponen diambil dari `barang.average_cost_per_base_unit`, fallback
 * ke `harga_barang_satuan.harga_beli` bila kosong. Kegagalan lookup komponen
 * ditoleransi (kontribusi 0) supaya checkout tidak gagal.
 *
 * Catatan N+1: untuk MVP, BOM biasanya 1-3 komponen & item per transaksi
 * kecil, jadi query per komponen dapat ditoleransi.
 */
export async function computeBomCostPerUnit(
  barangId: string,
  unitPriceId: string | null | undefined,
): Promise<number> {
  const components = await resolveBomForUnitPrice(barangId, unitPriceId);
  if (components.length === 0) return 0;

  let total = 0;
  for (const k of components) {
    // Hitung qty per unit produk jual (m² untuk komponen berdimensi).
    let perUnitQty = Number(k.qty) || 0;
    if (
      k.jumlah_roll != null &&
      k.panjang != null &&
      k.lebar != null &&
      Number(k.panjang) > 0 &&
      Number(k.lebar) > 0
    ) {
      perUnitQty = hitungQtyKomponenDimensiM2(
        Number(k.jumlah_roll),
        Number(k.panjang),
        Number(k.lebar),
      );
    }
    if (!Number.isFinite(perUnitQty) || perUnitQty <= 0) continue;

    // Ambil AVCO komponen dari tabel barang.
    let avco = 0;
    try {
      const kompRes = await db.queryOne<any>("barang", {
        where: { id: k.komponen_id },
      });
      avco = positiveNumber(kompRes.data?.average_cost_per_base_unit);
    } catch (e) {
      console.warn(`[BOM HPP] Gagal ambil AVCO komponen ${k.komponen_id}:`, e);
    }
    if (avco <= 0) {
      avco = await fallbackAvcoPerBaseUnit(k.komponen_id);
    }

    total += avco * perUnitQty;
  }
  return total;
}
