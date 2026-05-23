/**
 * Purchases Service
 * Universal API for Purchases on Tauri and Web
 */

import "server-only";

import { db, getServerSupabaseClient } from "../db-unified";
import { fetchLastNomorPembelian } from "../server-data-supabase";
import { recalculateCashbookIfAvailable } from "./finance-service";
import {
  getInventoryMovements,
  postInventoryMovement,
} from "./inventory-service";
import { hitungPpn } from "../ppn-helpers";

/**
 * Build purchase DTOs from pembelian rows using db-unified (Supabase / SQLite).
 */
async function enrichPurchaseRows(pembelianRows: any[]): Promise<Purchase[]> {
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

function normalizePaymentMethod(method?: string): string {
  const value = (method || "").trim().toUpperCase();
  return value || "CASH";
}

function isCashPayment(method?: string): boolean {
  return normalizePaymentMethod(method) === "CASH";
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function positiveNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function fallbackAverageCostPerBaseUnit(
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

async function syncUnitPurchasePricesFromAverage(
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

async function applyPurchaseCostToMaterial(item: {
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

async function reversePurchaseCostFromMaterial(item: {
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

async function nextNomorPembelian(): Promise<string> {
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
 * Generate the next maklon purchase number (`MK-NNNNN`). Uses a separate
 * counter from PO so subcontract purchases are visually distinct in lists
 * and reports. Falls back to `MK-00001` if no prior maklon PO exists.
 */
async function nextNomorPembelianMaklon(): Promise<string> {
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

function normalizePurchaseItemsForUI(items: any[]): any[] {
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
  /** Maklon support: distinguishes auto-generated subcontract PO from regular purchase. */
  tipe_pembelian?: "BARANG" | "MAKLON";
  /** Sale ID that triggered this maklon PO (null for regular purchases). */
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
 * Get all purchases with items
 */
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
 * Get init data for purchases page (aggregate)
 */
export async function getInitData(): Promise<InitData> {
  try {
    // Parallel queries for speed
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
 * Create new purchase with items
 */
export async function createPurchase(data: {
  nomor_pembelian?: string;
  nomor_faktur: string;
  vendor_id: string | null;
  tanggal: string;
  metode_pembayaran: string;
  catatan?: string;
  dibuat_oleh?: string;
  diterima_oleh?: string;
  // PPN masukan (opsional — kalau tidak ada, kena_ppn=0)
  kena_ppn?: boolean;
  ppn_persen?: number;
  ppn_metode?: "EKSKLUSIF" | "INKLUSIF";
  dapat_dikreditkan?: boolean;
  nomor_faktur_pajak_vendor?: string | null;
  tanggal_faktur_pajak?: string | null;
  vendor_npwp_snapshot?: string | null;
  items: Array<{
    barang_id: string;
    harga_satuan_id?: string | null;
    nama_satuan: string;
    faktor_konversi: number;
    jumlah: number;
    harga_satuan: number;
    panjang?: number | null;
    lebar?: number | null;
  }>;
}): Promise<{ id: string }> {
  try {
    // Validate
    if (!data.nomor_faktur?.trim()) {
      throw new Error("Nomor faktur harus diisi");
    }

    if (!data.items || data.items.length === 0) {
      throw new Error("Minimal harus ada 1 item pembelian");
    }

    const nomorFakturNorm = data.nomor_faktur.trim();
    const dup = await db.queryOne("pembelian", {
      where: { nomor_faktur: nomorFakturNorm },
    });
    if (dup.data) {
      throw new Error("Nomor faktur sudah digunakan");
    }

    const nomorPembelian =
      data.nomor_pembelian?.trim() || (await nextNomorPembelian());

    // Generate ID
    const purchaseId = generateId("purchase");

    // Calculate total (subtotal sum). Kalau metode INKLUSIF, total ini
    // sudah termasuk PPN. RPC/path TS yang akan extract DPP dari total ini.
    const total_harga = data.items.reduce(
      (sum, item) => sum + item.jumlah * item.harga_satuan,
      0
    );

    const kenaPpn = data.kena_ppn ? 1 : 0;
    const ppnPersen = kenaPpn === 1 ? Number(data.ppn_persen || 0) : 0;
    const ppnMetode: "EKSKLUSIF" | "INKLUSIF" =
      data.ppn_metode === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF";
    const dapatDikreditkan = data.dapat_dikreditkan === false ? 0 : 1;
    const ppnBreakdown =
      kenaPpn === 1 && ppnPersen > 0
        ? hitungPpn(total_harga, ppnPersen, ppnMetode)
        : { dpp: total_harga, ppn: 0, total: total_harga };

    const metodePembayaran = normalizePaymentMethod(data.metode_pembayaran);
    const jumlahDibayar = isCashPayment(metodePembayaran) ? total_harga : 0;
    const statusPembayaran = isCashPayment(metodePembayaran) ? "LUNAS" : "HUTANG";

    const sb =
      process.env.TAURI === "true" || process.env.TAURI === "1"
        ? null
        : getServerSupabaseClient();
    if (sb) {
      const preparedItems = data.items.map((item) => {
        const itemId = generateId("pi");
        const subtotal = item.jumlah * item.harga_satuan;
        return {
          id: itemId,
          barang_id: item.barang_id,
          harga_satuan_id: item.harga_satuan_id || null,
          nama_satuan: item.nama_satuan || "",
          faktor_konversi: item.faktor_konversi || 1,
          jumlah: item.jumlah,
          harga_satuan: item.harga_satuan,
          subtotal,
          panjang: item.panjang ?? null,
          lebar: item.lebar ?? null,
          movement_id: `mov-${itemId}`,
        };
      });

      let finance: any = null;
      let debt: any = null;
      if (isCashPayment(metodePembayaran)) {
        const maxOrderResult = await db.query<any>("keuangan", {
          orderBy: { column: "urutan_tampilan", ascending: false },
          limit: 1,
        });
        const nextOrder =
          (maxOrderResult.data?.[0]?.urutan_tampilan || 0) + 1;
        const vendorName = data.vendor_id
          ? (await db.queryOne("vendor", { where: { id: data.vendor_id } })).data
              ?.nama_perusahaan
          : null;
        const catatanTrim = data.catatan?.trim();
        const catatanExcerpt =
          catatanTrim && catatanTrim.length > 0
            ? catatanTrim.substring(0, 25) +
              (catatanTrim.length > 25 ? "..." : "")
            : null;
        const poLabel =
          nomorPembelian && nomorPembelian !== nomorFakturNorm
            ? `${nomorPembelian} / Faktur ${nomorFakturNorm}`
            : `Faktur ${nomorFakturNorm}`;
        let keperluan = `Pembelian ${poLabel}`;
        if (vendorName) {
          keperluan += ` - ${vendorName}`;
        } else if (catatanExcerpt) {
          keperluan += ` (${catatanExcerpt})`;
        }
        keperluan += ` [REF:${purchaseId}]`;
        finance = {
          id: generateId("keu"),
          tanggal: data.tanggal,
          kategori_transaksi: "SUPPLY",
          debit: 0,
          kredit: total_harga,
          keperluan,
          omzet: 0,
          biaya_bahan: 0,
          catatan: data.catatan?.trim() || null,
          dibuat_oleh: data.dibuat_oleh || null,
          urutan_tampilan: nextOrder,
        };
      } else {
        const jatuhTempo =
          metodePembayaran === "NET30"
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0]
            : null;
        debt = {
          id: generateId("hutang"),
          jumlah_hutang: total_harga,
          jumlah_terbayar: 0,
          sisa_hutang: total_harga,
          jatuh_tempo: jatuhTempo,
          status: "AKTIF",
          catatan:
            metodePembayaran === "NET30"
              ? "Tagihan dengan jatuh tempo 30 hari"
              : "Tagihan COD - bayar saat terima barang",
        };
      }

      const { error } = await sb.rpc("create_purchase_with_inventory", {
        payload: {
          purchase: {
            id: purchaseId,
            nomor_pembelian: nomorPembelian,
            nomor_faktur: nomorFakturNorm,
            vendor_id: data.vendor_id,
            tanggal: data.tanggal,
            metode_pembayaran: metodePembayaran,
            total_jumlah: total_harga,
            jumlah_dibayar: jumlahDibayar,
            status_pembayaran: statusPembayaran,
            catatan: data.catatan?.trim() || null,
            dibuat_oleh: data.dibuat_oleh || null,
            diterima_oleh: data.diterima_oleh?.trim() || null,
            tipe_pembelian: "BARANG",
            kena_ppn: kenaPpn,
            ppn_persen: ppnPersen,
            ppn_metode: ppnMetode,
            dapat_dikreditkan: dapatDikreditkan,
            nomor_faktur_pajak_vendor: data.nomor_faktur_pajak_vendor || null,
            tanggal_faktur_pajak: data.tanggal_faktur_pajak || null,
            vendor_npwp_snapshot: data.vendor_npwp_snapshot || null,
          },
          items: preparedItems,
          finance,
          debt,
        },
      });
      if (error) {
        throw new Error(error.message);
      }
      if (isCashPayment(metodePembayaran)) {
        await recalculateCashbookIfAvailable();
      }
      return { id: purchaseId };
    }

    await db.transaction(async () => {
      // Create purchase header
      const purchase = {
        id: purchaseId,
        nomor_pembelian: nomorPembelian,
        nomor_faktur: nomorFakturNorm,
        vendor_id: data.vendor_id,
        tanggal: data.tanggal,
        metode_pembayaran: metodePembayaran,
        total_jumlah: total_harga,
        jumlah_dibayar: jumlahDibayar,
        status_pembayaran: statusPembayaran,
        catatan: data.catatan?.trim() || null,
        dibuat_oleh: data.dibuat_oleh || null,
        diterima_oleh: data.diterima_oleh?.trim() || null,
        kena_ppn: kenaPpn,
        ppn_persen: ppnPersen,
        ppn_metode: ppnMetode,
        dpp_total: ppnBreakdown.dpp,
        ppn_total: ppnBreakdown.ppn,
        dapat_dikreditkan: dapatDikreditkan,
        nomor_faktur_pajak_vendor: data.nomor_faktur_pajak_vendor || null,
        tanggal_faktur_pajak: data.tanggal_faktur_pajak || null,
        vendor_npwp_snapshot: data.vendor_npwp_snapshot || null,
      };

      const purchaseResult = await db.insert("pembelian", purchase);
      if (purchaseResult.error) {
        throw purchaseResult.error;
      }

      // Create items + stock adjustment
      for (const item of data.items) {
        const itemId = generateId("pi");
        const subtotal = item.jumlah * item.harga_satuan;

        // Per-line PPN breakdown — pakai subtotal line, tarif sama dengan
        // header. Kalau kena_ppn=0 maka semua kolom PPN line = 0.
        const lineBreakdown =
          kenaPpn === 1 && ppnPersen > 0
            ? hitungPpn(subtotal, ppnPersen, ppnMetode)
            : { dpp: subtotal, ppn: 0, total: subtotal };
        const lineDppSatuan =
          item.jumlah !== 0 ? lineBreakdown.dpp / item.jumlah : 0;
        const linePpnSatuan =
          item.jumlah !== 0 ? lineBreakdown.ppn / item.jumlah : 0;

        const purchaseItem = {
          id: itemId,
          pembelian_id: purchaseId,
          barang_id: item.barang_id,
          harga_satuan_id: item.harga_satuan_id || null,
          nama_satuan: item.nama_satuan || "",
          faktor_konversi: item.faktor_konversi || 1,
          jumlah: item.jumlah,
          harga_satuan: item.harga_satuan,
          subtotal,
          panjang: item.panjang ?? null,
          lebar: item.lebar ?? null,
          dpp_satuan: lineDppSatuan,
          ppn_satuan: linePpnSatuan,
          dpp_total: lineBreakdown.dpp,
          ppn_total: lineBreakdown.ppn,
        };

        const itemResult = await db.insert("item_pembelian", purchaseItem);
        if (itemResult.error) {
          throw itemResult.error;
        }

        // Inventory unit cost pakai DPP per unit base, supaya HPP bersih
        // dari PPN. PPN masukan akan dikreditkan terpisah saat lapor pajak.
        const faktorKonversi = positiveNumber(item.faktor_konversi) || 1;
        const qtyBase = item.jumlah * faktorKonversi;
        const unitCostDpp =
          qtyBase !== 0 ? lineBreakdown.dpp / qtyBase : 0;
        await postInventoryMovement({
          id: `mov-${itemId}`,
          barang_id: item.barang_id,
          tanggal: data.tanggal,
          movement_type: "PURCHASE_RECEIPT",
          qty_delta: qtyBase,
          unit_cost: unitCostDpp,
          source_type: "PURCHASE",
          source_id: purchaseId,
          source_line_id: itemId,
          catatan: `Penerimaan pembelian ${nomorFakturNorm}`,
          dibuat_oleh: data.dibuat_oleh || null,
        });
      }

      if (isCashPayment(metodePembayaran)) {
        const maxOrderResult = await db.query<any>("keuangan", {
          orderBy: { column: "urutan_tampilan", ascending: false },
          limit: 1,
        });
        const nextOrder =
          (maxOrderResult.data?.[0]?.urutan_tampilan || 0) + 1;

        const vendorName = data.vendor_id
          ? (await db.queryOne("vendor", { where: { id: data.vendor_id } })).data
              ?.nama_perusahaan
          : null;

        const catatanTrim = data.catatan?.trim();
        const catatanExcerpt =
          catatanTrim && catatanTrim.length > 0
            ? catatanTrim.substring(0, 25) +
              (catatanTrim.length > 25 ? "..." : "")
            : null;

        // Build keperluan: show PO number only when it differs from the
        // vendor's faktur number to avoid "inv-002 (inv-002)" duplication.
        const poLabel =
          nomorPembelian && nomorPembelian !== nomorFakturNorm
            ? `${nomorPembelian} / Faktur ${nomorFakturNorm}`
            : `Faktur ${nomorFakturNorm}`;
        let keperluan = `Pembelian ${poLabel}`;
        if (vendorName) {
          keperluan += ` - ${vendorName}`;
        } else if (catatanExcerpt) {
          keperluan += ` (${catatanExcerpt})`;
        }
        keperluan += ` [REF:${purchaseId}]`;

        const financeResult = await db.insert("keuangan", {
          id: generateId("keu"),
          tanggal: data.tanggal,
          kategori_transaksi: "SUPPLY",
          debit: 0,
          kredit: total_harga,
          keperluan,
          biaya_bahan: 0,
          catatan: data.catatan?.trim() || null,
          dibuat_oleh: data.dibuat_oleh || null,
          urutan_tampilan: nextOrder,
        });
        if (financeResult.error) {
          throw financeResult.error;
        }
      } else {
        const jatuhTempo =
          metodePembayaran === "NET30"
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0]
            : null;

        const debtResult = await db.insert("hutang_pembelian", {
          id: generateId("hutang"),
          id_pembelian: purchaseId,
          jumlah_hutang: total_harga,
          jumlah_terbayar: 0,
          sisa_hutang: total_harga,
          jatuh_tempo: jatuhTempo,
          status: "AKTIF",
          catatan:
            metodePembayaran === "NET30"
              ? "Tagihan dengan jatuh tempo 30 hari"
              : "Tagihan COD - bayar saat terima barang",
        });
        if (debtResult.error) {
          throw debtResult.error;
        }
      }
    });

    if (isCashPayment(metodePembayaran)) {
      await recalculateCashbookIfAvailable();
    }

    return { id: purchaseId };
  } catch (error: any) {
    console.error("Error creating purchase:", error);
    throw error;
  }
}

/**
 * Create a maklon (subcontract) purchase order linked to a sale.
 *
 * One call per (vendor, payment method) group on a sale — so a single sale
 * can produce multiple maklon POs if it spans multiple vendors or mixes
 * CASH+NET30 to the same vendor.
 *
 * Inserts:
 *   - 1 pembelian row with `tipe_pembelian='MAKLON'` and `penjualan_id_sumber`
 *   - 1 item_pembelian row per maklon line (placeholder barang `barang-jasa-maklon`,
 *     skips moving-average since maklon is not stocked inventory)
 *   - CASH: 1 keuangan row (kategori `MAKLON`, kredit) with `[REF:<purchaseId>]`
 *   - NET30: 1 hutang_pembelian row (jatuh_tempo +30 days)
 *
 * Returns the new pembelian.id so the caller can link
 * `item_penjualan.pembelian_id_terkait` for each maklon line in the group.
 */
export async function createMaklonPurchase(input: {
  saleId: string;
  saleInvoiceNumber: string;
  vendorId: string;
  metodeBayar: "CASH" | "NET30";
  tanggal: string;
  catatan?: string;
  dibuatOleh?: string | null;
  /** One entry per maklon line in this vendor+payment group. */
  items: Array<{
    deskripsi_pekerjaan: string;
    jumlah: number;
    biaya_subkontrak: number;
  }>;
}): Promise<{ id: string }> {
  if (!input.vendorId) {
    throw new Error("Vendor subkontraktor wajib dipilih untuk maklon");
  }
  if (!input.items || input.items.length === 0) {
    throw new Error("Item maklon kosong");
  }
  if (input.items.some((it) => !(it.biaya_subkontrak > 0))) {
    throw new Error("Biaya subkontrak harus lebih dari 0");
  }
  if (input.metodeBayar !== "CASH" && input.metodeBayar !== "NET30") {
    throw new Error(`Metode bayar vendor tidak valid: ${input.metodeBayar}`);
  }

  const purchaseId = generateId("maklon");
  const nomorPembelian = await nextNomorPembelianMaklon();
  // Auto-generated faktur number; user can edit later when the vendor sends
  // a real invoice. Always unique because saleInvoiceNumber + groupSeq is
  // unique per (vendor, payment method) group.
  const groupSeq = `${input.vendorId.slice(0, 6)}-${input.metodeBayar}`;
  const nomorFaktur = `MAKLON-${input.saleInvoiceNumber}-${groupSeq}`;

  const totalHarga = input.items.reduce(
    (sum, it) => sum + it.biaya_subkontrak,
    0
  );
  const jumlahDibayar = input.metodeBayar === "CASH" ? totalHarga : 0;
  const statusPembayaran = input.metodeBayar === "CASH" ? "LUNAS" : "HUTANG";

  await db.transaction(async () => {
    const purchase = {
      id: purchaseId,
      nomor_pembelian: nomorPembelian,
      nomor_faktur: nomorFaktur,
      vendor_id: input.vendorId,
      tanggal: input.tanggal,
      metode_pembayaran: input.metodeBayar,
      total_jumlah: totalHarga,
      jumlah_dibayar: jumlahDibayar,
      status_pembayaran: statusPembayaran,
      catatan:
        input.catatan?.trim() ||
        `Maklon untuk ${input.saleInvoiceNumber}`,
      dibuat_oleh: input.dibuatOleh || null,
      diterima_oleh: null,
      tipe_pembelian: "MAKLON",
      penjualan_id_sumber: input.saleId,
    };

    const purchaseResult = await db.insert("pembelian", purchase);
    if (purchaseResult.error) throw purchaseResult.error;

    // Insert line items pointing at the placeholder barang. We do NOT call
    // applyPurchaseCostToMaterial — maklon is not stocked inventory.
    for (const item of input.items) {
      const itemId = generateId("pi");
      const subtotal =
        item.jumlah > 0 ? item.biaya_subkontrak : item.biaya_subkontrak;
      const hargaSatuan =
        item.jumlah > 0 ? item.biaya_subkontrak / item.jumlah : item.biaya_subkontrak;

      const purchaseItem = {
        id: itemId,
        pembelian_id: purchaseId,
        barang_id: "barang-jasa-maklon",
        harga_satuan_id: "harga-jasa-maklon-pcs",
        nama_satuan: "pcs",
        faktor_konversi: 1,
        jumlah: item.jumlah > 0 ? item.jumlah : 1,
        harga_satuan: hargaSatuan,
        subtotal,
        panjang: null,
        lebar: null,
      };

      const itemResult = await db.insert("item_pembelian", purchaseItem);
      if (itemResult.error) throw itemResult.error;
    }

    if (input.metodeBayar === "CASH") {
      const maxOrderResult = await db.query<any>("keuangan", {
        orderBy: { column: "urutan_tampilan", ascending: false },
        limit: 1,
      });
      const nextOrder =
        (maxOrderResult.data?.[0]?.urutan_tampilan || 0) + 1;

      const vendorRow = await db.queryOne<{ nama_perusahaan: string }>(
        "vendor",
        { where: { id: input.vendorId } }
      );
      const vendorName = vendorRow.data?.nama_perusahaan || "Vendor Maklon";

      const keperluan = `Maklon ${input.saleInvoiceNumber} - ${vendorName} [REF:${purchaseId}]`;

      const financeResult = await db.insert("keuangan", {
        id: generateId("keu"),
        tanggal: input.tanggal,
        kategori_transaksi: "MAKLON",
        debit: 0,
        kredit: totalHarga,
        keperluan,
        biaya_bahan: 0,
        catatan:
          input.catatan?.trim() || `Maklon ke ${vendorName}`,
        dibuat_oleh: input.dibuatOleh || null,
        urutan_tampilan: nextOrder,
      });
      if (financeResult.error) throw financeResult.error;
    } else {
      const jatuhTempo = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const debtResult = await db.insert("hutang_pembelian", {
        id: generateId("hutang"),
        id_pembelian: purchaseId,
        jumlah_hutang: totalHarga,
        jumlah_terbayar: 0,
        sisa_hutang: totalHarga,
        jatuh_tempo: jatuhTempo,
        status: "AKTIF",
        catatan: `Tagihan maklon ${input.saleInvoiceNumber} - jatuh tempo 30 hari`,
      });
      if (debtResult.error) throw debtResult.error;
    }
  });

  // No recalc here — the caller (createSale) triggers recalc once at the end
  // for the whole transaction.
  return { id: purchaseId };
}

/**
 * Delete every maklon purchase that was auto-created for a given sale.
 * Reverses linked finance entries (via [REF:<purchaseId>]) and outstanding
 * hutang rows. Used by deleteSale to keep the books consistent.
 */
export async function deleteMaklonPurchasesForSale(
  saleId: string
): Promise<number> {
  const rows = await db.query<any>("pembelian", {
    where: { penjualan_id_sumber: saleId, tipe_pembelian: "MAKLON" },
  });
  const purchases = rows.data || [];
  if (purchases.length === 0) return 0;

  for (const purchase of purchases) {
    await voidPurchase(
      purchase.id,
      `Pembelian maklon dibatalkan karena penjualan ${saleId} dibatalkan`
    );
  }

  return purchases.length;
}

/**
 * Get single purchase by ID
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
 * Update an existing purchase
 */
export async function updatePurchase(
  id: string,
  data: {
    nomor_pembelian: string;
    nomor_faktur: string;
    vendor_id: string | null;
    tanggal: string;
    metode_pembayaran: string;
    catatan?: string;
    diterima_oleh?: string;
    items: Array<{
      barang_id: string;
      harga_satuan_id: string;
      nama_satuan: string;
      faktor_konversi: number;
      jumlah: number;
      harga_satuan: number;
      panjang?: number | null;
      lebar?: number | null;
    }>;
  }
): Promise<{ id: string }> {
  try {
    // Validate
    if (!data.nomor_faktur?.trim()) {
      throw new Error("Nomor faktur harus diisi");
    }

    if (!data.items || data.items.length === 0) {
      throw new Error("Minimal harus ada 1 item pembelian");
    }

    // Check if purchase exists
    const existing = await db.queryOne("pembelian", { where: { id } });
    if (existing.error || !existing.data) {
      throw new Error("Pembelian tidak ditemukan");
    }

    if ((existing.data as any).status_transaksi === "VOIDED") {
      throw new Error("Pembelian yang sudah dibatalkan tidak dapat diedit");
    }

    const existingMovements = await getInventoryMovements({
      source_type: "PURCHASE",
      source_id: id,
    });
    if (existingMovements.length > 0) {
      throw new Error(
        "Pembelian yang sudah masuk stok tidak dapat diedit langsung. Batalkan pembelian lalu buat ulang agar riwayat stok tetap rapi."
      );
    }

    // Calculate new total
    const total_harga = data.items.reduce(
      (sum, item) => sum + item.jumlah * item.harga_satuan,
      0
    );

    // Get old items to reverse stock
    const oldItemsResult = await db.query<PurchaseItem>("item_pembelian", {
      where: { pembelian_id: id },
    });
    const oldItems = oldItemsResult.data || [];

    // Reverse old stock and inventory value changes
    for (const oldItem of oldItems) {
      await reversePurchaseCostFromMaterial(oldItem);
    }

    // Delete old items
    for (const oldItem of oldItems) {
      await db.delete("item_pembelian", oldItem.id);
    }

    // Update purchase header
    const metodePembayaran = normalizePaymentMethod(data.metode_pembayaran);
    const jumlahDibayar = isCashPayment(metodePembayaran) ? total_harga : 0;
    const statusPembayaran = isCashPayment(metodePembayaran) ? "LUNAS" : "HUTANG";

    const purchaseUpdate = {
      nomor_pembelian: data.nomor_pembelian,
      nomor_faktur: data.nomor_faktur.trim(),
      vendor_id: data.vendor_id,
      tanggal: data.tanggal,
      total_jumlah: total_harga,
      jumlah_dibayar: jumlahDibayar,
      metode_pembayaran: metodePembayaran,
      status_pembayaran: statusPembayaran,
      catatan: data.catatan?.trim() || null,
      diterima_oleh: data.diterima_oleh?.trim() || null,
    };

    const updateResult = await db.update("pembelian", id, purchaseUpdate);
    if (updateResult.error) {
      throw updateResult.error;
    }

    // Insert new items
    for (const item of data.items) {
      const itemId = `pi-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const subtotal = item.jumlah * item.harga_satuan;

      const purchaseItem = {
        id: itemId,
        pembelian_id: id,
        barang_id: item.barang_id,
        harga_satuan_id: item.harga_satuan_id,
        nama_satuan: item.nama_satuan,
        faktor_konversi: item.faktor_konversi,
        jumlah: item.jumlah,
        harga_satuan: item.harga_satuan,
        subtotal,
        panjang: item.panjang ?? null,
        lebar: item.lebar ?? null,
      };

      const itemResult = await db.insert("item_pembelian", purchaseItem);
      if (itemResult.error) {
        console.error("Failed to insert purchase item:", itemResult.error);
      }

      const faktorKonversi = positiveNumber(item.faktor_konversi) || 1;
      await postInventoryMovement({
        id: `mov-${itemId}`,
        barang_id: item.barang_id,
        tanggal: data.tanggal,
        movement_type: "PURCHASE_RECEIPT",
        qty_delta: item.jumlah * faktorKonversi,
        unit_cost: positiveNumber(item.harga_satuan) / faktorKonversi,
        source_type: "PURCHASE",
        source_id: id,
        source_line_id: itemId,
        catatan: `Penerimaan pembelian ${data.nomor_faktur}`,
      });
    }

    // Update keuangan entry if exists (for LUNAS purchases)
    const nomorFakturUpdate = data.nomor_faktur || data.nomor_pembelian;
    const poLabelUpdate =
      data.nomor_pembelian && data.nomor_pembelian !== nomorFakturUpdate
        ? `${data.nomor_pembelian} / Faktur ${nomorFakturUpdate}`
        : `Faktur ${nomorFakturUpdate}`;
    const keperluanText = `Pembelian ${poLabelUpdate} [REF:${id}]`;

    const keuAllForRef = await db.query<any>("keuangan", {});
    const matchingKeu = (keuAllForRef.data || []).filter((e: any) =>
      String(e.keperluan || "").includes(`[REF:${id}]`)
    );

    if (matchingKeu.length > 0) {
      const keuanganId = matchingKeu[0].id;
      await db.update("keuangan", keuanganId, {
        tanggal: data.tanggal,
        keperluan: keperluanText,
        kredit: total_harga,
        biaya_bahan: 0,
        catatan: data.catatan || null,
      });
    }

    await recalculateCashbookIfAvailable();

    return { id };
  } catch (error) {
    console.error("Error updating purchase:", error);
    throw error;
  }
}

/**
 * Get all purchases with outstanding debt
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

export async function voidPurchase(
  id: string,
  reason: string = "Pembelian dibatalkan",
  actorId?: string | null
): Promise<void> {
  try {
    const sb =
      process.env.TAURI === "true" || process.env.TAURI === "1"
        ? null
        : getServerSupabaseClient();
    if (sb) {
      const { error } = await sb.rpc("void_purchase_with_inventory", {
        purchase_id: id,
        reason,
        actor_id: actorId || null,
      });
      if (error) {
        const friendly = error.message.includes("Stok tidak cukup")
          ? `Stok dari pembelian ini sudah dipakai. Gunakan Retur/Adjustment atau batalkan transaksi penjualan terkait dulu. Detail: ${error.message}`
          : error.message;
        throw new Error(friendly);
      }
      await recalculateCashbookIfAvailable();
      return;
    }

    const purchase = await getPurchaseById(id);
    if (!purchase) {
      throw new Error("Pembelian tidak ditemukan");
    }
    if ((purchase as any).status_transaksi === "VOIDED") {
      throw new Error("Pembelian sudah dibatalkan");
    }

    const hutangRow = await db.queryOne<any>("hutang_pembelian", {
      where: { id_pembelian: id },
    });
    if (hutangRow.data) {
      const payments = await db.query<any>("pelunasan_hutang", {
        where: { id_hutang: hutangRow.data.id },
      });
      if ((payments.data || []).length > 0) {
        throw new Error(
          "Pembelian sudah memiliki pembayaran tagihan. Revert pembayaran dulu sebelum membatalkan pembelian."
        );
      }
    }

    // Get items to reverse stock
    const itemsResult = await db.query<PurchaseItem>("item_pembelian", {
      where: { pembelian_id: id },
    });

    const items = itemsResult.data || [];
    const movements = await getInventoryMovements({
      source_type: "PURCHASE",
      source_id: id,
    });

    // Append reversal movements. If stock has already been consumed, this
    // throws a friendly insufficient-stock error and leaves the purchase posted.
    for (const item of items) {
      const original = movements.find((movement) => {
        return (
          movement.source_line_id === item.id &&
          movement.movement_type === "PURCHASE_RECEIPT"
        );
      });
      const faktorKonversi = positiveNumber(item.faktor_konversi) || 1;
      const qtyBase = original
        ? Math.abs(Number(original.qty_delta || 0))
        : item.jumlah * faktorKonversi;
      const unitCost = original
        ? Number(original.unit_cost || 0)
        : positiveNumber(item.harga_satuan) / faktorKonversi;

      try {
        await postInventoryMovement({
          id: original ? `void-${original.id}` : `void-${item.id}`,
          barang_id: item.barang_id,
          tanggal: new Date().toISOString().split("T")[0],
          movement_type: "PURCHASE_VOID",
          qty_delta: -qtyBase,
          unit_cost: unitCost,
          source_type: "PURCHASE_VOID",
          source_id: id,
          source_line_id: item.id,
          reversal_of_id: original?.id || null,
          catatan: reason,
          dibuat_oleh: actorId || null,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Stok dari pembelian ini sudah dipakai. Gunakan retur/adjustment atau batalkan transaksi penjualan terkait dulu. Detail: ${msg}`
        );
      }
    }

    // Void linked cashbook entries by reference (works on Supabase + SQLite)
    const linkedCashbook = await db.query("keuangan", {});
    if (linkedCashbook.data) {
      const toVoid = linkedCashbook.data.filter((entry: any) =>
        String(entry.keperluan || "").includes(`[REF:${id}]`)
      );
      for (const entry of toVoid) {
        const voidResult = await db.update("keuangan", entry.id, {
          status_transaksi: "VOIDED",
          voided_at: new Date().toISOString(),
          voided_by: actorId || null,
          void_reason: reason,
        });
        if (voidResult.error) throw voidResult.error;
      }
    }

    if (hutangRow.data) {
      const debtVoid = await db.update("hutang_pembelian", hutangRow.data.id, {
        jumlah_terbayar: 0,
        sisa_hutang: 0,
        status: "LUNAS",
        catatan: `${hutangRow.data.catatan || ""} (Pembelian dibatalkan)`.trim(),
      });
      if (debtVoid.error) throw debtVoid.error;
    }

    const result = await db.update("pembelian", id, {
      status_transaksi: "VOIDED",
      voided_at: new Date().toISOString(),
      voided_by: actorId || null,
      void_reason: reason,
    });
    if (result.error) throw result.error;

    await recalculateCashbookIfAvailable();
  } catch (error) {
    console.error("Error voiding purchase:", error);
    throw error;
  }
}

/**
 * Compatibility wrapper: old callers still ask to delete, but posted
 * purchases are now voided so inventory history remains auditable.
 */
export async function deletePurchase(id: string): Promise<void> {
  return voidPurchase(id, "Pembelian dibatalkan");
}

/**
 * Revert payment - change purchase from LUNAS back to HUTANG
 */
export async function revertPayment(
  purchaseId: string
): Promise<{ payments_deleted: number }> {
  try {
    const purchase = await getPurchaseById(purchaseId);
    if (!purchase) {
      throw new Error("Pembelian tidak ditemukan");
    }

    if ((purchase.status_pembayaran || "").toUpperCase() !== "LUNAS") {
      throw new Error(
        "Hanya pembelian dengan status LUNAS yang dapat direvert ke HUTANG"
      );
    }

    if (isCashPayment(purchase.metode_pembayaran)) {
      throw new Error(
        "Pembelian dengan metode TUNAI tidak dapat direvert. Hapus saja pembelian jika salah."
      );
    }

    const hutangRow = await db.queryOne<any>("hutang_pembelian", {
      where: { id_pembelian: purchaseId },
    });
    const hutangRecord = hutangRow.data;
    if (!hutangRecord) {
      throw new Error("Data hutang tidak ditemukan");
    }

    const pelunasanList = await db.query<any>("pelunasan_hutang", {
      where: { id_hutang: hutangRecord.id },
    });
    const payments_deleted = pelunasanList.data?.length || 0;

    if (payments_deleted === 0) {
      throw new Error("Tidak ada catatan pembayaran yang ditemukan");
    }

    for (const row of pelunasanList.data || []) {
      const del = await db.delete("pelunasan_hutang", row.id);
      if (del.error) throw del.error;
    }

    const keuAll = await db.query<any>("keuangan", {});
    const nomorFaktur = String(purchase.nomor_faktur || "");
    const toDelKeu = (keuAll.data || []).filter(
      (k: any) =>
        k.kategori_transaksi === "SUPPLY" &&
        String(k.keperluan || "").includes(nomorFaktur)
    );
    for (const k of toDelKeu) {
      const delK = await db.delete("keuangan", k.id);
      if (delK.error) throw delK.error;
    }

    const jumlahHutang = Number(
      hutangRecord.jumlah_hutang ??
        (purchase as any).total_jumlah ??
        purchase.total_harga ??
        0
    );

    await db.update("hutang_pembelian", hutangRecord.id, {
      jumlah_terbayar: 0,
      sisa_hutang: jumlahHutang,
      status: "AKTIF",
    });

    await db.update("pembelian", purchaseId, {
      jumlah_dibayar: 0,
      status_pembayaran: "HUTANG",
    });

    await recalculateCashbookIfAvailable();

    return { payments_deleted };
  } catch (error) {
    console.error("Error reverting payment:", error);
    throw error;
  }
}

/**
 * Pay debt for a purchase
 */
export async function payDebt(data: {
  purchase_id: string;
  jumlah_bayar: number;
  tanggal_bayar?: string;
  metode_pembayaran?: string;
  referensi?: string;
  catatan?: string;
  dibuat_oleh?: string;
}): Promise<{ status: string; sisa_hutang: number }> {
  try {
    // Validate
    if (!data.purchase_id) {
      throw new Error("ID pembelian harus diisi");
    }

    if (!data.jumlah_bayar || data.jumlah_bayar <= 0) {
      throw new Error("Jumlah pembayaran harus lebih dari 0");
    }

    // Get purchase
    const purchase = await getPurchaseById(data.purchase_id);
    if (!purchase) {
      throw new Error("Pembelian tidak ditemukan");
    }

    // Validate payment amount
    const sisaHutang = purchase.total_harga - (purchase.jumlah_dibayar || 0);
    if (data.jumlah_bayar > sisaHutang) {
      throw new Error("Jumlah pembayaran melebihi sisa hutang");
    }

    // Calculate new values
    const newJumlahDibayar = (purchase.jumlah_dibayar || 0) + data.jumlah_bayar;
    const newSisaHutang = purchase.total_harga - newJumlahDibayar;
    const newStatus = newSisaHutang <= 0 ? "LUNAS" : "SEBAGIAN";

    const purchaseTotal = Number(
      (purchase as any).total_jumlah ?? purchase.total_harga ?? 0
    );

    // Get or create hutang_pembelian record
    const hutangRow = await db.queryOne<any>("hutang_pembelian", {
      where: { id_pembelian: data.purchase_id },
    });

    let hutangId = hutangRow.data?.id as string | undefined;

    if (!hutangId) {
      hutangId = `hutang-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      await db.insert("hutang_pembelian", {
        id: hutangId,
        id_pembelian: data.purchase_id,
        jumlah_hutang: purchaseTotal,
        jumlah_terbayar: 0,
        sisa_hutang: purchaseTotal,
        status: "AKTIF",
      });
    }

    // Insert pelunasan_hutang record
    const pelunasanId = `pelunasan-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    await db.insert("pelunasan_hutang", {
      id: pelunasanId,
      id_hutang: hutangId,
      tanggal_bayar:
        data.tanggal_bayar || new Date().toISOString().split("T")[0],
      jumlah_bayar: data.jumlah_bayar,
      metode_pembayaran: normalizePaymentMethod(data.metode_pembayaran),
      referensi: data.referensi?.trim() || null,
      catatan: data.catatan?.trim() || null,
      dibuat_oleh: data.dibuat_oleh || null,
    });

    await db.update("hutang_pembelian", hutangId, {
      jumlah_terbayar: newJumlahDibayar,
      sisa_hutang: newSisaHutang,
      status: newSisaHutang <= 0 ? "LUNAS" : "AKTIF",
    });

    // Update pembelian
    await db.update("pembelian", data.purchase_id, {
      jumlah_dibayar: newJumlahDibayar,
      status_pembayaran: newStatus,
    });

    // Create keuangan entry (SUPPLY category)
    const maxOrderResult = await db.query<any>("keuangan", {
      orderBy: { column: "urutan_tampilan", ascending: false },
      limit: 1,
    });
    const nextOrder =
      (maxOrderResult.data?.[0]?.urutan_tampilan || 0) + 1;

    // Get vendor info
    const vendorResult = purchase.vendor_id
      ? await db.queryOne<any>("vendor", {
          where: { id: purchase.vendor_id },
        })
      : { data: null };
    const vendor = vendorResult.data;

    const keperluan = `Pembayaran Hutang ${purchase.nomor_faktur}${
      vendor ? ` - ${vendor.nama_perusahaan}` : ""
    }${data.referensi ? ` (Ref: ${data.referensi})` : ""} [REF:${
      data.purchase_id
    }]`;

    // Use MAKLON category when paying off a maklon vendor PO so the cashbook
    // reports it under "Biaya Maklon" instead of "Supply". For regular
    // BARANG purchases, keep the legacy SUPPLY category.
    const kategoriPembayaran =
      (purchase as any).tipe_pembelian === "MAKLON" ? "MAKLON" : "SUPPLY";

    await db.insert("keuangan", {
      id: `keu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tanggal: data.tanggal_bayar || new Date().toISOString().split("T")[0],
      kategori_transaksi: kategoriPembayaran,
      debit: 0,
      kredit: data.jumlah_bayar,
      keperluan,
      biaya_bahan: 0,
      catatan:
        data.catatan || `Pelunasan ${newStatus} - ${purchase.nomor_faktur}`,
      dibuat_oleh: data.dibuat_oleh || null,
      urutan_tampilan: nextOrder,
    });

    await recalculateCashbookIfAvailable();

    return {
      status: newStatus,
      sisa_hutang: newSisaHutang,
    };
  } catch (error) {
    console.error("Error paying debt:", error);
    throw error;
  }
}

/**
 * Retur Vendor: kembalikan sebagian (atau seluruh) qty dari pembelian POSTED
 * ke vendor. Membuat movement PURCHASE_RETURN (qty negatif) per line yang
 * dipilih user.
 *
 * Berbeda dari void:
 *   - Pembelian tetap POSTED, tidak di-flip ke VOIDED.
 *   - Hanya line yang user pilih yang dikembalikan, partial allowed.
 *   - Stok yang dikembalikan dievaluasi pakai movement asli (PURCHASE_RECEIPT)
 *     untuk dapat unit_cost yang dipakai saat receipt.
 *   - Kalau qty current < qty retur (sudah dipakai jual), throw friendly error.
 *
 * Belum di-handle (out of scope v1):
 *   - Pengurangan kewajiban hutang vendor (user lakukan manual via revert).
 *   - Penyesuaian PPN masukan (kalau pembelian kena PPN, retur juga harus
 *     bikin nota retur PPN. Untuk sekarang user lakukan manual lewat Coretax).
 */
export async function createPurchaseReturn(input: {
  purchase_id: string;
  reason: string;
  actor_id?: string | null;
  /** Per line: id_item_pembelian + qty yang akan di-retur (dalam satuan jumlah, bukan base unit). */
  items: Array<{ item_pembelian_id: string; qty: number }>;
}): Promise<{ ok: true; total_retur_value: number }> {
  if (!input.reason?.trim()) {
    throw new Error("Alasan retur wajib diisi");
  }
  if (!input.items?.length) {
    throw new Error("Minimal satu line untuk retur");
  }

  const purchase = await getPurchaseById(input.purchase_id);
  if (!purchase) {
    throw new Error("Pembelian tidak ditemukan");
  }
  if ((purchase as any).status_transaksi === "VOIDED") {
    throw new Error("Pembelian sudah dibatalkan, tidak bisa di-retur");
  }

  // Load items + movements pembelian
  const itemsRes = await db.query<any>("item_pembelian", {
    where: { pembelian_id: input.purchase_id },
  });
  if (itemsRes.error) throw itemsRes.error;
  const items = itemsRes.data || [];
  const movements = await getInventoryMovements({
    source_type: "PURCHASE",
    source_id: input.purchase_id,
  });

  let totalReturValue = 0;

  for (const reqLine of input.items) {
    if (!reqLine.qty || reqLine.qty <= 0) continue;
    const item = items.find((it: any) => it.id === reqLine.item_pembelian_id);
    if (!item) {
      throw new Error(`Item pembelian ${reqLine.item_pembelian_id} tidak ditemukan`);
    }
    const original = movements.find(
      (m) =>
        m.source_line_id === item.id && m.movement_type === "PURCHASE_RECEIPT"
    );
    const faktorKonversi = positiveNumber(item.faktor_konversi) || 1;
    const qtyBaseRetur = reqLine.qty * faktorKonversi;
    if (qtyBaseRetur > Math.abs(Number(original?.qty_delta || 0))) {
      throw new Error(
        `Retur ${item.id}: qty ${reqLine.qty} melebihi qty pembelian ${
          (Number(original?.qty_delta || 0) / faktorKonversi).toFixed(2)
        }`
      );
    }
    const unitCost = original
      ? Number(original.unit_cost || 0)
      : positiveNumber(item.harga_satuan) / faktorKonversi;

    try {
      await postInventoryMovement({
        id: `ret-${item.id}-${Date.now()}`,
        barang_id: item.barang_id,
        tanggal: new Date().toISOString().split("T")[0],
        movement_type: "PURCHASE_RETURN",
        qty_delta: -qtyBaseRetur,
        unit_cost: unitCost,
        source_type: "PURCHASE_RETURN",
        source_id: input.purchase_id,
        source_line_id: item.id,
        reversal_of_id: original?.id || null,
        catatan: `Retur ke vendor: ${input.reason.trim()}`,
        dibuat_oleh: input.actor_id || null,
      });
      totalReturValue += qtyBaseRetur * unitCost;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Retur ${item.id}: stok tidak cukup. ${msg}. Stok dari pembelian ini sudah dipakai untuk penjualan; batalkan transaksi penjualan terkait dulu, atau retur lebih sedikit.`
      );
    }
  }

  await recalculateCashbookIfAvailable();
  return { ok: true, total_retur_value: totalReturValue };
}
