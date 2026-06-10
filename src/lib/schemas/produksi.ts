import { z } from "zod";
import {
  SEMUA_STATUS_ITEM,
  STATUS_ORDER,
} from "@/lib/produksi/status-produksi";

/** Status item produksi (gabungan cetak ∪ maklon). */
export const itemStatusSchema = z.enum(
  SEMUA_STATUS_ITEM as [string, ...string[]]
);

/** Status order produksi. */
export const orderStatusSchema = z.enum(
  STATUS_ORDER as unknown as [string, ...string[]]
);

/** Payload update status item dari klien. */
export const updateItemStatusSchema = z.object({
  status: itemStatusSchema,
  operator_id: z.string().optional(),
});

/** Payload update nama pelanggan sebuah penjualan (salah satu terisi). */
export const updateSaleCustomerSchema = z
  .object({
    pelanggan_id: z.string().nullish(),
    pelanggan_nama_snapshot: z.string().nullish(),
  })
  .refine(
    (v) =>
      (v.pelanggan_id != null && v.pelanggan_id !== "") ||
      (v.pelanggan_nama_snapshot != null &&
        v.pelanggan_nama_snapshot.trim() !== ""),
    { message: "Isi nama pelanggan atau pilih pelanggan terdaftar" }
  );
