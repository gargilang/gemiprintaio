import "server-only";

import { db } from "@/lib/db-unified";
import {
  createPurchaseOrder,
  type PurchaseOrderItemInput,
  type PurchaseOrderStatus,
} from "./purchase-order-service";
import { numeric, positiveNumber } from "./document-number-service";

export interface ReorderSuggestion {
  barang_id: string;
  barang_nama: string;
  satuan_dasar: string;
  butuh_dimensi_status: number;
  jumlah_stok: number;
  level_stok_minimum: number;
  /** qty pesan default dalam base unit (m2 untuk dimensional, satuan_dasar untuk lainnya). */
  suggested_qty: number;
  /** qty yang sudah ada di PO pending (DRAFT/SENT/PARTIAL_RECEIVED) untuk barang ini. */
  pending_po_qty: number;
  suggested_vendor_id: string | null;
  suggested_vendor_name: string | null;
  last_unit_price: number;
  last_purchase_date: string | null;
  last_harga_satuan_id: string | null;
  last_nama_satuan: string | null;
  last_faktor_konversi: number;
}

export interface ReorderSuggestionGroup {
  vendor_id: string | null;
  vendor_name: string | null;
  items: ReorderSuggestion[];
  total_estimasi: number;
}

const PENDING_PO_STATUSES: PurchaseOrderStatus[] = [
  "DRAFT",
  "SENT",
  "PARTIAL_RECEIVED",
];

function pickLatestPurchase(rows: Array<{
  pembelian_id: string;
  harga_satuan: number;
  harga_satuan_id: string | null;
  nama_satuan: string;
  faktor_konversi: number;
  pembelian: {
    vendor_id: string | null;
    tanggal: string | null;
    dibuat_pada: string | null;
    status_transaksi: string | null;
  } | null;
}>) {
  let best: (typeof rows)[number] | null = null;
  for (const row of rows) {
    const pem = row.pembelian;
    if (!pem) continue;
    if (pem.status_transaksi === "VOIDED") continue;
    if (!pem.vendor_id) continue;
    if (!best) {
      best = row;
      continue;
    }
    const bestDate = String(best.pembelian?.tanggal || best.pembelian?.dibuat_pada || "");
    const rowDate = String(pem.tanggal || pem.dibuat_pada || "");
    if (rowDate > bestDate) best = row;
  }
  return best;
}

/**
 * Cari semua barang yang stoknya pada atau di bawah level minimum
 * (level_stok_minimum) dan kumpulkan saran vendor berdasarkan pembelian
 * non-void terbaru yang punya vendor.
 *
 * Item yang sudah ter-cover oleh kuantitas PO pending (DRAFT/SENT/PARTIAL_RECEIVED)
 * disaring keluar supaya kita tidak pernah double-order.
 */
