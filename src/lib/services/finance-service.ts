/**
 * Finance Service
 * Cash book operations dengan running balance calculations
 */

import { db } from "../db-unified";

export interface CashBookEntry {
  id: string;
  tanggal: string;
  kategori_transaksi: string;
  debit: number;
  kredit: number;
  keperluan?: string;
  catatan?: string;
  saldo: number;
  omzet: number;
  biaya_operasional: number;
  biaya_bahan: number;
  laba_bersih: number;
  kasbon_anwar: number;
  kasbon_suri: number;
  kasbon_cahaya: number;
  kasbon_dinil: number;
  bagi_hasil_anwar: number;
  bagi_hasil_suri: number;
  bagi_hasil_gemi: number;
  urutan_tampilan: number;
  dibuat_oleh?: string;
  diarsipkan_pada?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Get all active cash book entries (not archived)
 */
export async function getCashBookEntries(): Promise<CashBookEntry[]> {
  try {
    const result = await db.query<CashBookEntry>("keuangan", {
      where: { diarsipkan_pada: null },
      orderBy: { column: "urutan_tampilan", ascending: false },
    });

    if (result.error) throw result.error;
    return result.data || [];
  } catch (error) {
    console.error("Error fetching cash book entries:", error);
    throw error;
  }
}

/**
 * Get single cash book entry
 */
export async function getCashBookEntry(
  id: string
): Promise<CashBookEntry | null> {
  try {
    const result = await db.queryOne<CashBookEntry>("keuangan", {
      where: { id },
    });

    if (result.error) throw result.error;
    return result.data;
  } catch (error) {
    console.error("Error fetching cash book entry:", error);
    throw error;
  }
}

/**
 * Calculate running totals based on previous entry
 */
async function calculateRunningTotals(
  kategori_transaksi: string,
  debit: number,
  kredit: number,
  keperluan: string
) {
  // Get last entry
  const lastEntryResult = await db.query<CashBookEntry>("keuangan", {
    orderBy: { column: "urutan_tampilan", ascending: false },
    limit: 1,
  });

  const lastEntry = lastEntryResult.data?.[0];
  const isFirstEntry = !lastEntry;

  // Previous values
  const prev = {
    saldo: isFirstEntry ? 0 : lastEntry.saldo,
    omzet: isFirstEntry ? 0 : lastEntry.omzet,
    biaya_operasional: isFirstEntry ? 0 : lastEntry.biaya_operasional,
    biaya_bahan: isFirstEntry ? 0 : lastEntry.biaya_bahan,
    laba_bersih: isFirstEntry ? 0 : lastEntry.laba_bersih,
    bagi_hasil_anwar: isFirstEntry ? 0 : lastEntry.bagi_hasil_anwar,
    bagi_hasil_suri: isFirstEntry ? 0 : lastEntry.bagi_hasil_suri,
    bagi_hasil_gemi: isFirstEntry ? 0 : lastEntry.bagi_hasil_gemi,
    kasbon_anwar: isFirstEntry ? 0 : lastEntry.kasbon_anwar,
    kasbon_suri: isFirstEntry ? 0 : lastEntry.kasbon_suri,
    kasbon_cahaya: isFirstEntry ? 0 : lastEntry.kasbon_cahaya,
    kasbon_dinil: isFirstEntry ? 0 : lastEntry.kasbon_dinil,
  };

  // OMZET
  let omzet;
  if (kategori_transaksi === "OMZET" || kategori_transaksi === "PIUTANG") {
    omzet = isFirstEntry ? debit : prev.omzet + debit;
  } else {
    omzet = isFirstEntry ? 0 : prev.omzet;
  }

  // BIAYA OPERASIONAL
  let biaya_operasional;
  if (isFirstEntry) {
    biaya_operasional = 0;
  } else {
    if (
      kategori_transaksi === "BIAYA" ||
      kategori_transaksi === "TABUNGAN" ||
      kategori_transaksi === "KOMISI"
    ) {
      biaya_operasional = prev.biaya_operasional + kredit;
    } else {
      biaya_operasional = prev.biaya_operasional;
    }
  }

  // BIAYA BAHAN
  let biaya_bahan;
  if (isFirstEntry) {
    biaya_bahan = 0;
  } else {
    if (kategori_transaksi === "SUPPLY" || kategori_transaksi === "HUTANG") {
      biaya_bahan = prev.biaya_bahan + kredit;
    } else {
      biaya_bahan = prev.biaya_bahan;
    }
  }

  // SALDO
  const saldo = isFirstEntry ? debit - kredit : prev.saldo + debit - kredit;

  // LABA BERSIH
  const laba_bersih = omzet - (biaya_operasional + biaya_bahan);

  // KASBON ANWAR
  let kasbon_anwar;
  if (kategori_transaksi === "PRIBADI-A") {
    if (isFirstEntry) {
      kasbon_anwar = debit > 0 ? -debit : kredit;
    } else {
      kasbon_anwar =
        debit > 0 ? prev.kasbon_anwar - debit : prev.kasbon_anwar + kredit;
    }
  } else {
    kasbon_anwar = isFirstEntry ? 0 : prev.kasbon_anwar;
  }

  // KASBON SURI
  let kasbon_suri;
  if (kategori_transaksi === "PRIBADI-S") {
    if (isFirstEntry) {
      kasbon_suri = debit > 0 ? -debit : kredit;
    } else {
      kasbon_suri =
        debit > 0 ? prev.kasbon_suri - debit : prev.kasbon_suri + kredit;
    }
  } else {
    kasbon_suri = isFirstEntry ? 0 : prev.kasbon_suri;
  }

  // BAGI HASIL ANWAR
  const bagi_hasil_anwar = laba_bersih / 3 - kasbon_anwar;

  // BAGI HASIL SURI
  const bagi_hasil_suri = laba_bersih / 3 - kasbon_suri;

  // BAGI HASIL GEMI
  const labaIncrement = isFirstEntry
    ? laba_bersih
    : laba_bersih - prev.laba_bersih;
  const investorDebit = kategori_transaksi === "INVESTOR" ? debit : 0;
  const investorKredit = kategori_transaksi === "INVESTOR" ? kredit : 0;
  const bagi_hasil_gemi =
    labaIncrement / 3 + prev.bagi_hasil_gemi + investorDebit - investorKredit;

  // KASBON CAHAYA
  let kasbon_cahaya;
  const hasCahaya = keperluan.toLowerCase().includes("cahaya");
  const isCahayaCategory =
    kategori_transaksi === "INVESTOR" || kategori_transaksi === "BIAYA";

  if (hasCahaya && isCahayaCategory) {
    if (isFirstEntry) {
      kasbon_cahaya = debit > 0 ? -debit : kredit;
    } else {
      kasbon_cahaya =
        debit > 0 ? prev.kasbon_cahaya - debit : prev.kasbon_cahaya + kredit;
    }
  } else {
    kasbon_cahaya = isFirstEntry ? 0 : prev.kasbon_cahaya;
  }

  // KASBON DINIL
  let kasbon_dinil;
  const hasDinil = keperluan.toLowerCase().includes("dinil");
  const isDinilCategory =
    kategori_transaksi === "INVESTOR" || kategori_transaksi === "BIAYA";

  if (hasDinil && isDinilCategory) {
    if (isFirstEntry) {
      kasbon_dinil = debit > 0 ? -debit : kredit;
    } else {
      kasbon_dinil =
        debit > 0 ? prev.kasbon_dinil - debit : prev.kasbon_dinil + kredit;
    }
  } else {
    kasbon_dinil = isFirstEntry ? 0 : prev.kasbon_dinil;
  }

  return {
    saldo,
    omzet,
    biaya_operasional,
    biaya_bahan,
    laba_bersih,
    kasbon_anwar,
    kasbon_suri,
    kasbon_cahaya,
    kasbon_dinil,
    bagi_hasil_anwar,
    bagi_hasil_suri,
    bagi_hasil_gemi,
  };
}

/**
 * Create new cash book entry
 */
export async function createCashBookEntry(data: {
  tanggal: string;
  kategori_transaksi: string;
  debit?: number;
  kredit?: number;
  keperluan?: string;
  catatan?: string;
  dibuat_oleh?: string;
}): Promise<{ id: string }> {
  try {
    const debit = data.debit || 0;
    const kredit = data.kredit || 0;

    // Validasi
    if (!data.tanggal || !data.kategori_transaksi) {
      throw new Error("Tanggal dan kategori wajib diisi");
    }

    if (debit > 0 && kredit > 0) {
      throw new Error("Tidak boleh mengisi debit dan kredit bersamaan");
    }

    if (debit === 0 && kredit === 0) {
      throw new Error("Debit atau kredit harus diisi");
    }

    // Get max urutan_tampilan
    const maxOrderResult = await db.queryRaw<{ max_order: number }>(
      "SELECT MAX(urutan_tampilan) as max_order FROM keuangan",
      []
    );
    const nextOrder = (maxOrderResult[0]?.max_order || 0) + 1;

    // Calculate running totals
    const totals = await calculateRunningTotals(
      data.kategori_transaksi,
      debit,
      kredit,
      data.keperluan || ""
    );

    // Create entry
    const id = `cb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const entry = {
      id,
      tanggal: data.tanggal,
      kategori_transaksi: data.kategori_transaksi,
      debit,
      kredit,
      keperluan: data.keperluan || "",
      catatan: data.catatan || "",
      urutan_tampilan: nextOrder,
      dibuat_oleh: data.dibuat_oleh || "",
      ...totals,
    };

    const result = await db.insert("keuangan", entry);
    if (result.error) throw result.error;

    return { id };
  } catch (error: any) {
    console.error("Error creating cash book entry:", error);
    throw error;
  }
}

/**
 * Update cash book entry
 */
export async function updateCashBookEntry(
  id: string,
  data: Partial<CashBookEntry>
): Promise<void> {
  try {
    const result = await db.update("keuangan", id, data);
    if (result.error) throw result.error;
  } catch (error) {
    console.error("Error updating cash book entry:", error);
    throw error;
  }
}

/**
 * Delete cash book entry
 */
export async function deleteCashBookEntry(id: string): Promise<void> {
  try {
    const result = await db.delete("keuangan", id);
    if (result.error) throw result.error;
  } catch (error) {
    console.error("Error deleting cash book entry:", error);
    throw error;
  }
}

/**
 * Delete all active cash book entries (preserves archived)
 */
export async function deleteAllCashbook(): Promise<{ deleted: number }> {
  try {
    // Only delete active transactions (diarsipkan_pada IS NULL)
    // This preserves archived transactions from "Tutup Buku"
    await db.executeRaw("DELETE FROM keuangan WHERE diarsipkan_pada IS NULL");

    // Can't get exact count easily, return 0
    return { deleted: 0 };
  } catch (error) {
    console.error("Error deleting all cashbook:", error);
    throw error;
  }
}
