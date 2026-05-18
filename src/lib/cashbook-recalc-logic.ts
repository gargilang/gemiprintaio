/**

 * Pure cashbook running-total logic (shared by SQLite + Supabase paths).

 */



import {

  type ProfitSharePartnerRuntime,

  defaultProfitSharePartners,

} from "@/lib/profit-share-config";



export interface CashbookRecalcInputRow {

  id: string;

  tanggal: string;

  kategori_transaksi: string;

  debit: number;

  kredit: number;

  keperluan?: string;

  catatan?: string;

  urutan_tampilan: number;

  dibuat_pada: string;

  diperbarui_pada?: string;

  diarsipkan_pada?: string | null;



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



  [key: string]: unknown;

}



function truthyOverride(v: unknown): boolean {

  return v === 1 || v === true;

}



function rowNum(row: CashbookRecalcInputRow, field: string): number {

  const v = row[field];

  return typeof v === "number" ? v : 0;

}



function overrideField(sourceColumn: string): string {

  return `override_${sourceColumn}`;

}



function kasbonRunning(

  runningKasbon: Record<string, number>,

  column: string | null

): number {

  if (!column) return 0;

  return runningKasbon[column] ?? 0;

}



/**

 * Sort order for recalculation: oldest book row first (matches SQLite query).

 */

export function sortCashbookRowsForRecalc<T extends CashbookRecalcInputRow>(

  rows: T[]

): T[] {

  return [...rows].sort((a, b) => {

    const uo = Number(a.urutan_tampilan) - Number(b.urutan_tampilan);

    if (uo !== 0) return uo;

    return String(a.dibuat_pada).localeCompare(String(b.dibuat_pada));

  });

}



/**

 * Returns per-row numeric fields to persist after full pass (same order as legacy loop).

 */