export async function getReorderSuggestions(): Promise<ReorderSuggestion[]> {
  const barangRes = await db.query<any>("barang", {});
  if (barangRes.error) throw barangRes.error;
  const allBarang = barangRes.data || [];

  const lowStock = allBarang.filter((b: any) => {
    if (Number(b.lacak_inventori_status) === 0) return false;
    if (Number(b.is_deleted) === 1) return false;
    const stok = numeric(b.jumlah_stok);
    const par = numeric(b.level_stok_minimum);
    if (par <= 0) return false;
    return stok <= par;
  });

  if (lowStock.length === 0) return [];

  // Tarik baris item_pembelian + pembelian sekali lalu join di memori. Dataset
  // untuk satu toko cukup kecil; layer DB unified tidak menyediakan join sisi
  // server.
  const [pembelianRes, itemPembelianRes, vendorRes, poItemsRes, poRes] =
    await Promise.all([
      db.query<any>("pembelian", {}),
      db.query<any>("item_pembelian", {}),
      db.query<any>("vendor", {}),
      db.query<any>("purchase_order_items", {}),
      db.query<any>("purchase_orders", {}),
    ]);
  if (pembelianRes.error) throw pembelianRes.error;
  if (itemPembelianRes.error) throw itemPembelianRes.error;
  if (vendorRes.error) throw vendorRes.error;
  if (poItemsRes.error) throw poItemsRes.error;
  if (poRes.error) throw poRes.error;

  const pembelianById = new Map<string, any>();
  for (const row of pembelianRes.data || []) {
    if (Number(row.is_deleted) === 1) continue;
    pembelianById.set(row.id, row);
  }

  const vendorById = new Map<string, any>();
  for (const v of vendorRes.data || []) {
    if (Number(v.is_deleted) === 1) continue;
    vendorById.set(v.id, v);
  }

  const itemsByBarang = new Map<string, any[]>();
  for (const ip of itemPembelianRes.data || []) {
    if (Number(ip.is_deleted) === 1) continue;
    const list = itemsByBarang.get(ip.barang_id) || [];
    list.push(ip);
    itemsByBarang.set(ip.barang_id, list);
  }

  const poById = new Map<string, any>();
  for (const po of poRes.data || []) {
    if (Number(po.is_deleted) === 1) continue;
    poById.set(po.id, po);
  }

  const pendingByBarang = new Map<string, number>();
  for (const poi of poItemsRes.data || []) {
    if (Number(poi.is_deleted) === 1) continue;
    const po = poById.get(poi.purchase_order_id);
    if (!po) continue;
    if (!PENDING_PO_STATUSES.includes(po.status)) continue;
    const remaining = Math.max(
      0,
      numeric(poi.jumlah) - numeric(poi.qty_received)
    );
    if (remaining <= 0) continue;
    const baseRemaining = remaining * (positiveNumber(poi.faktor_konversi) || 1);
    pendingByBarang.set(
      poi.barang_id,
      numeric(pendingByBarang.get(poi.barang_id)) + baseRemaining
    );
  }

  const suggestions: ReorderSuggestion[] = [];
  for (const barang of lowStock) {
    const stok = numeric(barang.jumlah_stok);
    const par = numeric(barang.level_stok_minimum);
    const pending = numeric(pendingByBarang.get(barang.id));
    const need = par - stok - pending;
    if (need <= 0) continue;

    const ipRows = (itemsByBarang.get(barang.id) || []).map((ip: any) => ({
      pembelian_id: ip.pembelian_id,
      harga_satuan: numeric(ip.harga_satuan),
      harga_satuan_id: ip.harga_satuan_id || null,
      nama_satuan: ip.nama_satuan || barang.satuan_dasar,
      faktor_konversi: positiveNumber(ip.faktor_konversi) || 1,
      pembelian: pembelianById.get(ip.pembelian_id) || null,
    }));
    const latest = pickLatestPurchase(ipRows);

    const vendorId = latest?.pembelian?.vendor_id || null;
    const vendor = vendorId ? vendorById.get(vendorId) : null;
    const vendorActive = vendor ? Number(vendor.aktif_status) !== 0 : false;

    suggestions.push({
      barang_id: barang.id,
      barang_nama: barang.nama,
      satuan_dasar: barang.satuan_dasar,
      butuh_dimensi_status: Number(barang.butuh_dimensi_status) || 0,
      jumlah_stok: stok,
      level_stok_minimum: par,
      suggested_qty: Number(need.toFixed(2)),
      pending_po_qty: pending,
      suggested_vendor_id: vendorActive ? vendorId : null,
      suggested_vendor_name: vendorActive
        ? vendor?.nama_perusahaan || null
        : null,
      last_unit_price: latest ? latest.harga_satuan : 0,
      last_purchase_date: latest?.pembelian?.tanggal || null,
      last_harga_satuan_id: latest?.harga_satuan_id || null,
      last_nama_satuan: latest?.nama_satuan || barang.satuan_dasar,
      last_faktor_konversi: latest?.faktor_konversi || 1,
    });
  }

  return suggestions.sort((a, b) =>
    a.barang_nama.localeCompare(b.barang_nama, "id-ID")
  );
}

