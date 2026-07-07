/**
 * Service reconcile pending maklon (Safeguard C2 — Task 5).
 *
 * Baris maklon yang di-checkout tanpa vendor/biaya disimpan pending
 * (pending_vendor_hpp=1, HPP=0, tanpa PO maklon). Staf+ dapat mengisi
 * vendor + biaya + metode bayar lewat queue "Pending Vendor/HPP":
 *   - recompute hpp_satuan / hpp_total / gross_profit / gross_margin
 *   - post HPP ke keuangan dengan token [REF:itemPenjualanId]
 *   - buat PO maklon via createMaklonPurchase
 *   - set pending_vendor_hpp=0
 *
 * Iron rules yang ditegakkan: auth guard ada di lapisan action, Zod validasi,
 * closed-period guard (iron rule 7), token [REF:id] di keuangan (iron rule 4),
 * db-unified sebagai satu-satunya pintu data (iron rule architecture).
 */

import "server-only";

import { z } from "zod";
import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { friendlyPgError } from "@/lib/pg-error";
import { createMaklonPurchase } from "./purchases-service";
import { resolveOpenPeriodeIdForKeuangan } from "./finance-service";
import { isDateInClosedPeriod } from "./accounting-periods-service";

export const reconcilePendingMaklonInputSchema = z.object({
  vendor_subkontrak_id: z.string().min(1, "Vendor subkontrak wajib dipilih"),
  biaya_subkontrak: z.coerce
    .number()
    .finite()
    .positive("Biaya subkontrak harus lebih dari 0"),
  metode_bayar_vendor: z.enum(["CASH", "NET30", "TRANSFER"]),
  dibuat_oleh: z.string().nullable().optional(),
});

export type ReconcilePendingMaklonInput = z.infer<
  typeof reconcilePendingMaklonInputSchema
>;

export interface PendingMaklonRow {
  id: string;
  penjualan_id: string;
  tipe_item: string;
  katalog_maklon_id: string | null;
  deskripsi_pekerjaan: string | null;
  jumlah: number;
  harga_satuan: number;
  subtotal: number;
  pending_vendor_hpp: number;
  nomor_faktur?: string | null;
  tanggal?: string | null;
  pelanggan_nama?: string | null;
}

/**
 * Daftar baris item_penjualan pending maklon + join penjualan untuk
 * nomor_faktur / tanggal / nama pelanggan. Hindari N+1 (iron rule 19):
 * ambil sekali penjualan yang dibutuhkan lalu join di memori.
 */
export async function listPendingMaklon(): Promise<PendingMaklonRow[]> {
  const itemsResult = await db.query<any>("item_penjualan", {
    where: { pending_vendor_hpp: 1 },
  });
  if (itemsResult.error)
    throw friendlyPgError(itemsResult.error, "item_penjualan");
  const items = itemsResult.data || [];

  const saleIds = Array.from(
    new Set(items.map((r) => r.penjualan_id).filter(Boolean)),
  );
  const salesMap = new Map<string, any>();
  if (saleIds.length > 0) {
    const salesResult = await db.query<any>("penjualan", {
      where: { id: saleIds },
    });
    if (salesResult.error)
      throw friendlyPgError(salesResult.error, "penjualan");
    for (const s of salesResult.data || []) salesMap.set(s.id, s);
  }

  return items.map((r) => {
    const sale = salesMap.get(r.penjualan_id);
    return {
      id: r.id,
      penjualan_id: r.penjualan_id,
      tipe_item: r.tipe_item,
      katalog_maklon_id: r.katalog_maklon_id ?? null,
      deskripsi_pekerjaan: r.deskripsi_pekerjaan ?? null,
      jumlah: Number(r.jumlah) || 0,
      harga_satuan: Number(r.harga_satuan) || 0,
      subtotal: Number(r.subtotal) || 0,
      pending_vendor_hpp: Number(r.pending_vendor_hpp) || 0,
      nomor_faktur: sale?.nomor_faktur,
      tanggal: sale?.tanggal,
      pelanggan_nama:
        sale?.pelanggan_nama_snapshot ?? sale?.pelanggan_nama ?? null,
    };
  });
}

/**
 * Isi vendor + biaya + metode bayar untuk baris maklon pending.
 *
 * Di dalam transaksi: update item_penjualan (recompute HPP, bersihkan flag
 * pending) + post HPP ke keuangan [REF:itemPenjualanId]. PO maklon dibuat
 * di luar transaksi mengikuti pola createSaleAttempt (lihat purchases-mutations
 * createMaklonPurchase yang punya transaksi tersendiri).
 */
