/**
 * Central calculation logic for cash book entries
 * This module provides a unified calculation function used across all cashbook operations:
 * - Manual transaction entry (POST /api/finance/cash-book)
 * - Transaction update (PUT /api/finance/cash-book/[id])
 * - Transaction deletion (DELETE /api/finance/cash-book/[id])
 * - CSV import (POST /api/cashbook/import)
 * - Manual override (PATCH /api/cashbook/override/[id])
 * - Reorder operations (POST /api/cashbook/reorder) - NO RECALCULATION, just reorder
 */

import Database from "better-sqlite3";

interface CashBookEntry {
  id: string;
  tanggal: string;
  kategori_transaksi: string;
  debit: number;
  kredit: number;
  keperluan: string;
  catatan?: string;
  urutan_tampilan: number;
  dibuat_pada: string;
  diperbarui_pada?: string;
  diarsipkan_pada?: string | null;

  // Calculated fields
  omzet: number;
  biaya_operasional: number;
  biaya_bahan: number;
  saldo: number;
  laba_bersih: number;
  kasbon_anwar: number;
  kasbon_suri: number;
  kasbon_cahaya: number;
  kasbon_dinil: number;
  bagi_hasil_anwar: number;
  bagi_hasil_suri: number;
  bagi_hasil_gemi: number;

  // Override flags
  override_omzet?: number;
  override_biaya_operasional?: number;
  override_biaya_bahan?: number;
  override_saldo?: number;
  override_laba_bersih?: number;
  override_kasbon_anwar?: number;
  override_kasbon_suri?: number;
  override_kasbon_cahaya?: number;
  override_kasbon_dinil?: number;
  override_bagi_hasil_anwar?: number;
  override_bagi_hasil_suri?: number;
  override_bagi_hasil_gemi?: number;
}

/**
 * Recalculate all cash book entries based on entry order (oldest to newest)
 * Sorts by urutan_tampilan ASC (lower = older entry)
 * For entries with same urutan_tampilan, uses dibuat_pada ASC as tiebreaker
 *
 * @param db - Better-sqlite3 Database instance
 * @param whereClause - Optional WHERE clause (default: "diarsipkan_pada IS NULL")
 * @returns Number of entries recalculated
 */
