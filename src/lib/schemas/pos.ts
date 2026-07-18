import { z } from "zod";

/** Angka berhingga; coerce supaya "1000" dari klien JSON tetap valid, tapi NaN/garbage ditolak. */
const finiteNumber = z.coerce.number().finite();

const saleFinishingSchema = z
  .object({
    jenis_finishing: z.string().min(1),
    keterangan: z.string().optional(),
  })
  .passthrough();

const biayaTambahanSchema = z
  .object({
    label: z.string(),
    nominal: finiteNumber,
    modal: finiteNumber.nonnegative().optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    // Hanya validasi baris yang akan disimpan (label terisi & nominal > 0).
    const label = String(val.label || "").trim();
    const nominal = Number(val.nominal) || 0;
    const modal = Number(val.modal) || 0;
    if (!label || nominal <= 0) return;
    if (modal > nominal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Modal tidak boleh melebihi nominal biaya tambahan",
        path: ["modal"],
      });
    }
  });

const saleItemSchema = z
  .object({
    barang_id: z.string().min(1),
    harga_satuan_id: z.string().optional(),
    jumlah: finiteNumber.positive(),
    jumlah_roll: finiteNumber.int().min(1).optional(),
    nama_satuan: z.string(),
    faktor_konversi: finiteNumber.positive(),
    harga_satuan: finiteNumber.nonnegative(),
    subtotal: finiteNumber.nonnegative(),
    panjang: finiteNumber.positive().optional(),
    lebar: finiteNumber.positive().optional(),
    billed_panjang: finiteNumber.optional(),
    billed_lebar: finiteNumber.optional(),
    recommended_roll_width_m: finiteNumber.optional(),
    selectedRollSize: finiteNumber.optional(),
    // Info nesting roll (opsional, nullable untuk data lama).
    roll_items_per_row: finiteNumber.nullable().optional(),
    roll_rows: finiteNumber.nullable().optional(),
    roll_panjang_total_m: finiteNumber.nullable().optional(),
    finishing: z.array(saleFinishingSchema).optional(),
    tipe_item: z.enum(["BARANG", "JASA", "MAKLON"]).optional(),
    vendor_subkontrak_id: z.string().nullable().optional(),
    biaya_subkontrak: finiteNumber.nullable().optional(),
    metode_bayar_vendor: z
      .enum(["CASH", "NET30", "TRANSFER"])
      .nullable()
      .optional(),
    deskripsi_pekerjaan: z.string().nullable().optional(),
    biaya_tambahan: z.array(biayaTambahanSchema).optional(),
    catatan_item: z.string().optional(),
  })
  .passthrough();

export const createSaleSchema = z
  .object({
    pelanggan_id: z.string().optional(),
    pelanggan_nama_snapshot: z.string().optional(),
    pelanggan_kota: z.string().optional(),
    items: z.array(saleItemSchema).min(1, "Minimal satu item"),
    total_jumlah: finiteNumber.positive(),
    jumlah_dibayar: finiteNumber.nonnegative(),
    jumlah_kembalian: finiteNumber,
    metode_pembayaran: z.enum([
      "CASH",
      "TRANSFER",
      "QRIS",
      "DEBIT",
      "DOWN_PAYMENT",
      "NET30",
    ]),
    catatan: z.string().optional(),
    kasir_id: z.string().optional(),
    tanggal: z.string().optional(),
    prioritas: z.enum(["NORMAL", "KILAT"]).optional(),
    kena_ppn: z.boolean().optional(),
    ppn_persen: finiteNumber.nonnegative().optional(),
    ppn_metode: z.enum(["EKSKLUSIF", "INKLUSIF"]).optional(),
    nsfp_kode_transaksi: z.string().optional(),
    nsfp_tahun: z.string().optional(),
    nsfp_nomor_seri: z.string().optional(),
    tanggal_faktur_pajak: z.string().optional(),
    pelanggan_npwp_snapshot: z.string().optional(),
    pelanggan_alamat_npwp_snapshot: z.string().optional(),
    pelanggan_nama_npwp_snapshot: z.string().optional(),
    biaya_tambahan: z.array(biayaTambahanSchema).optional(),
  })
  .passthrough();

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