export async function reconcilePendingMaklonItem(
  itemPenjualanId: string,
  input: ReconcilePendingMaklonInput,
): Promise<void> {
  const parsed = reconcilePendingMaklonInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const data = parsed.data;

  const curResult = await db.queryOne<any>("item_penjualan", {
    where: { id: itemPenjualanId },
  });
  if (curResult.error) throw friendlyPgError(curResult.error, "item_penjualan");
  const cur = curResult.data;
  if (!cur) throw new Error("Item penjualan tidak ditemukan");
  if (Number(cur.pending_vendor_hpp) !== 1)
    throw new Error("Item bukan pending maklon");

  const saleResult = await db.queryOne<any>("penjualan", {
    where: { id: cur.penjualan_id },
  });
  if (saleResult.error) throw friendlyPgError(saleResult.error, "penjualan");
  const saleRow = saleResult.data;
  const tanggalSale = saleRow?.tanggal || getCurrentTimestamp().slice(0, 10);

  // Closed-period guard (iron rule 7): tanggal sale tidak boleh jatuh di
  // periode akuntansi yang sudah ditutup.
  if (await isDateInClosedPeriod(tanggalSale)) {
    throw new Error(
      `Tanggal ${tanggalSale} berada di periode akuntansi yang sudah ditutup. Buka periode itu dulu.`,
    );
  }

  const biaya = data.biaya_subkontrak;
  const jumlah = Number(cur.jumlah) || 0;
  const hppSatuan = jumlah > 0 ? biaya / jumlah : biaya;
  const hppTotal = biaya;
  const subtotal = Number(cur.subtotal) || 0;
  const grossProfit = subtotal - hppTotal;
  const grossMargin = subtotal > 0 ? (grossProfit / subtotal) * 100 : 0;

  await db.transaction(async () => {
    const upd = await db.update("item_penjualan", itemPenjualanId, {
      vendor_subkontrak_id: data.vendor_subkontrak_id,
      biaya_subkontrak: biaya,
      metode_bayar_vendor: data.metode_bayar_vendor,
      hpp_satuan: hppSatuan,
      hpp_total: hppTotal,
      gross_profit: grossProfit,
      gross_margin: grossMargin,
      pending_vendor_hpp: 0,
    });
    if (upd.error) throw friendlyPgError(upd.error, "item_penjualan");

    // Post HPP ke keuangan dengan token [REF:itemPenjualanId] (iron rule 4).
    const periodeId = await resolveOpenPeriodeIdForKeuangan();
    const maxOrderResult = await db.query<any>("keuangan", {
      orderBy: { column: "urutan_tampilan", ascending: false },
      limit: 1,
    });
    const nextOrder = (maxOrderResult.data?.[0]?.urutan_tampilan || 0) + 1;
    const invoiceLabel = saleRow?.nomor_faktur || "";
    const keperluan = `HPP Maklon ${invoiceLabel} [REF:${itemPenjualanId}]`;
    const finResult = await db.insert("keuangan", {
      id: generateId(),
      tanggal: tanggalSale,
      kategori_transaksi: "HPP_MAKLON",
      debit: 0,
      kredit: hppTotal,
      keperluan,
      omzet: 0,
      biaya_bahan: hppTotal,
      catatan: `Reconcile pending maklon ${invoiceLabel}`,
      dibuat_oleh: data.dibuat_oleh || null,
      urutan_tampilan: nextOrder,
      reference_type: "MAKLON_HPP",
      reference_id: itemPenjualanId,
      periode_id: periodeId,
    });
    if (finResult.error) throw friendlyPgError(finResult.error, "keuangan");
  });

  // Buat PO maklon di luar transaksi utama — createMaklonPurchase punya
  // transaksi tersendiri (pola createSaleAttempt). Jika gagal, baris item
  // sudah ter-reconcile; PO bisa dibuat ulang manual lewat UI pembelian.
  await createMaklonPurchase({
    saleId: cur.penjualan_id,
    saleInvoiceNumber: saleRow?.nomor_faktur || "",
    vendorId: data.vendor_subkontrak_id,
    metodeBayar: data.metode_bayar_vendor,
    tanggal: tanggalSale,
    dibuatOleh: data.dibuat_oleh || null,
    items: [
      {
        deskripsi_pekerjaan: cur.deskripsi_pekerjaan || "",
        jumlah,
        biaya_subkontrak: biaya,
      },
    ],
  });
}
