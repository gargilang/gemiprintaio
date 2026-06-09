import { z } from "zod";

/** Angka berhingga; coerce supaya string angka dari klien JSON tetap valid, NaN ditolak. */
const finiteNumber = z.coerce.number().finite();

// ── Komponen kompensasi ──────────────────────────────────────────────────────
export const tipeKomponenEnum = z.enum([
  "GAJI_POKOK",
  "TUNJANGAN",
  "KOMISI",
  "BONUS",
]);
export const metodeKomponenEnum = z.enum(["TETAP", "PERSEN"]);

export const createKomponenSchema = z
  .object({
    actor_id: z.string().min(1, "Karyawan harus dipilih"),
    tipe: tipeKomponenEnum,
    nama: z.string().min(1, "Nama komponen harus diisi"),
    metode: metodeKomponenEnum,
    nominal: finiteNumber.nonnegative().optional(),
    persen: finiteNumber.nonnegative().optional(),
    sumber_formula_key: z.string().nullable().optional(),
    aktif_status: finiteNumber.int().optional(),
    urutan_tampilan: finiteNumber.int().optional(),
    catatan: z.string().nullable().optional(),
  })
  .passthrough();

export const updateKomponenSchema = z
  .object({
    id: z.string().min(1),
    tipe: tipeKomponenEnum.optional(),
    nama: z.string().min(1).optional(),
    metode: metodeKomponenEnum.optional(),
    nominal: finiteNumber.nonnegative().optional(),
    persen: finiteNumber.nonnegative().optional(),
    sumber_formula_key: z.string().nullable().optional(),
    aktif_status: finiteNumber.int().optional(),
    urutan_tampilan: finiteNumber.int().optional(),
    catatan: z.string().nullable().optional(),
  })
  .passthrough();

export const deleteKomponenSchema = z
  .object({ id: z.string().min(1) })
  .passthrough();

/** Body POST /api/penggajian/komponen dibedakan lewat field `action`. */
export const komponenActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create") }).merge(createKomponenSchema),
  z.object({ action: z.literal("update") }).merge(updateKomponenSchema),
  z.object({ action: z.literal("delete") }).merge(deleteKomponenSchema),
]);

// ── Pinjaman karyawan (kasbon) ───────────────────────────────────────────────
export const catatPinjamanSchema = z
  .object({
    actor_id: z.string().min(1, "Karyawan harus dipilih"),
    jumlah: finiteNumber.positive("Jumlah harus lebih dari 0"),
    tanggal: z.string().min(1, "Tanggal harus diisi"),
    keterangan: z.string().nullable().optional(),
  })
  .passthrough();

export const revertPinjamanSchema = z
  .object({ id: z.string().min(1) })
  .passthrough();

/** Body POST /api/penggajian/pinjaman: tarik | bayar | revert. */
export const pinjamanActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("tarik") }).merge(catatPinjamanSchema),
  z.object({ action: z.literal("bayar") }).merge(catatPinjamanSchema),
  z.object({ action: z.literal("revert") }).merge(revertPinjamanSchema),
]);

// ── Proses gaji ──────────────────────────────────────────────────────────────
export const metodeBayarEnum = z.enum(["CASH", "TRANSFER"]);

/** Hitung draft (tanpa tulis DB). */
export const hitungDraftSchema = z
  .object({
    action: z.literal("hitung"),
    periode: z.string().min(1, "Periode harus diisi (mis. 2026-06)"),
    sumber_nilai: z.record(z.string(), finiteNumber).optional(),
    potongan_per_actor: z.record(z.string(), finiteNumber).optional(),
  })
  .passthrough();

const draftSlipSchema = z
  .object({
    actor_id: z.string().min(1),
    nama: z.string().optional(),
    bruto: finiteNumber.nonnegative(),
    saldo_pinjaman: finiteNumber.optional(),
    potongan_kasbon: finiteNumber.nonnegative(),
    neto: finiteNumber,
    rincian: z.array(z.any()).optional(),
  })
  .passthrough();

/** Simpan draft ke DB (status DRAFT). */
export const simpanDraftSchema = z
  .object({
    action: z.literal("simpan"),
    periode: z.string().min(1),
    slips: z.array(draftSlipSchema).min(1, "Minimal 1 slip karyawan"),
    total_bruto: finiteNumber.nonnegative(),
    total_potongan_kasbon: finiteNumber.nonnegative(),
    total_neto: finiteNumber,
  })
  .passthrough();

/** Bayar proses gaji (DRAFT → DIBAYAR). */
export const bayarRunSchema = z
  .object({
    action: z.literal("bayar"),
    run_id: z.string().min(1),
    tanggal_bayar: z.string().min(1, "Tanggal bayar harus diisi"),
    metode_bayar: metodeBayarEnum.default("CASH"),
  })
  .passthrough();

/** Batalkan proses gaji (DIBAYAR → VOIDED). */
export const voidRunSchema = z
  .object({
    action: z.literal("void"),
    run_id: z.string().min(1),
  })
  .passthrough();

export const prosesGajiActionSchema = z.discriminatedUnion("action", [
  hitungDraftSchema,
  simpanDraftSchema,
  bayarRunSchema,
  voidRunSchema,
]);

export type KomponenActionInput = z.infer<typeof komponenActionSchema>;
export type PinjamanActionInput = z.infer<typeof pinjamanActionSchema>;
export type ProsesGajiActionInput = z.infer<typeof prosesGajiActionSchema>;
