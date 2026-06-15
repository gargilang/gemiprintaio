import "server-only";

import { db, generateId } from "@/lib/db-unified";
import { hitungPpn } from "@/lib/ppn-helpers";
import { createPurchase, payDebt } from "@/lib/services/purchases-service";
import {
  generateDailyDocumentNumber,
  numeric,
  positiveNumber,
  todayJakarta,
} from "./document-number-service";
import { buildLookupMap, fetchChildrenByForeignKey } from "./enrich-utils";

export type PurchaseOrderStatus =
  | "DRAFT"
  | "SENT"
  | "PARTIAL_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

export interface PurchaseOrderItemInput {
  barang_id: string;
  harga_satuan_id?: string | null;
  jumlah: number;
  nama_satuan: string;
  faktor_konversi: number;
  harga_satuan: number;
  subtotal?: number;
  panjang?: number | null;
  lebar?: number | null;
}

export interface UpsertPurchaseOrderInput {
  nomor_po?: string;
  vendor_id?: string | null;
  tanggal?: string;
  expected_date?: string | null;
  status?: PurchaseOrderStatus;
  catatan?: string | null;
  dibuat_oleh?: string | null;
  kena_ppn?: boolean;
  ppn_persen?: number;
  ppn_metode?: "EKSKLUSIF" | "INKLUSIF";
  items: PurchaseOrderItemInput[];
}

function normalizeItems(input: UpsertPurchaseOrderInput) {
  const kenaPpn = input.kena_ppn ? 1 : 0;
  const ppnPersen = kenaPpn === 1 ? numeric(input.ppn_persen) : 0;
  const ppnMetode = input.ppn_metode === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF";

  return input.items.map((item) => {
    const jumlah = positiveNumber(item.jumlah);
    const hargaSatuan = numeric(item.harga_satuan);
    const subtotal = numeric(item.subtotal) || jumlah * hargaSatuan;
    const breakdown =
      kenaPpn === 1 && ppnPersen > 0
        ? hitungPpn(subtotal, ppnPersen, ppnMetode)
        : { dpp: subtotal, ppn: 0, total: subtotal };
    return {
      ...item,
      jumlah,
      faktor_konversi: positiveNumber(item.faktor_konversi) || 1,
      harga_satuan: hargaSatuan,
      subtotal,
      dpp_total: breakdown.dpp,
      ppn_total: breakdown.ppn,
      dpp_satuan: jumlah > 0 ? breakdown.dpp / jumlah : 0,
      ppn_satuan: jumlah > 0 ? breakdown.ppn / jumlah : 0,
    };
  });
}

async function enrichPurchaseOrders(rows: any[]) {
  const poIds = rows.map((row) => row.id);
  const itemsByPo = await fetchChildrenByForeignKey<any>(
    "purchase_order_items",
    "purchase_order_id",
    poIds
  );

  const barangIds = [...itemsByPo.values()]
    .flat()
    .map((item) => item.barang_id)
    .filter(Boolean);
  const vendorIds = rows.map((row) => row.vendor_id).filter(Boolean);

  const [barangMap, vendorMap] = await Promise.all([
    buildLookupMap<{ id: string; nama: string }>("barang", barangIds, "nama"),
    buildLookupMap<{ id: string; nama_perusahaan: string }>(
      "vendor",
      vendorIds,
      "nama_perusahaan"
    ),
  ]);

  return rows.map((row) => ({
    ...row,
    vendor_name: row.vendor_id
      ? vendorMap.get(row.vendor_id)?.nama_perusahaan || null
      : null,
    items: (itemsByPo.get(row.id) || []).map((item) => ({
      ...item,
      barang_nama: barangMap.get(item.barang_id)?.nama || "",
    })),
  }));
}

export async function getPurchaseOrders(limit = 200) {
  const result = await db.query<any>("purchase_orders", {
    orderBy: { column: "dibuat_pada", ascending: false },
    limit,
  });
  if (result.error) throw result.error;
  return enrichPurchaseOrders(result.data || []);
}

export async function getPurchaseOrderById(id: string) {
  const result = await db.queryOne<any>("purchase_orders", { where: { id } });
  if (result.error) throw result.error;
  if (!result.data) return null;
  const [po] = await enrichPurchaseOrders([result.data]);
  return po;
}

export async function createPurchaseOrder(input: UpsertPurchaseOrderInput) {
  if (!input.items?.length) throw new Error("Minimal satu item PO");
  const tanggal = input.tanggal || todayJakarta();
  const items = normalizeItems(input);
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const headerBreakdown =
    input.kena_ppn && numeric(input.ppn_persen) > 0
      ? hitungPpn(total, numeric(input.ppn_persen), input.ppn_metode === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF")
      : { dpp: total, ppn: 0, total };
  const id = generateId();
  const nomor =
    input.nomor_po?.trim() ||
    (await generateDailyDocumentNumber("purchase_orders", "nomor_po", "PO", tanggal));

  await db.transaction(async () => {
    const ins = await db.insert("purchase_orders", {
      id,
      nomor_po: nomor,
      vendor_id: input.vendor_id || null,
      tanggal,
      expected_date: input.expected_date || null,
      status: input.status || "DRAFT",
      total_jumlah: total,
      kena_ppn: input.kena_ppn ? 1 : 0,
      ppn_persen: input.kena_ppn ? numeric(input.ppn_persen) : 0,
      ppn_metode: input.ppn_metode === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF",
      dpp_total: headerBreakdown.dpp,
      ppn_total: headerBreakdown.ppn,
      catatan: input.catatan?.trim() || null,
      dibuat_oleh: input.dibuat_oleh || null,
    });
    if (ins.error) throw ins.error;

    for (const item of items) {
      const res = await db.insert("purchase_order_items", {
        id: generateId(),
        purchase_order_id: id,
        barang_id: item.barang_id,
        harga_satuan_id: item.harga_satuan_id || null,
        jumlah: item.jumlah,
        qty_received: 0,
        nama_satuan: item.nama_satuan,
        faktor_konversi: item.faktor_konversi,
        harga_satuan: item.harga_satuan,
        subtotal: item.subtotal,
        panjang: item.panjang ?? null,
        lebar: item.lebar ?? null,
        dpp_satuan: item.dpp_satuan,
        ppn_satuan: item.ppn_satuan,
        dpp_total: item.dpp_total,
        ppn_total: item.ppn_total,
      });
      if (res.error) throw res.error;
    }
  });

  return { id, nomor_po: nomor };
}

export async function updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus) {
  const upd = await db.update("purchase_orders", id, { status });
  if (upd.error) throw upd.error;
}

