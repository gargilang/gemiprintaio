import "server-only";

/**
 * Service data Laporan Manajemen Bulanan.
 * Mengagregasi KPI, buku kas, hutang/piutang, inventori, dan data TTD
 * dari satu accounting_period yang sudah ditutup.
 */

import { db } from "@/lib/db-unified";
import { getFormalAccountingReport } from "@/lib/services/reports-service";
import { formatPeriodKeyLabel } from "@/lib/laporan-bulanan-utils";

export { formatPeriodKeyLabel } from "@/lib/laporan-bulanan-utils";

// ── Tipe data publik ────────────────────────────────────────────────────────

export interface InfoToko {
  nama_toko: string;
  slogan: string | null;
  alamat: string | null;
  telepon: string | null;
  email: string | null;
}

export interface KpiLaporan {
  omzet: number;
  jumlah_faktur_penjualan: number;
  hpp: number;
  laba_kotor: number;
  margin_kotor_persen: number;
  biaya_operasional: number;
  total_gaji: number;
  laba_bersih: number;
  margin_bersih_persen: number;
  total_pembelian: number;
  jumlah_po: number;
  nilai_inventori: number;
}

export interface SaldoHutangPiutang {
  jumlah_piutang: number;
  total_piutang: number;
  jumlah_hutang: number;
  total_hutang: number;
}

export interface BarisBukuKas {
  tanggal: string;
  kategori_label: string;
  keperluan: string;
  debit: number;
  kredit: number;
  saldo: number;
}

export interface TtdInfo {
  nama_direktur: string | null;
  nama_manajer: string | null;
}

export interface LaporanBulananData {
  nomor_laporan: string;
  periode_label: string;
  start_date: string;
  end_date: string;
  info_toko: InfoToko;
  kpi: KpiLaporan;
  hutang_piutang: SaldoHutangPiutang;
  buku_kas: BarisBukuKas[];
  saldo_akhir: number;
  ttd: TtdInfo;
  kata_pembuka: string;
  kata_penutup: string;
}

// ── Helper ──────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

// ── Fungsi utama ────────────────────────────────────────────────────────────

/**
 * Buat nomor laporan sequential: LPR/YYYY/MM/XXX.
 * Hitung berapa laporan sudah ada untuk YYYY/MM yang sama, lalu +1.
 */
