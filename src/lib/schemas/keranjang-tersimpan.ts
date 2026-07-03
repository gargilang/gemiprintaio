import { z } from "zod";

export const parkCartInputSchema = z.object({
  label: z.string().min(1, "Label wajib").max(200),
  pelanggan_id: z.string().nullable().optional(),
  pelanggan_nama_snapshot: z.string().nullable().optional(),
  pelanggan_kota: z.string().nullable().optional(),
  prioritas: z.enum(["NORMAL", "KILAT"]).default("NORMAL"),
  ppn_snapshot: z.unknown().nullable().optional(),
  cart_snapshot: z.unknown(),
});
export type ParkCartInput = z.infer<typeof parkCartInputSchema>;