export async function receivePurchaseOrder(input: {
  purchase_order_id: string;
  nomor_faktur?: string;
  tanggal?: string;
  metode_pembayaran: string;
  jumlah_dibayar?: number | null;
  catatan?: string | null;
  dibuat_oleh?: string | null;
  diterima_oleh?: string | null;
  items: Array<{ purchase_order_item_id: string; qty: number }>;
}) {
  const po = await getPurchaseOrderById(input.purchase_order_id);
  if (!po) throw new Error("Pesanan pembelian tidak ditemukan");
  if (po.status === "CANCELLED") throw new Error("Pesanan pembelian sudah dibatalkan");
  if (!input.items?.length) throw new Error("Minimal satu line penerimaan");

  const lines = input.items
    .map((line) => {
      const item = (po.items || []).find((it: any) => it.id === line.purchase_order_item_id);
      if (!item) throw new Error(`Item pesanan pembelian ${line.purchase_order_item_id} tidak ditemukan`);
      const remaining = numeric(item.jumlah) - numeric(item.qty_received);
      const qty = positiveNumber(line.qty);
      if (qty <= 0) return null;
      if (qty > remaining + 0.000001) {
        throw new Error(`Qty terima ${item.barang_nama || item.id} melebihi sisa pesanan pembelian`);
      }
      return {
        poItem: item,
        qty,
      };
    })
    .filter(Boolean) as Array<{ poItem: any; qty: number }>;

  if (lines.length === 0) throw new Error("Qty penerimaan harus lebih dari 0");

  const purchase = await createPurchase({
    nomor_faktur:
      input.nomor_faktur?.trim() ||
      `${po.nomor_po}-RCV-${new Date().getTime().toString().slice(-6)}`,
    vendor_id: po.vendor_id || null,
    tanggal: input.tanggal || todayJakarta(),
    metode_pembayaran: input.metode_pembayaran,
    catatan: input.catatan || `Penerimaan dari ${po.nomor_po}`,
    dibuat_oleh: input.dibuat_oleh || undefined,
    diterima_oleh: input.diterima_oleh || undefined,
    kena_ppn: Number(po.kena_ppn || 0) === 1,
    ppn_persen: Number(po.ppn_persen || 0),
    ppn_metode: po.ppn_metode === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF",
    items: lines.map(({ poItem, qty }) => ({
      barang_id: poItem.barang_id,
      harga_satuan_id: poItem.harga_satuan_id || null,
      nama_satuan: poItem.nama_satuan,
      faktor_konversi: Number(poItem.faktor_konversi || 1),
      jumlah: qty,
      harga_satuan: Number(poItem.harga_satuan || 0),
      panjang: poItem.panjang ?? null,
      lebar: poItem.lebar ?? null,
    })),
  });

  // Untuk pembayaran berbasis kredit (mis. NET30) pengguna bisa mencatat
  // down payment opsional. createPurchase selalu membuka hutang untuk total
  // penuh; kita terapkan DP via payDebt supaya buku kas + hutang tetap konsisten.
  const dp =
    typeof input.jumlah_dibayar === "number" ? Math.max(0, input.jumlah_dibayar) : 0;
  if (dp > 0 && input.metode_pembayaran && input.metode_pembayaran !== "CASH" && input.metode_pembayaran !== "TRANSFER") {
    await payDebt({
      purchase_id: purchase.id,
      jumlah_bayar: dp,
      tanggal_bayar: input.tanggal || todayJakarta(),
      metode_pembayaran: "CASH",
      catatan: `DP saat penerimaan PO ${po.nomor_po}`,
      dibuat_oleh: input.dibuat_oleh || undefined,
    });
  }

  await db.update("pembelian", purchase.id, {
    purchase_order_id: input.purchase_order_id,
  });

  const createdItems = await db.query<any>("item_pembelian", {
    where: { pembelian_id: purchase.id },
    orderBy: { column: "dibuat_pada", ascending: true },
  });
  for (let index = 0; index < lines.length; index += 1) {
    const created = createdItems.data?.[index];
    if (created) {
      await db.update("item_pembelian", created.id, {
        purchase_order_item_id: lines[index].poItem.id,
      });
    }
    await db.update("purchase_order_items", lines[index].poItem.id, {
      qty_received: numeric(lines[index].poItem.qty_received) + lines[index].qty,
    });
  }

  const fresh = await getPurchaseOrderById(input.purchase_order_id);
  const allItems = fresh?.items || [];
  const allReceived = allItems.every(
    (item: any) => numeric(item.qty_received) >= numeric(item.jumlah) - 0.000001
  );
  const anyReceived = allItems.some((item: any) => numeric(item.qty_received) > 0);
  await db.update("purchase_orders", input.purchase_order_id, {
    status: allReceived ? "RECEIVED" : anyReceived ? "PARTIAL_RECEIVED" : "SENT",
  });

  return purchase;
}
