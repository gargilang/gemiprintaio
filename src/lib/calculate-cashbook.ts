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

  // Prepare dynamic update statements for each entry (to respect overrides)
  // We'll build the UPDATE query dynamically per row

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

    // OMZET: Accumulate from OMZET, PIUTANG, or LUNAS
    if (!row.override_omzet) {
      if (cat === "OMZET" || cat === "PIUTANG" || cat === "LUNAS") {
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
      // Use the saldo value from database (user manually set it)
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

    // Update the entry with calculated values (respecting overrides)
    // Build dynamic update to only update non-overridden fields
    const fieldsToUpdate: string[] = [];
    const valuesToUpdate: any[] = [];

    if (!row.override_omzet) {
      fieldsToUpdate.push("omzet = ?");
      valuesToUpdate.push(runningOmzet);
    }
    if (!row.override_biaya_operasional) {
      fieldsToUpdate.push("biaya_operasional = ?");
      valuesToUpdate.push(runningBiayaOps);
    }
    if (!row.override_biaya_bahan) {
      fieldsToUpdate.push("biaya_bahan = ?");
      valuesToUpdate.push(runningBiayaBahan);
    }
    if (!row.override_saldo) {
      fieldsToUpdate.push("saldo = ?");
      valuesToUpdate.push(runningSaldo);
    }
    if (!row.override_laba_bersih) {
      fieldsToUpdate.push("laba_bersih = ?");
      valuesToUpdate.push(runningLabaBersih);
    }
    if (!row.override_kasbon_anwar) {
      fieldsToUpdate.push("kasbon_anwar = ?");
      valuesToUpdate.push(runningKasbonAnwar);
    }
    if (!row.override_kasbon_suri) {
      fieldsToUpdate.push("kasbon_suri = ?");
      valuesToUpdate.push(runningKasbonSuri);
    }
    if (!row.override_kasbon_cahaya) {
      fieldsToUpdate.push("kasbon_cahaya = ?");
      valuesToUpdate.push(runningKasbonCahaya);
    }
    if (!row.override_kasbon_dinil) {
      fieldsToUpdate.push("kasbon_dinil = ?");
      valuesToUpdate.push(runningKasbonDinil);
    }
    if (!row.override_bagi_hasil_anwar) {
      fieldsToUpdate.push("bagi_hasil_anwar = ?");
      valuesToUpdate.push(runningBagiHasilAnwar);
    }
    if (!row.override_bagi_hasil_suri) {
      fieldsToUpdate.push("bagi_hasil_suri = ?");
      valuesToUpdate.push(runningBagiHasilSuri);
    }
    if (!row.override_bagi_hasil_gemi) {
      fieldsToUpdate.push("bagi_hasil_gemi = ?");
      valuesToUpdate.push(runningBagiHasilGemi);
    }

    // Only update if there are fields to update
    if (fieldsToUpdate.length > 0) {
      valuesToUpdate.push(row.id);
      const updateQuery = `UPDATE keuangan SET ${fieldsToUpdate.join(
        ", "
      )} WHERE id = ?`;
      db.prepare(updateQuery).run(...valuesToUpdate);
    }

    // Store previous laba bersih for next iteration
    prevLabaBersih = runningLabaBersih;
  }

  return rows.length;
}