/**
 * Kelompokkan saran berdasarkan vendor yang disarankan. Item tanpa saran
 * vendor dikembalikan sebagai satu grup dengan vendor_id = null supaya
 * UI bisa merender bucket "tanpa vendor".
 */
export function groupSuggestionsByVendor(
  suggestions: ReorderSuggestion[]
): ReorderSuggestionGroup[] {
  const groups = new Map<string, ReorderSuggestionGroup>();
  for (const s of suggestions) {
    const key = s.suggested_vendor_id || "__unassigned__";
    let group = groups.get(key);
    if (!group) {
      group = {
        vendor_id: s.suggested_vendor_id,
        vendor_name: s.suggested_vendor_name,
        items: [],
        total_estimasi: 0,
      };
      groups.set(key, group);
    }
    group.items.push(s);
    group.total_estimasi += s.suggested_qty * s.last_unit_price;
  }
  // Grup vendor duluan (urut nama), tanpa vendor di akhir
  return Array.from(groups.values()).sort((a, b) => {
    if (!a.vendor_id && !b.vendor_id) return 0;
    if (!a.vendor_id) return 1;
    if (!b.vendor_id) return -1;
    return (a.vendor_name || "").localeCompare(b.vendor_name || "", "id-ID");
  });
}

export interface GenerateDraftPurchaseOrdersInput {
  /**
   * Filter opsional — hanya buat draf PO untuk vendor id ini. Saat dikosongkan,
   * buat untuk setiap vendor yang punya minimal satu saran.
   * Item tanpa saran vendor tidak pernah di-generate otomatis; mereka
   * dikembalikan di `unassigned` supaya bisa ditampilkan UI.
   */
  vendor_ids?: string[];
  dibuat_oleh?: string | null;
}

export interface GenerateDraftPurchaseOrdersResult {
  created: Array<{
    purchase_order_id: string;
    nomor_po: string;
    vendor_id: string;
    vendor_name: string;
    item_count: number;
  }>;
  /** Item yang dilewati karena tidak ada saran vendor. */
  unassigned: ReorderSuggestion[];
}

/**
 * Untuk tiap vendor yang punya item stok rendah, buat satu pesanan pembelian
 * berstatus DRAFT yang berisi semua saran vendor itu. Item tanpa saran vendor
 * dikembalikan di `unassigned` dan tidak pernah ditulis ke DB.
 */
export async function generateDraftPurchaseOrders(
  input: GenerateDraftPurchaseOrdersInput = {}
): Promise<GenerateDraftPurchaseOrdersResult> {
  const suggestions = await getReorderSuggestions();
  const groups = groupSuggestionsByVendor(suggestions);

  const filterIds = input.vendor_ids
    ? new Set(input.vendor_ids.filter(Boolean))
    : null;

  const created: GenerateDraftPurchaseOrdersResult["created"] = [];
  const unassigned: ReorderSuggestion[] = [];

  for (const group of groups) {
    if (!group.vendor_id) {
      unassigned.push(...group.items);
      continue;
    }
    if (filterIds && !filterIds.has(group.vendor_id)) continue;

    const items: PurchaseOrderItemInput[] = group.items.map((item) => ({
      barang_id: item.barang_id,
      harga_satuan_id: item.last_harga_satuan_id,
      jumlah: item.suggested_qty,
      nama_satuan: item.last_nama_satuan || item.satuan_dasar,
      faktor_konversi: item.last_faktor_konversi || 1,
      harga_satuan: item.last_unit_price,
    }));

    if (items.length === 0) continue;

    const result = await createPurchaseOrder({
      vendor_id: group.vendor_id,
      status: "DRAFT",
      catatan: "Auto-PO dari par level inventori",
      dibuat_oleh: input.dibuat_oleh || null,
      items,
    });

    created.push({
      purchase_order_id: result.id,
      nomor_po: result.nomor_po,
      vendor_id: group.vendor_id,
      vendor_name: group.vendor_name || "",
      item_count: items.length,
    });
  }

  return { created, unassigned };
}
