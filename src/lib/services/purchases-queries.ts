/**
 * Purchases Service
 * Universal API for Purchases on Tauri and Web
 */

import "server-only";

import { db, getServerSupabaseClient } from "../db-unified";
import { fetchLastNomorPembelian } from "../server-data-supabase";
import { recalculateCashbookIfAvailable } from "./finance-service";
import {
  convertRollVariant,
  findOrCreateRollVariant,
  getInventoryMovements,
  postInventoryMovement,
} from "./inventory-service";
import { hitungPpn } from "../ppn-helpers";

/**
 * Bangun DTO pembelian dari baris pembelian via db-unified (Supabase / SQLite).
 */

export async function enrichPurchaseRows(pembelianRows: any[]): Promise<Purchase[]> {
  if (pembelianRows.length === 0) return [];
  const idSet = new Set(pembelianRows.map((p) => p.id));

  const itemsRes = await db.query<any>("item_pembelian", {});
  if (itemsRes.error) throw itemsRes.error;
  const allItems = (itemsRes.data || []).filter((i) =>
    idSet.has(i.pembelian_id)
  );

  const vendorIds = [
    ...new Set(pembelianRows.map((p) => p.vendor_id).filter(Boolean)),
  ] as string[];
  const vendorMap = new Map<
    string,
    {
      nama_perusahaan: string;
      alamat?: string;
      telepon?: string;
      kontak_person?: string;
    }
  >();
  await Promise.all(
    vendorIds.map(async (vid) => {
      const v = await db.queryOne<{
        nama_perusahaan: string;
        alamat?: string;
        telepon?: string;
        kontak_person?: string;
      }>("vendor", {
        where: { id: vid },
      });
      if (v.data?.nama_perusahaan) vendorMap.set(vid, v.data);
    })
  );

  const creatorIds = [
    ...new Set(pembelianRows.map((p) => p.dibuat_oleh).filter(Boolean)),
  ] as string[];
  const creatorMap = new Map<string, string>();
  await Promise.all(
    creatorIds.map(async (cid) => {
      const u = await db.queryOne<{ nama_lengkap: string }>("profil", {
        where: { id: cid },
        select: "nama_lengkap",
      });
      if (u.data?.nama_lengkap) creatorMap.set(cid, u.data.nama_lengkap);
    })
  );

  const barangIds = [
    ...new Set(allItems.map((i) => i.barang_id).filter(Boolean)),
  ] as string[];
  const barangMap = new Map<string, string>();
  await Promise.all(
    barangIds.map(async (bid) => {
      const b = await db.queryOne<{ nama: string }>("barang", {
        where: { id: bid },
        select: "nama",
      });
      if (b.data?.nama) barangMap.set(bid, b.data.nama);
    })
  );

  const itemsByPurchase = new Map<string, any[]>();
  for (const item of allItems) {
    const pid = item.pembelian_id;
    if (!itemsByPurchase.has(pid)) itemsByPurchase.set(pid, []);
    itemsByPurchase.get(pid)!.push({
      ...item,
      nama_barang: barangMap.get(item.barang_id),
    });
  }

  return pembelianRows.map((purchase) => {
    const rawItems = itemsByPurchase.get(purchase.id) || [];
    const items = normalizePurchaseItemsForUI(rawItems);
    const calculatedTotal = items.reduce(
      (sum: number, item: any) =>
        sum +
        (Number(item.subtotal) ||
          Number(item.jumlah || 0) *
            Number(item.harga_satuan || item.harga_beli || 0)),
      0
    );
    const total_harga =
      calculatedTotal > 0 ? calculatedTotal : Number(purchase.total_jumlah || 0);

    const vid = purchase.vendor_id;
    const cid = purchase.dibuat_oleh;
    const vendor = vid ? vendorMap.get(vid) : undefined;

    return {
      ...purchase,
      vendor_name: vendor?.nama_perusahaan,
      vendor_alamat: vendor?.alamat,
      vendor_telepon: vendor?.telepon,
      vendor_kontak_person: vendor?.kontak_person,
      created_by_name: cid ? creatorMap.get(cid) : undefined,
      items,
      total_harga,
    } as Purchase;
  });
}

