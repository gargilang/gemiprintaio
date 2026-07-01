import "server-only";

import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { hitungPpn } from "@/lib/ppn-helpers";
import { createSale, type CreateSaleData } from "@/lib/services/pos-service";
import {
  generateDailyDocumentNumber,
  numeric,
  positiveNumber,
  todayJakarta,
} from "./document-number-service";
import { buildLookupMap, fetchChildrenByForeignKey } from "./enrich-utils";

export type QuotationStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "CONVERTED"
  | "CANCELLED"
  | "EXPIRED";

export interface QuotationItemInput {
  barang_id: string;
  harga_satuan_id?: string | null;
  jumlah: number;
  nama_satuan: string;
  faktor_konversi: number;
  harga_satuan: number;
  subtotal?: number;
  panjang?: number | null;
  lebar?: number | null;
  jumlah_lembar?: number | null;
  tipe_item?: "BARANG" | "JASA" | "MAKLON";
  vendor_subkontrak_id?: string | null;
  biaya_subkontrak?: number | null;
  metode_bayar_vendor?: "CASH" | "NET30" | null;
  deskripsi_pekerjaan?: string | null;
}

export interface UpsertQuotationInput {
  nomor_penawaran?: string;
  pelanggan_id?: string | null;
  pelanggan_nama_snapshot?: string | null;
  pelanggan_kota?: string | null;
  tanggal?: string;
  berlaku_sampai?: string | null;
  status?: QuotationStatus;
  catatan?: string | null;
  dibuat_oleh?: string | null;
  kena_ppn?: boolean;
  ppn_persen?: number;
  ppn_metode?: "EKSKLUSIF" | "INKLUSIF";
  items: QuotationItemInput[];
}

function normalizeItems(input: UpsertQuotationInput) {
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
      tipe_item: item.tipe_item || "BARANG",
      dpp_total: breakdown.dpp,
      ppn_total: breakdown.ppn,
      dpp_satuan: jumlah > 0 ? breakdown.dpp / jumlah : 0,
      ppn_satuan: jumlah > 0 ? breakdown.ppn / jumlah : 0,
    };
  });
}

async function enrichQuotations(rows: any[]) {
  const quoteIds = rows.map((row) => row.id);
  const itemsByQuote = await fetchChildrenByForeignKey<any>(
    "item_penawaran",
    "penawaran_id",
    quoteIds
  );

  const barangIds = [...itemsByQuote.values()]
    .flat()
    .map((item) => item.barang_id)
    .filter(Boolean);
  const barangMap = await buildLookupMap<{ id: string; nama: string }>(
    "barang",
    barangIds,
    "nama"
  );

  return rows.map((row) => ({
    ...row,
    items: (itemsByQuote.get(row.id) || [])
      .filter((item) => Number(item.is_deleted) !== 1)
      .map((item) => ({
        ...item,
        barang_nama: barangMap.get(item.barang_id)?.nama || "",
        jumlah_lembar: item.jumlah_lembar ?? null,
      })),
  }));
}

export async function getQuotations(limit = 200) {
  const result = await db.query<any>("penawaran", {
    orderBy: { column: "dibuat_pada", ascending: false },
    limit,
  });
  if (result.error) throw result.error;
  const rows = (result.data || []).filter((row) => Number(row.is_deleted) !== 1);
  return enrichQuotations(rows);
}

export async function getQuotationById(id: string) {
  const result = await db.queryOne<any>("penawaran", { where: { id } });
  if (result.error) throw result.error;
  if (!result.data) return null;
  const [quote] = await enrichQuotations([result.data]);
  return quote;
}

