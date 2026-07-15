"use server";

import { getReceivablesByCustomer } from "@/lib/services/pos-queries";
import {
  payReceivableLumpSum,
  payReceivable,
  revertSalePayment,
} from "@/lib/services/pos-mutations";
import { updateSaleCustomer } from "@/lib/services/production-service";
import { payReceivableLumpSumSchema } from "@/lib/schemas/inventori";
import { requireAdminOrManager } from "@/lib/auth-guard-server";
import { AuthGuardError } from "@/lib/auth-guard-error";
import { friendlyPgError } from "@/lib/pg-error";

/** Ambil daftar piutang dikelompokkan per pelanggan (read-only, tanpa guard). */
export async function getPiutangGroupedAction() {
  return getReceivablesByCustomer();
}

/** Bayar beberapa tagihan sekaligus dengan alokasi FIFO otomatis. */
export async function bayarPiutangLumpSumAction(input: unknown) {
  try {
    const s = await requireAdminOrManager();
    const parsed = payReceivableLumpSumSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false as const, status: 422, error: "Data pembayaran tidak valid" };
    }
    const hasil = await payReceivableLumpSum({
      ...parsed.data,
      referensi: parsed.data.referensi ?? undefined,
      catatan: parsed.data.catatan ?? undefined,
      dibuat_oleh: s.uid,
    });
    return { ok: true as const, ...hasil };
  } catch (e) {
    if (e instanceof AuthGuardError) {
      return { ok: false as const, status: e.status, error: e.message };
    }
    return {
      ok: false as const,
      status: 500,
      error: friendlyPgError(e, "piutang_penjualan"),
    };
  }
}

/** Bayar satu tagihan piutang (dari rincian grup). */
export async function bayarPiutangSatuAction(input: {
  piutang_id: string;
  jumlah_bayar: number;
  tanggal_bayar?: string;
  metode_pembayaran?: string;
  referensi?: string;
  catatan?: string;
}) {
  try {
    const s = await requireAdminOrManager();
    const hasil = await payReceivable({ ...input, dibuat_oleh: s.uid });
    return { ok: true as const, ...hasil };
  } catch (e) {
    if (e instanceof AuthGuardError) {
      return { ok: false as const, status: e.status, error: e.message };
    }
    return {
      ok: false as const,
      status: 500,
      error: friendlyPgError(e, "piutang_penjualan"),
    };
  }
}

/** Revert pembayaran piutang satu penjualan (jadikan AKTIF kembali). */
export async function revertPiutangAction(input: { sale_id: string }) {
  try {
    const s = await requireAdminOrManager();
    await revertSalePayment({ sale_id: input.sale_id, dibuat_oleh: s.uid });
    return { ok: true as const };
  } catch (e) {
    if (e instanceof AuthGuardError) {
      return { ok: false as const, status: e.status, error: e.message };
    }
    return {
      ok: false as const,
      status: 500,
      error: friendlyPgError(e, "penjualan"),
    };
  }
}

/** Isi atau ubah nama pelanggan untuk penjualan walk-in; sinkron ke Riwayat & SPK. */
export async function isiNamaPelangganAction(input: {
  penjualan_id: string;
  pelanggan_id?: string | null;
  pelanggan_nama_snapshot?: string | null;
}) {
  try {
    await requireAdminOrManager();
    await updateSaleCustomer(input.penjualan_id, {
      pelanggan_id: input.pelanggan_id ?? null,
      pelanggan_nama_snapshot: input.pelanggan_nama_snapshot ?? null,
    });
    return { ok: true as const };
  } catch (e) {
    if (e instanceof AuthGuardError) {
      return { ok: false as const, status: e.status, error: e.message };
    }
    return {
      ok: false as const,
      status: 500,
      error: friendlyPgError(e, "penjualan"),
    };
  }
}