export function normalizePaymentMethod(method?: string): string {
  const value = (method || "").trim().toUpperCase();
  return value || "CASH";
}

export function isCashPayment(method?: string): boolean {
  return normalizePaymentMethod(method) === "CASH";
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function positiveNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function fallbackAverageCostPerBaseUnit(
  barangId: string,
  preferredHargaSatuanId?: string | null
): Promise<number> {
  const prices = await db.query<any>("harga_barang_satuan", {
    where: { barang_id: barangId },
    orderBy: { column: "urutan_tampilan", ascending: true },
  });
  const rows = prices.data || [];
  const preferred = preferredHargaSatuanId
    ? rows.find((r: any) => r.id === preferredHargaSatuanId)
    : null;
  const unit =
    preferred ||
    rows.find((r: any) => Number(r.default_status) === 1) ||
    rows.find((r: any) => Number(r.faktor_konversi) === 1) ||
    rows[0];
  const factor = positiveNumber(unit?.faktor_konversi) || 1;
  return positiveNumber(unit?.harga_beli) / factor;
}

export async function syncUnitPurchasePricesFromAverage(
  barangId: string,
  averageCostPerBaseUnit: number
): Promise<void> {
  const upsRes = await db.query<{ id: string; faktor_konversi: number }>(
    "harga_barang_satuan",
    { where: { barang_id: barangId } }
  );
  if (upsRes.error) throw upsRes.error;
  for (const up of upsRes.data || []) {
    const newPrice = averageCostPerBaseUnit * (positiveNumber(up.faktor_konversi) || 1);
    const upd = await db.update("harga_barang_satuan", up.id, {
      harga_beli: newPrice,
      diperbarui_pada: new Date().toISOString(),
    });
    if (upd.error) throw upd.error;
  }
}

export async function applyPurchaseCostToMaterial(item: {
  barang_id: string;
  harga_satuan_id?: string | null;
  jumlah: number;
  faktor_konversi: number;
  harga_satuan: number;
}): Promise<void> {
  const materialResult = await db.queryOne("barang", {
    where: { id: item.barang_id },
  });
  const material = materialResult.data as Record<string, unknown> | null;

  if (!material) {
    throw new Error(`Barang tidak ditemukan: ${item.barang_id}`);
  }

  const qtyBase = item.jumlah * (positiveNumber(item.faktor_konversi) || 1);
  const oldStock = Number(material.jumlah_stok) || 0;
  const oldAverage =
    positiveNumber((material as any).average_cost_per_base_unit) ||
    (await fallbackAverageCostPerBaseUnit(item.barang_id, item.harga_satuan_id));
  const purchaseCostPerBase =
    positiveNumber(item.harga_satuan) / (positiveNumber(item.faktor_konversi) || 1);
  const newStock = oldStock + qtyBase;
  const newAverage =
    newStock > 0
      ? (oldStock * oldAverage + qtyBase * purchaseCostPerBase) / newStock
      : purchaseCostPerBase;

  const stockResult = await db.update("barang", item.barang_id, {
    jumlah_stok: newStock,
    average_cost_per_base_unit: newAverage,
    diperbarui_pada: new Date().toISOString(),
  });
  if (stockResult.error) throw stockResult.error;

  await syncUnitPurchasePricesFromAverage(item.barang_id, newAverage);
}

export async function reversePurchaseCostFromMaterial(item: {
  barang_id: string;
  harga_satuan_id?: string | null;
  jumlah: number;
  faktor_konversi: number;
  harga_satuan: number;
}): Promise<void> {
  const materialResult = await db.query("barang", {
    where: { id: item.barang_id },
  });
  const material = materialResult.data?.[0];
  if (!material) return;

  const qtyBase = item.jumlah * (positiveNumber(item.faktor_konversi) || 1);
  const currentStock = Number(material.jumlah_stok) || 0;
  const currentAverage =
    positiveNumber(material.average_cost_per_base_unit) ||
    (await fallbackAverageCostPerBaseUnit(item.barang_id, item.harga_satuan_id));
  const purchaseCostPerBase =
    positiveNumber(item.harga_satuan) / (positiveNumber(item.faktor_konversi) || 1);
  const newStock = Math.max(0, currentStock - qtyBase);
  const newAverage =
    newStock > 0
      ? Math.max(0, (currentStock * currentAverage - qtyBase * purchaseCostPerBase) / newStock)
      : 0;

  await db.update("barang", item.barang_id, {
    jumlah_stok: newStock,
    average_cost_per_base_unit: newAverage,
    diperbarui_pada: new Date().toISOString(),
  });
  await syncUnitPurchasePricesFromAverage(item.barang_id, newAverage);
}

export async function nextNomorPembelian(): Promise<string> {
  let last: string | null | undefined;
  if (getServerSupabaseClient()) {
    last = await fetchLastNomorPembelian();
  } else {
    const rows = await db.queryRaw<{ nomor_pembelian: string }>(
      "SELECT nomor_pembelian FROM pembelian ORDER BY dibuat_pada DESC LIMIT 1",
      []
    );
    last = rows[0]?.nomor_pembelian;
  }
  let nextNumber = 1;
  if (last) {
    const match = last.match(/(\d+)$/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }
  return `PO-${nextNumber.toString().padStart(5, "0")}`;
}

/**
 * Buat nomor pembelian maklon berikutnya (`MK-NNNNN`). Memakai counter
 * terpisah dari PO supaya pembelian subkontrak terlihat berbeda di list
 * dan laporan. Jatuh balik ke `MK-00001` kalau belum ada PO maklon sebelumnya.
 */
export async function nextNomorPembelianMaklon(): Promise<string> {
  const rows = await db.queryRaw<{ nomor_pembelian: string }>(
    `SELECT nomor_pembelian FROM pembelian
     WHERE nomor_pembelian LIKE 'MK-%'
     ORDER BY nomor_pembelian DESC
     LIMIT 1`,
    []
  );
  let nextNumber = 1;
  const last = rows[0]?.nomor_pembelian;
  if (last) {
    const match = last.match(/(\d+)$/);
    if (match) nextNumber = parseInt(match[1], 10) + 1;
  }
  return `MK-${nextNumber.toString().padStart(5, "0")}`;
}

export function normalizePurchaseItemsForUI(items: any[]): any[] {
  return items.map((item) => ({
    ...item,
    id_barang: item.id_barang ?? item.barang_id,
    id_satuan: item.id_satuan ?? item.harga_satuan_id,
    harga_beli: item.harga_beli ?? item.harga_satuan ?? 0,
    subtotal:
      item.subtotal ??
      (Number(item.jumlah || 0) * Number(item.harga_satuan || item.harga_beli || 0)),
  }));
}

export interface Purchase {
  id: string;
  nomor_pembelian: string;
  nomor_faktur: string;
  vendor_id: string;
  vendor_name?: string;
  vendor_alamat?: string;
  vendor_telepon?: string;
  vendor_kontak_person?: string;
  tanggal: string;
  metode_pembayaran: string;
  total_harga: number;
  jumlah_dibayar?: number;
  status_pembayaran: string;
  catatan?: string;
  dibuat_oleh?: string;
  created_by_name?: string;
  diterima_oleh?: string | null;
  status_transaksi?: "DRAFT" | "POSTED" | "VOIDED";
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  dibuat_pada?: string;
  diperbarui_pada?: string;
  /** Dukungan maklon: membedakan PO subkontrak otomatis dari pembelian biasa. */
  tipe_pembelian?: "BARANG" | "MAKLON";
  /** ID penjualan yang memicu PO maklon ini (null untuk pembelian biasa). */
  penjualan_id_sumber?: string | null;
  items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  pembelian_id: string;
  barang_id: string;
  nama_barang?: string;
  harga_satuan_id: string;
  nama_satuan: string;
  faktor_konversi: number;
  jumlah: number;
  harga_satuan: number;
  subtotal: number;
  panjang?: number | null;
  lebar?: number | null;
  jumlah_roll?: number | null;
}

export interface InitData {
  purchases: Purchase[];
  materials: any[];
  vendors: any[];
  categories: any[];
  subcategories: any[];
  units: any[];
}

/**
 * Ambil semua pembelian beserta itemnya
 */

// ── Queries ──────────────────────────────────────────

export async function getPurchases(): Promise<Purchase[]> {
  try {
    const sqliteDb = await db.getNativeSQLite();
    if (sqliteDb) {
      try {
        const purchases = sqliteDb
          .prepare(
            `
        SELECT
          p.*,
          v.nama_perusahaan as vendor_name,
          v.alamat as vendor_alamat,
          v.telepon as vendor_telepon,
          v.kontak_person as vendor_kontak_person,
          profil.nama_lengkap as created_by_name
        FROM pembelian p
        LEFT JOIN vendor v ON p.vendor_id = v.id
        LEFT JOIN profil ON p.dibuat_oleh = profil.id
        ORDER BY p.dibuat_pada DESC
      `
          )
          .all();

        const purchasesWithItems = purchases.map((purchase: any) => {
          const rawItems = sqliteDb
            .prepare(
              `
          SELECT
            ip.*,
            b.nama as nama_barang
          FROM item_pembelian ip
          LEFT JOIN barang b ON ip.barang_id = b.id
          WHERE ip.pembelian_id = ?
        `
            )
            .all(purchase.id);
          const items = normalizePurchaseItemsForUI(rawItems);

          const calculatedTotal = items.reduce(
            (sum: number, item: any) =>
              sum +
              (Number(item.subtotal) ||
                Number(item.jumlah || 0) *
                  Number(item.harga_satuan || item.harga_beli || 0)),
            0
          );
          const total_harga =
            calculatedTotal > 0
              ? calculatedTotal
              : Number(purchase.total_jumlah || 0);

          return {
            ...purchase,
            items,
            total_harga,
          };
        });

        return purchasesWithItems as Purchase[];
      } catch (e) {
        console.warn("SQLite getPurchases failed, using unified:", e);
      }
    }

    const pemRes = await db.query<any>("pembelian", {
      orderBy: { column: "dibuat_pada", ascending: false },
    });
    if (pemRes.error) throw pemRes.error;
    return enrichPurchaseRows(pemRes.data || []);
  } catch (error) {
    console.error("Error fetching purchases:", error);
    throw error;
  }
}

/**
 * Ambil data awal halaman pembelian (agregat)
 */
export async function getInitData(): Promise<InitData> {
  try {
    // Query paralel untuk kecepatan
    const [
      purchasesResult,
      materialsResult,
      vendorsResult,
      categoriesResult,
      subcategoriesResult,
      unitsResult,
    ] = await Promise.all([
      getPurchases(),
      import("./materials-service").then((m) => m.getMaterials()),
      import("./vendors-service").then((v) => v.getVendors()),
      db.query("kategori_barang", {
        orderBy: { column: "urutan_tampilan", ascending: true },
      }),
      db.query("subkategori_barang", {
        orderBy: { column: "urutan_tampilan", ascending: true },
      }),
      db.query("satuan_barang", {
        orderBy: { column: "urutan_tampilan", ascending: true },
      }),
    ]);

    return {
      purchases: purchasesResult,
      materials: materialsResult,
      vendors: vendorsResult,
      categories: categoriesResult.data || [],
      subcategories: subcategoriesResult.data || [],
      units: unitsResult.data || [],
    };
  } catch (error) {
    console.error("Error fetching init data:", error);
    throw error;
  }
}

/**
 * Buat pembelian baru beserta itemnya
 */

export async function getPurchaseById(id: string): Promise<Purchase | null> {
  try {
    const sqliteDb = await db.getNativeSQLite();
    if (sqliteDb) {
      try {
        const purchase = sqliteDb
          .prepare(
            `
        SELECT
          p.*,
          v.nama_perusahaan as vendor_name,
          profil.nama_lengkap as created_by_name
        FROM pembelian p
        LEFT JOIN vendor v ON p.vendor_id = v.id
        LEFT JOIN profil ON p.dibuat_oleh = profil.id
        WHERE p.id = ?
      `
          )
          .get(id) as any;

        if (!purchase) {
          return null;
        }

        const rawItems = sqliteDb
          .prepare(
            `
        SELECT
          ip.*,
          b.nama as nama_barang
        FROM item_pembelian ip
        LEFT JOIN barang b ON ip.barang_id = b.id
        WHERE ip.pembelian_id = ?
      `
          )
          .all(id) as any[];
        const items = normalizePurchaseItemsForUI(rawItems);

        const calculatedTotal = items.reduce(
          (sum: number, item: any) =>
            sum +
            (Number(item.subtotal) ||
              Number(item.jumlah || 0) *
                Number(item.harga_satuan || item.harga_beli || 0)),
          0
        );
        const total_harga =
          calculatedTotal > 0
            ? calculatedTotal
            : Number(purchase.total_jumlah || 0);

        return {
          ...purchase,
          items,
          total_harga,
        } as Purchase;
      } catch (e) {
        console.warn("SQLite getPurchaseById failed, using unified:", e);
      }
    }

    const one = await db.queryOne<any>("pembelian", { where: { id } });
    if (!one.data) return null;
    const enriched = await enrichPurchaseRows([one.data]);
    return enriched[0] || null;
  } catch (error) {
    console.error("Error fetching purchase:", error);
    throw error;
  }
}

/**
 * Perbarui pembelian yang sudah ada
 */

export async function getDebts(): Promise<any[]> {
  try {
    const pemRes = await db.query<any>("pembelian", {
      orderBy: { column: "tanggal", ascending: true },
    });
    if (pemRes.error) throw pemRes.error;

    const rows = (pemRes.data || []).filter((p: any) =>
      ["HUTANG", "SEBAGIAN"].includes(
        String(p.status_pembayaran || "").toUpperCase()
      )
    );

    rows.sort((a: any, b: any) => {
      const ta = String(a.tanggal || "").localeCompare(String(b.tanggal || ""));
      if (ta !== 0) return ta;
      return String(a.dibuat_pada || "").localeCompare(
        String(b.dibuat_pada || "")
      );
    });

    const vendorIds = [...new Set(rows.map((r: any) => r.vendor_id).filter(Boolean))];
    const vendorMap = new Map<string, string>();
    await Promise.all(
      vendorIds.map(async (vid: string) => {
        const v = await db.queryOne<{ nama_perusahaan: string }>("vendor", {
          where: { id: vid },
          select: "nama_perusahaan",
        });
        if (v.data?.nama_perusahaan)
          vendorMap.set(vid, v.data.nama_perusahaan);
      })
    );

    return rows.map((p: any) => ({
      id: p.id,
      nomor_pembelian: p.nomor_pembelian,
      nomor_faktur: p.nomor_faktur,
      tanggal: p.tanggal,
      total_jumlah: p.total_jumlah,
      jumlah_dibayar: p.jumlah_dibayar,
      status_pembayaran: p.status_pembayaran,
      sisa_hutang:
        Number(p.total_jumlah || 0) - Number(p.jumlah_dibayar || 0),
      vendor_name: p.vendor_id ? vendorMap.get(p.vendor_id) ?? null : null,
    }));
  } catch (error) {
    console.error("Error fetching debts:", error);
    throw error;
  }
}