export async function createQuotation(input: UpsertQuotationInput): Promise<{ id: string; nomor_penawaran: string }> {
  if (!input.items?.length) throw new Error("Minimal satu item penawaran");
  const tanggal = input.tanggal || todayJakarta();
  const items = normalizeItems(input);
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const headerBreakdown =
    input.kena_ppn && numeric(input.ppn_persen) > 0
      ? hitungPpn(total, numeric(input.ppn_persen), input.ppn_metode === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF")
      : { dpp: total, ppn: 0, total };
  const id = generateId();
  const nomor =
    input.nomor_penawaran?.trim() ||
    (await generateDailyDocumentNumber("penawaran", "nomor_penawaran", "QUO", tanggal));

  await db.transaction(async () => {
    const ins = await db.insert("penawaran", {
      id,
      nomor_penawaran: nomor,
      pelanggan_id: input.pelanggan_id || null,
      pelanggan_nama_snapshot: input.pelanggan_nama_snapshot?.trim() || null,
      pelanggan_kota: input.pelanggan_kota?.trim() || null,
      tanggal,
      berlaku_sampai: input.berlaku_sampai || null,
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
      const itemId = generateId();
      const res = await db.insert("item_penawaran", {
        id: itemId,
        penawaran_id: id,
        barang_id: item.barang_id,
        harga_satuan_id: item.harga_satuan_id || null,
        jumlah: item.jumlah,
        nama_satuan: item.nama_satuan,
        faktor_konversi: item.faktor_konversi,
        harga_satuan: item.harga_satuan,
        subtotal: item.subtotal,
        panjang: item.panjang ?? null,
        lebar: item.lebar ?? null,
        jumlah_lembar: item.jumlah_lembar ?? null,
        tipe_item: item.tipe_item,
        vendor_subkontrak_id: item.vendor_subkontrak_id || null,
        biaya_subkontrak: item.biaya_subkontrak ?? null,
        metode_bayar_vendor: item.metode_bayar_vendor || null,
        deskripsi_pekerjaan: item.deskripsi_pekerjaan?.trim() || null,
        dpp_satuan: item.dpp_satuan,
        ppn_satuan: item.ppn_satuan,
        dpp_total: item.dpp_total,
        ppn_total: item.ppn_total,
      });
      if (res.error) throw res.error;
    }
  });

  return { id, nomor_penawaran: nomor };
}

export async function updateQuotation(id: string, input: UpsertQuotationInput) {
  const existing = await getQuotationById(id);
  if (!existing) throw new Error("Penawaran tidak ditemukan");
  if (existing.status === "CONVERTED") {
    throw new Error("Penawaran yang sudah dikonversi tidak bisa diedit");
  }

  const items = normalizeItems(input);
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const headerBreakdown =
    input.kena_ppn && numeric(input.ppn_persen) > 0
      ? hitungPpn(total, numeric(input.ppn_persen), input.ppn_metode === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF")
      : { dpp: total, ppn: 0, total };

  await db.transaction(async () => {
    const oldItems = await db.query<any>("item_penawaran", {
      where: { penawaran_id: id },
    });
    if (oldItems.error) throw oldItems.error;
    for (const item of oldItems.data || []) {
      const del = await db.delete("item_penawaran", item.id);
      if (del.error) throw del.error;
    }

    const upd = await db.update("penawaran", id, {
      pelanggan_id: input.pelanggan_id || null,
      pelanggan_nama_snapshot: input.pelanggan_nama_snapshot?.trim() || null,
      pelanggan_kota: input.pelanggan_kota?.trim() || null,
      tanggal: input.tanggal || existing.tanggal,
      berlaku_sampai: input.berlaku_sampai || null,
      status: input.status || existing.status || "DRAFT",
      total_jumlah: total,
      kena_ppn: input.kena_ppn ? 1 : 0,
      ppn_persen: input.kena_ppn ? numeric(input.ppn_persen) : 0,
      ppn_metode: input.ppn_metode === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF",
      dpp_total: headerBreakdown.dpp,
      ppn_total: headerBreakdown.ppn,
      catatan: input.catatan?.trim() || null,
      diperbarui_pada: getCurrentTimestamp(),
    });
    if (upd.error) throw upd.error;

    for (const item of items) {
      const res = await db.insert("item_penawaran", {
        id: generateId(),
        penawaran_id: id,
        barang_id: item.barang_id,
        harga_satuan_id: item.harga_satuan_id || null,
        jumlah: item.jumlah,
        nama_satuan: item.nama_satuan,
        faktor_konversi: item.faktor_konversi,
        harga_satuan: item.harga_satuan,
        subtotal: item.subtotal,
        panjang: item.panjang ?? null,
        lebar: item.lebar ?? null,
        jumlah_lembar: item.jumlah_lembar ?? null,
        tipe_item: item.tipe_item,
        vendor_subkontrak_id: item.vendor_subkontrak_id || null,
        biaya_subkontrak: item.biaya_subkontrak ?? null,
        metode_bayar_vendor: item.metode_bayar_vendor || null,
        deskripsi_pekerjaan: item.deskripsi_pekerjaan?.trim() || null,
        dpp_satuan: item.dpp_satuan,
        ppn_satuan: item.ppn_satuan,
        dpp_total: item.dpp_total,
        ppn_total: item.ppn_total,
      });
      if (res.error) throw res.error;
    }
  });
}

export async function updateQuotationStatus(id: string, status: QuotationStatus) {
  const upd = await db.update("penawaran", id, { status });
  if (upd.error) throw upd.error;
}

/** Hapus draf penawaran (soft delete). Hanya status DRAFT. */
export async function deleteQuotationDraft(id: string) {
  const existing = await getQuotationById(id);
  if (!existing || Number(existing.is_deleted) === 1) {
    throw new Error("Penawaran tidak ditemukan");
  }
  if (existing.status !== "DRAFT") {
    throw new Error("Hanya draf yang bisa dihapus");
  }

  const ts = getCurrentTimestamp();
  await db.transaction(async () => {
    for (const item of existing.items || []) {
      const upd = await db.update("item_penawaran", item.id, {
        is_deleted: 1,
        deleted_at: ts,
      });
      if (upd.error) throw upd.error;
    }
    const upd = await db.update("penawaran", id, {
      is_deleted: 1,
      deleted_at: ts,
    });
    if (upd.error) throw upd.error;
  });
}

export async function convertQuotationToSale(
  id: string,
  payment: Pick<
    CreateSaleData,
    "metode_pembayaran" | "jumlah_dibayar" | "jumlah_kembalian" | "kasir_id" | "tanggal" | "prioritas"
  > & { catatan?: string }
) {
  const quote = await getQuotationById(id);
  if (!quote) throw new Error("Penawaran tidak ditemukan");
  if (quote.status === "CONVERTED") throw new Error("Penawaran sudah dikonversi");
  if (quote.status === "CANCELLED" || quote.status === "EXPIRED") {
    throw new Error("Penawaran sudah batal/kedaluwarsa");
  }

  const sale = await createSale({
    pelanggan_id: quote.pelanggan_id || undefined,
    pelanggan_nama_snapshot: quote.pelanggan_nama_snapshot || undefined,
    pelanggan_kota: quote.pelanggan_kota || undefined,
    items: (quote.items || []).map((item: any) => ({
      barang_id: item.barang_id,
      harga_satuan_id: item.harga_satuan_id || undefined,
      jumlah: Number(item.jumlah || 0),
      nama_satuan: item.nama_satuan,
      faktor_konversi: Number(item.faktor_konversi || 1),
      harga_satuan: Number(item.harga_satuan || 0),
      subtotal: Number(item.subtotal || 0),
      panjang: item.panjang ?? undefined,
      lebar: item.lebar ?? undefined,
      jumlah_lembar: item.jumlah_lembar ?? undefined,
      tipe_item: item.tipe_item || "BARANG",
      vendor_subkontrak_id: item.vendor_subkontrak_id || null,
      biaya_subkontrak: item.biaya_subkontrak ?? null,
      metode_bayar_vendor: item.metode_bayar_vendor || null,
      deskripsi_pekerjaan: item.deskripsi_pekerjaan || null,
    })),
    total_jumlah: Number(quote.total_jumlah || 0),
    jumlah_dibayar: Number(payment.jumlah_dibayar || 0),
    jumlah_kembalian: Number(payment.jumlah_kembalian || 0),
    metode_pembayaran: payment.metode_pembayaran || "NET30",
    catatan: payment.catatan || quote.catatan || `Konversi ${quote.nomor_penawaran}`,
    kasir_id: payment.kasir_id,
    tanggal: payment.tanggal || todayJakarta(),
    prioritas: payment.prioritas || "NORMAL",
    kena_ppn: Number(quote.kena_ppn || 0) === 1,
    ppn_persen: Number(quote.ppn_persen || 0),
    ppn_metode: quote.ppn_metode === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF",
  });

  await db.update("penjualan", sale.id, { penawaran_id: id });
  await db.update("penawaran", id, {
    status: "CONVERTED",
    converted_penjualan_id: sale.id,
    converted_at: new Date().toISOString(),
  });

  return sale;
}