export async function generateNomorLaporan(periodKey: string): Promise<string> {
  const [yyyy, mm] = periodKey.split("-");
  const prefix = `LPR/${yyyy}/${mm}/`;

  const rows = await db.queryRaw<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM laporan_bulanan
     WHERE nomor_laporan LIKE ?`,
    [`${prefix}%`]
  );
  const count = num(rows[0]?.cnt ?? 0);
  const seq = String(count + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

/** Simpan record laporan bulanan ke DB. */
export async function simpanLaporanBulanan(params: {
  id: string;
  nomor_laporan: string;
  accounting_period_id: string;
  dibuat_oleh: string;
  kata_pembuka: string;
  kata_penutup: string;
}): Promise<void> {
  await db.insert("laporan_bulanan", {
    id: params.id,
    nomor_laporan: params.nomor_laporan,
    accounting_period_id: params.accounting_period_id,
    dibuat_oleh: params.dibuat_oleh,
    kata_pembuka: params.kata_pembuka,
    kata_penutup: params.kata_penutup,
    dibuat_pada: new Date().toISOString(),
  });
}

/** Ambil semua data yang dibutuhkan untuk mencetak laporan bulanan. */
export async function getLaporanBulananData(params: {
  accounting_period_id: string;
  nomor_laporan: string;
  kata_pembuka: string;
  kata_penutup: string;
}): Promise<LaporanBulananData> {
  const periodRes = await db.queryOne<{
    id: string;
    period_key: string;
    start_date: string;
    end_date: string;
    status: string;
  }>("accounting_periods", { where: { id: params.accounting_period_id } });

  if (periodRes.error) throw periodRes.error;
  if (!periodRes.data) throw new Error("Periode tidak ditemukan.");
  if (periodRes.data.status !== "CLOSED") {
    throw new Error("Hanya periode yang sudah ditutup yang bisa dicetak laporannya.");
  }

  const period = periodRes.data;
  const { start_date, end_date, period_key } = period;

  const formal = await getFormalAccountingReport({ startDate: start_date, endDate: end_date });

  const gajiRows = await db.queryRaw<{ total: number }>(
    `SELECT COALESCE(SUM(kredit), 0) AS total
     FROM keuangan
     WHERE status_transaksi = 'POSTED'
       AND kategori_transaksi = 'GAJI'
       AND tanggal BETWEEN ? AND ?`,
    [start_date, end_date]
  );
  const totalGaji = num(gajiRows[0]?.total ?? 0);

  const pembelianRows = await db.queryRaw<{ total: number; cnt: number }>(
    `SELECT COALESCE(SUM(total_jumlah), 0) AS total, COUNT(*) AS cnt
     FROM pembelian
     WHERE status_transaksi = 'POSTED'
       AND tanggal BETWEEN ? AND ?`,
    [start_date, end_date]
  );
  const totalPembelian = num(pembelianRows[0]?.total ?? 0);
  const jumlahPO = num(pembelianRows[0]?.cnt ?? 0);

  const piutangRows = await db.queryRaw<{ cnt: number; total: number }>(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(sisa_piutang), 0) AS total
     FROM piutang_penjualan
     WHERE sisa_piutang > 0`,
    []
  );
  const hutangRows = await db.queryRaw<{ cnt: number; total: number }>(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(sisa_hutang), 0) AS total
     FROM hutang_pembelian
     WHERE sisa_hutang > 0`,
    []
  );

  const inventoriRows = await db.queryRaw<{ nilai: number }>(
    `SELECT COALESCE(SUM(jumlah_stok * average_cost_per_base_unit), 0) AS nilai
     FROM barang
     WHERE lacak_inventori_status != 0`,
    []
  );
  const nilaiInventori = num(inventoriRows[0]?.nilai ?? 0);

  const pegawaiList = await db.queryRaw<{ display_name: string; role_label: string }>(
    `SELECT p.display_name, r.role_label
     FROM pegawai p
     JOIN peran_pegawai r ON p.role_code = r.role_code
     WHERE p.is_active = 1`,
    []
  );
  const findRole = (keyword: string) =>
    pegawaiList.find((p) =>
      p.role_label.toLowerCase().includes(keyword.toLowerCase())
    )?.display_name ?? null;

  const ttd: TtdInfo = {
    nama_direktur: findRole("direktur"),
    nama_manajer: findRole("manajer") ?? findRole("manager"),
  };

  const tokoRes = await db.queryOne<{
    nama_toko: string;
    slogan: string | null;
    alamat: string | null;
    telepon: string | null;
    email: string | null;
  }>("pengaturan_toko", { where: { id: "default" } });
  const toko = tokoRes.data;

  const kasRows = await db.queryRaw<{
    tanggal: string;
    kategori_transaksi: string;
    keperluan: string | null;
    debit: number;
    kredit: number;
    saldo: number;
  }>(
    `SELECT tanggal, kategori_transaksi, keperluan, debit, kredit, saldo
     FROM keuangan
     WHERE status_transaksi = 'POSTED'
       AND tanggal BETWEEN ? AND ?
     ORDER BY tanggal ASC, dibuat_pada ASC`,
    [start_date, end_date]
  );

  const catDefs = await db.queryRaw<{ category_code: string; display_name: string }>(
    `SELECT category_code, display_name FROM finance_category_definitions`,
    []
  );
  const catMap = new Map(catDefs.map((c) => [c.category_code, c.display_name]));

  const bukuKas: BarisBukuKas[] = kasRows.map((row) => ({
    tanggal: row.tanggal,
    kategori_label: catMap.get(row.kategori_transaksi) ?? row.kategori_transaksi,
    keperluan: row.keperluan ?? "",
    debit: num(row.debit),
    kredit: num(row.kredit),
    saldo: num(row.saldo),
  }));

  const saldoAkhir = bukuKas.length > 0 ? bukuKas[bukuKas.length - 1].saldo : 0;

  const omzet = formal.profitLoss.revenue;
  const hpp = formal.profitLoss.cogs;
  const labaKotor = formal.profitLoss.grossProfit;
  const marginKotor =
    omzet > 0 ? Math.round((labaKotor / omzet) * 10000) / 100 : 0;
  const biayaOps = formal.profitLoss.operationalExpenses;
  const labaBersih = formal.profitLoss.netProfit;
  const marginBersih =
    omzet > 0 ? Math.round((labaBersih / omzet) * 10000) / 100 : 0;

  const kpi: KpiLaporan = {
    omzet,
    jumlah_faktur_penjualan: formal.profitLoss.salesCount,
    hpp,
    laba_kotor: labaKotor,
    margin_kotor_persen: marginKotor,
    biaya_operasional: biayaOps,
    total_gaji: totalGaji,
    laba_bersih: labaBersih,
    margin_bersih_persen: marginBersih,
    total_pembelian: totalPembelian,
    jumlah_po: jumlahPO,
    nilai_inventori: nilaiInventori,
  };

  return {
    nomor_laporan: params.nomor_laporan,
    periode_label: formatPeriodKeyLabel(period_key),
    start_date,
    end_date,
    info_toko: {
      nama_toko: toko?.nama_toko ?? "gemiprint",
      slogan: toko?.slogan ?? null,
      alamat: toko?.alamat ?? null,
      telepon: toko?.telepon ?? null,
      email: toko?.email ?? null,
    },
    kpi,
    hutang_piutang: {
      jumlah_piutang: num(piutangRows[0]?.cnt ?? 0),
      total_piutang: num(piutangRows[0]?.total ?? 0),
      jumlah_hutang: num(hutangRows[0]?.cnt ?? 0),
      total_hutang: num(hutangRows[0]?.total ?? 0),
    },
    buku_kas: bukuKas,
    saldo_akhir: saldoAkhir,
    ttd,
    kata_pembuka: params.kata_pembuka,
    kata_penutup: params.kata_penutup,
  };
}