export async function recalculateCashbook(
  db: Database.Database,
  whereClause: string = "diarsipkan_pada IS NULL"
): Promise<number> {
  // Fetch all entries sorted by urutan_tampilan ASC (oldest first), then dibuat_pada ASC
  // Lower urutan_tampilan = older transaction in the books
  const rows = db
    .prepare(
      `SELECT * FROM keuangan WHERE ${whereClause} ORDER BY urutan_tampilan ASC, dibuat_pada ASC`
    )
    .all() as CashBookEntry[];

  if (rows.length === 0) {
    return 0;
  }

  const updateStmt = db.prepare(`
    UPDATE keuangan SET
      omzet = ?, biaya_operasional = ?, biaya_bahan = ?, saldo = ?, laba_bersih = ?,
      kasbon_anwar = ?, kasbon_suri = ?, kasbon_cahaya = ?, kasbon_dinil = ?,
      bagi_hasil_anwar = ?, bagi_hasil_suri = ?, bagi_hasil_gemi = ?
    WHERE id = ?
  `);

  // Initialize running totals
  let runningOmzet = 0;
  let runningBiayaOps = 0;
  let runningBiayaBahan = 0;
  let runningSaldo = 0;
  let runningLabaBersih = 0;
  let runningKasbonAnwar = 0;
  let runningKasbonSuri = 0;
  let runningKasbonCahaya = 0;
  let runningKasbonDinil = 0;
  let runningBagiHasilAnwar = 0;
  let runningBagiHasilSuri = 0;
  let runningBagiHasilGemi = 0;
  let prevLabaBersih = 0;

  for (const row of rows) {
    const cat = row.kategori_transaksi;
    const debit = row.debit || 0;
    const kredit = row.kredit || 0;
    const keperluan = (row.keperluan || "").toLowerCase();

    // OMZET: Accumulate from OMZET or PIUTANG
    if (!row.override_omzet) {
      if (cat === "OMZET" || cat === "PIUTANG") {
        runningOmzet += debit;
      }
    } else {
      runningOmzet = row.omzet;
    }

    // BIAYA OPERASIONAL: Accumulate from BIAYA, TABUNGAN, or KOMISI
    if (!row.override_biaya_operasional) {
      if (cat === "BIAYA" || cat === "TABUNGAN" || cat === "KOMISI") {
        runningBiayaOps += kredit;
      }
    } else {
      runningBiayaOps = row.biaya_operasional;
    }

    // BIAYA BAHAN: Accumulate from SUPPLY or HUTANG
    if (!row.override_biaya_bahan) {
      if (cat === "SUPPLY" || cat === "HUTANG") {
        runningBiayaBahan += kredit;
      }
    } else {
      runningBiayaBahan = row.biaya_bahan;
    }

    // SALDO: Running balance (debit - kredit)
    if (!row.override_saldo) {
      runningSaldo += debit - kredit;
    } else {
      runningSaldo = row.saldo;
    }

    // LABA BERSIH: Omzet - Biaya Operasional - Biaya Bahan
    if (!row.override_laba_bersih) {
      runningLabaBersih = runningOmzet - runningBiayaOps - runningBiayaBahan;
    } else {
      runningLabaBersih = row.laba_bersih;
    }

    // KASBON ANWAR: PRIBADI-A category, debit decreases, kredit increases
    if (!row.override_kasbon_anwar) {
      if (cat === "PRIBADI-A") {
        runningKasbonAnwar += kredit - debit;
      }
    } else {
      runningKasbonAnwar = row.kasbon_anwar;
    }

    // KASBON SURI: PRIBADI-S category, debit decreases, kredit increases
    if (!row.override_kasbon_suri) {
      if (cat === "PRIBADI-S") {
        runningKasbonSuri += kredit - debit;
      }
    } else {
      runningKasbonSuri = row.kasbon_suri;
    }

    // KASBON CAHAYA: INVESTOR or BIAYA with "cahaya" in keperluan
    if (!row.override_kasbon_cahaya) {
      const isCahaya = keperluan.includes("cahaya");
      if (isCahaya && (cat === "INVESTOR" || cat === "BIAYA")) {
        runningKasbonCahaya += kredit - debit;
      }
    } else {
      runningKasbonCahaya = row.kasbon_cahaya;
    }

    // KASBON DINIL: INVESTOR or BIAYA with "dinil" in keperluan
    if (!row.override_kasbon_dinil) {
      const isDinil = keperluan.includes("dinil");
      if (isDinil && (cat === "INVESTOR" || cat === "BIAYA")) {
        runningKasbonDinil += kredit - debit;
      }
    } else {
      runningKasbonDinil = row.kasbon_dinil;
    }

    // BAGI HASIL ANWAR: (Laba Bersih / 3) - Kasbon Anwar
    if (!row.override_bagi_hasil_anwar) {
      runningBagiHasilAnwar = runningLabaBersih / 3 - runningKasbonAnwar;
    } else {
      runningBagiHasilAnwar = row.bagi_hasil_anwar;
    }

    // BAGI HASIL SURI: (Laba Bersih / 3) - Kasbon Suri
    if (!row.override_bagi_hasil_suri) {
      runningBagiHasilSuri = runningLabaBersih / 3 - runningKasbonSuri;
    } else {
      runningBagiHasilSuri = row.bagi_hasil_suri;
    }

    // BAGI HASIL GEMI: (Delta Laba Bersih / 3) + Previous Bagi Hasil Gemi + INVESTOR adjustments
    if (!row.override_bagi_hasil_gemi) {
      const labaIncrement = runningLabaBersih - prevLabaBersih;
      runningBagiHasilGemi += labaIncrement / 3;

      // Add INVESTOR debit, subtract INVESTOR kredit
      if (cat === "INVESTOR") {
        runningBagiHasilGemi += debit - kredit;
      }
    } else {
      runningBagiHasilGemi = row.bagi_hasil_gemi;
    }

    // Update the entry with calculated values
    updateStmt.run(
      runningOmzet,
      runningBiayaOps,
      runningBiayaBahan,
      runningSaldo,
      runningLabaBersih,
      runningKasbonAnwar,
      runningKasbonSuri,
      runningKasbonCahaya,
      runningKasbonDinil,
      runningBagiHasilAnwar,
      runningBagiHasilSuri,
      runningBagiHasilGemi,
      row.id
    );

    // Store previous laba bersih for next iteration
    prevLabaBersih = runningLabaBersih;
  }

  return rows.length;
}
