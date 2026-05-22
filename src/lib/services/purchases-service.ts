/**
 * Purchases Service
 * Universal API for Purchases on Tauri and Web
 */

import "server-only";

import { db, getServerSupabaseClient } from "../db-unified";
import { fetchLastNomorPembelian } from "../server-data-supabase";

async function recalculateCashbookIfAvailable(): Promise<void> {
  try {
    const sqlite = await db.getNativeSQLite();
    if (!sqlite) return;
    const { recalculateCashbook } = await import("@/lib/ast/cashbook-recalc");
    await recalculateCashbook(sqlite);
  } catch (e) {
    console.warn("recalculateCashbook skipped:", e);
  }
}

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
  const vendorMap = new Map<string, string>();
  await Promise.all(
    vendorIds.map(async (vid) => {
      const v = await db.queryOne<{ nama_perusahaan: string }>("vendor", {
        where: { id: vid },
        select: "nama_perusahaan",
      });
      if (v.data?.nama_perusahaan)
        vendorMap.set(vid, v.data.nama_perusahaan);
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

    return {
      ...purchase,
      vendor_name: vid ? vendorMap.get(vid) : undefined,
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
  tanggal: string;
  metode_pembayaran: string;
  total_harga: number;
  jumlah_dibayar?: number;
  status_pembayaran: string;
  catatan?: string;
  dibuat_oleh?: string;
  created_by_name?: string;
  dibuat_pada?: string;
  diperbarui_pada?: string;
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

    // Calculate total
    const total_harga = data.items.reduce(
      (sum, item) => sum + item.jumlah * item.harga_satuan,
      0
    );

    const metodePembayaran = normalizePaymentMethod(data.metode_pembayaran);
    const jumlahDibayar = isCashPayment(metodePembayaran) ? total_harga : 0;
    const statusPembayaran = isCashPayment(metodePembayaran) ? "LUNAS" : "HUTANG";

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
      };

      const purchaseResult = await db.insert("pembelian", purchase);
      if (purchaseResult.error) {
        throw purchaseResult.error;
      }

      // Create items + stock adjustment
      for (const item of data.items) {
        const itemId = generateId("pi");
        const subtotal = item.jumlah * item.harga_satuan;

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
        };

        const itemResult = await db.insert("item_pembelian", purchaseItem);
        if (itemResult.error) {
          throw itemResult.error;
        }

        const materialResult = await db.queryOne("barang", {
          where: { id: item.barang_id },
        });
        const material = materialResult.data as Record<string, unknown> | null;

        if (!material) {
          throw new Error(`Barang tidak ditemukan: ${item.barang_id}`);
        }

        const jumlahDalamSatuanDasar =
          item.jumlah * (item.faktor_konversi || 1);
        const newStock =
          (Number(material.jumlah_stok) || 0) + jumlahDalamSatuanDasar;

        const stockResult = await db.update("barang", item.barang_id, {
          jumlah_stok: newStock,
          diperbarui_pada: new Date().toISOString(),
        });
        if (stockResult.error) {
          throw stockResult.error;
        }

        if (item.harga_satuan_id && item.faktor_konversi) {
          const pricePerBaseUnit = item.harga_satuan / item.faktor_konversi;
          const upsRes = await db.query<{ id: string; faktor_konversi: number }>(
            "harga_barang_satuan",
            {
              where: { barang_id: item.barang_id },
            }
          );
          if (upsRes.error) throw upsRes.error;
          for (const up of upsRes.data || []) {
            const newPrice = pricePerBaseUnit * up.faktor_konversi;
            const upd = await db.update("harga_barang_satuan", up.id, {
              harga_beli: newPrice,
              diperbarui_pada: new Date().toISOString(),
            });
            if (upd.error) throw upd.error;
          }
        }
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

        let keperluan = `Pembelian ${nomorPembelian} (${nomorFakturNorm})`;
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
          biaya_bahan: total_harga,
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

    // Reverse old stock changes
    for (const oldItem of oldItems) {
      const materialResult = await db.query("barang", {
        where: { id: oldItem.barang_id },
      });
      const material = materialResult.data?.[0];

      if (material && material.lacak_inventori_status) {
        const stockToRemove = oldItem.jumlah * oldItem.faktor_konversi;
        const newStock = (material.jumlah_stok || 0) - stockToRemove;

        await db.update("barang", oldItem.barang_id, {
          jumlah_stok: newStock,
        });
      }
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

      // Add new stock
      const materialResult = await db.query("barang", {
        where: { id: item.barang_id },
      });
      const material = materialResult.data?.[0];

      if (material && material.lacak_inventori_status) {
        const jumlahDalamSatuanDasar = item.jumlah * item.faktor_konversi;
        const newStock = (material.jumlah_stok || 0) + jumlahDalamSatuanDasar;

        await db.update("barang", item.barang_id, {
          jumlah_stok: newStock,
        });
      }

      // Update harga_beli in harga_barang_satuan if exists
      if (item.harga_satuan_id) {
        await db.update("harga_barang_satuan", item.harga_satuan_id, {
          harga_beli: item.harga_satuan,
        });
      }
    }

    // Update keuangan entry if exists (for LUNAS purchases)
    const keperluanText = `Pembelian ${data.nomor_pembelian} (${
      data.nomor_faktur || data.nomor_pembelian
    }) [REF:${id}]`;

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
        biaya_bahan: total_harga,
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

/**
 * Delete purchase with stock reversal
 */
export async function deletePurchase(id: string): Promise<void> {
  try {
    // Get items to reverse stock
    const itemsResult = await db.query<PurchaseItem>("item_pembelian", {
      where: { pembelian_id: id },
    });

    const items = itemsResult.data || [];

    // Reverse stock changes
    for (const item of items) {
      const materialResult = await db.query("barang", {
        where: { id: item.barang_id },
      });
      const material = materialResult.data?.[0];

      if (material && material.lacak_inventori_status) {
        const stockToRemove = item.jumlah * item.faktor_konversi;
        const newStock = (material.jumlah_stok || 0) - stockToRemove;

        await db.update("barang", item.barang_id, {
          jumlah_stok: Math.max(0, newStock),
        });
      }
    }

    // Delete linked cashbook entries by reference (works on Supabase + SQLite)
    const linkedCashbook = await db.query("keuangan", {});
    if (linkedCashbook.data) {
      const toDelete = linkedCashbook.data.filter((entry: any) =>
        String(entry.keperluan || "").includes(`[REF:${id}]`)
      );
      for (const entry of toDelete) {
        const delResult = await db.delete("keuangan", entry.id);
        if (delResult.error) throw delResult.error;
      }
    }

    // Delete purchase items by record id (works on Supabase + SQLite)
    for (const item of items) {
      const delItemResult = await db.delete("item_pembelian", item.id);
      if (delItemResult.error) throw delItemResult.error;
    }

    // Delete purchase
    const result = await db.delete("pembelian", id);
    if (result.error) throw result.error;

    await recalculateCashbookIfAvailable();
  } catch (error) {
    console.error("Error deleting purchase:", error);
    throw error;
  }
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

    await db.insert("keuangan", {
      id: `keu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tanggal: data.tanggal_bayar || new Date().toISOString().split("T")[0],
      kategori_transaksi: "SUPPLY",
      debit: 0,
      kredit: data.jumlah_bayar,
      keperluan,
      biaya_bahan: data.jumlah_bayar,
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