export function computeCashbookRecalculationUpdates(

  sortedRows: CashbookRecalcInputRow[],

  profitPartners: ProfitSharePartnerRuntime[] = defaultProfitSharePartners()

): Array<{ id: string; updates: Record<string, number> }> {

  const out: Array<{ id: string; updates: Record<string, number> }> = [];



  let runningOmzet = 0;

  let runningBiayaOps = 0;

  let runningBiayaBahan = 0;

  let runningSaldo = 0;

  let runningLabaBersih = 0;

  let runningKasbonAnwar = 0;

  let runningKasbonSuri = 0;

  let runningKasbonCahaya = 0;

  let runningKasbonDinil = 0;

  const runningKasbonByColumn: Record<string, number> = {

    kasbon_anwar: 0,

    kasbon_suri: 0,

    kasbon_cahaya: 0,

    kasbon_dinil: 0,

  };

  const runningBagiHasil: Record<string, number> = {};

  for (const p of profitPartners) {

    runningBagiHasil[p.sourceColumn] = 0;

  }

  let prevLabaBersih = 0;



  for (const row of sortedRows) {

    const cat = row.kategori_transaksi;

    const debit = row.debit || 0;

    const kredit = row.kredit || 0;

    const keperluan = (row.keperluan || "").toLowerCase();



    if (!truthyOverride(row.override_omzet)) {

      if (cat === "OMZET" || cat === "PIUTANG" || cat === "LUNAS") {

        runningOmzet += debit;

      }

    } else {

      runningOmzet = row.omzet;

    }



    if (!truthyOverride(row.override_biaya_operasional)) {

      if (cat === "BIAYA" || cat === "TABUNGAN" || cat === "KOMISI") {

        runningBiayaOps += kredit;

      }

    } else {

      runningBiayaOps = row.biaya_operasional;

    }



    if (!truthyOverride(row.override_biaya_bahan)) {

      if (cat === "SUPPLY" || cat === "HUTANG") {

        runningBiayaBahan += kredit;

      }

    } else {

      runningBiayaBahan = row.biaya_bahan;

    }



    if (!truthyOverride(row.override_saldo)) {

      runningSaldo += debit - kredit;

    } else {

      runningSaldo = row.saldo;

    }



    if (!truthyOverride(row.override_laba_bersih)) {

      runningLabaBersih = runningOmzet - runningBiayaOps - runningBiayaBahan;

    } else {

      runningLabaBersih = row.laba_bersih;

    }



    if (!truthyOverride(row.override_kasbon_anwar)) {

      if (cat === "PRIBADI-A") {

        runningKasbonAnwar += kredit - debit;

      }

    } else {

      runningKasbonAnwar = row.kasbon_anwar;

    }

    runningKasbonByColumn.kasbon_anwar = runningKasbonAnwar;



    if (!truthyOverride(row.override_kasbon_suri)) {

      if (cat === "PRIBADI-S") {

        runningKasbonSuri += kredit - debit;

      }

    } else {

      runningKasbonSuri = row.kasbon_suri;

    }

    runningKasbonByColumn.kasbon_suri = runningKasbonSuri;



    if (!truthyOverride(row.override_kasbon_cahaya)) {

      const isCahaya = keperluan.includes("cahaya");

      if (isCahaya && (cat === "INVESTOR" || cat === "BIAYA")) {

        runningKasbonCahaya += kredit - debit;

      }

    } else {

      runningKasbonCahaya = row.kasbon_cahaya;

    }

    runningKasbonByColumn.kasbon_cahaya = runningKasbonCahaya;



    if (!truthyOverride(row.override_kasbon_dinil)) {

      const isDinil = keperluan.includes("dinil");

      if (isDinil && (cat === "INVESTOR" || cat === "BIAYA")) {

        runningKasbonDinil += kredit - debit;

      }

    } else {

      runningKasbonDinil = row.kasbon_dinil;

    }

    runningKasbonByColumn.kasbon_dinil = runningKasbonDinil;



    for (const partner of profitPartners) {

      const col = partner.sourceColumn;

      const oKey = overrideField(col);

      if (truthyOverride(row[oKey])) {

        runningBagiHasil[col] = rowNum(row, col);

        continue;

      }



      const divisor =

        partner.shareDivisor > 0 ? partner.shareDivisor : 3;



      if (partner.formula === "third_minus_kasbon") {

        const kasbon = kasbonRunning(runningKasbonByColumn, partner.kasbonColumn);

        runningBagiHasil[col] = runningLabaBersih / divisor - kasbon;

      } else if (partner.formula === "incremental_investor") {

        const labaIncrement = runningLabaBersih - prevLabaBersih;

        runningBagiHasil[col] =

          (runningBagiHasil[col] ?? 0) + labaIncrement / divisor;

        if (cat === "INVESTOR") {

          runningBagiHasil[col] += debit - kredit;

        }

      }

    }



    const updates: Record<string, number> = {};



    if (!truthyOverride(row.override_omzet)) updates.omzet = runningOmzet;

    if (!truthyOverride(row.override_biaya_operasional))

      updates.biaya_operasional = runningBiayaOps;

    if (!truthyOverride(row.override_biaya_bahan))

      updates.biaya_bahan = runningBiayaBahan;

    if (!truthyOverride(row.override_saldo)) updates.saldo = runningSaldo;

    if (!truthyOverride(row.override_laba_bersih))

      updates.laba_bersih = runningLabaBersih;

    if (!truthyOverride(row.override_kasbon_anwar))

      updates.kasbon_anwar = runningKasbonAnwar;

    if (!truthyOverride(row.override_kasbon_suri))

      updates.kasbon_suri = runningKasbonSuri;

    if (!truthyOverride(row.override_kasbon_cahaya))

      updates.kasbon_cahaya = runningKasbonCahaya;

    if (!truthyOverride(row.override_kasbon_dinil))

      updates.kasbon_dinil = runningKasbonDinil;



    for (const partner of profitPartners) {

      const col = partner.sourceColumn;

      if (!truthyOverride(row[overrideField(col)])) {

        updates[col] = runningBagiHasil[col] ?? 0;

      }

    }



    if (Object.keys(updates).length > 0) {

      out.push({ id: row.id, updates });

    }



    prevLabaBersih = runningLabaBersih;

  }



  return out;

}


