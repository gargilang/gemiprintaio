import "server-only";

/**
 * Service data Laporan Manajemen Bulanan.
 * Mengagregasi KPI, buku kas, hutang/piutang, inventori, dan data TTD
 * dari satu accounting_period yang sudah ditutup.
 */

import { db } from "@/lib/db-unified";
import { getFormalAccountingReport } from "@/lib/services/reports-service";
import { listFinanceCategories } from "@/lib/services/finance-config-service";
import { listBusinessActors } from "@/lib/services/business-actor-service";
import { formatPeriodKeyLabel } from "@/lib/laporan-bulanan-utils";

export { formatPeriodKeyLabel } from "@/lib/laporan-bulanan-utils";

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

function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function isPosted(row: { status_transaksi?: string }): boolean {
  return String(row.status_transaksi ?? "POSTED") === "POSTED";
}

/** Buat nomor laporan sequential: LPR/YYYY/MM/XXX. */
export async function generateNomorLaporan(periodKey: string): Promise<string> {
  const [yyyy, mm] = periodKey.split("-");
  const prefix = `LPR/${yyyy}/${mm}/`;

  const result = await db.query<{ nomor_laporan: string; is_deleted?: number }>(
    "laporan_bulanan",
    {},
  );
  if (result.error) throw result.error;

  const count = (result.data ?? []).filter(
    (row) =>
      (row.is_deleted ?? 0) === 0 && row.nomor_laporan.startsWith(prefix),
  ).length;

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
    throw new Error(
      "Hanya periode yang sudah ditutup yang bisa dicetak laporannya.",
    );
  }

  const period = periodRes.data;
  const { start_date, end_date, period_key } = period;

  const [formal, keuanganRes, pembelianRes, categories, actors, tokoRes] =
    await Promise.all([
      getFormalAccountingReport({
        startDate: start_date,
        endDate: end_date,
        periodeId: params.accounting_period_id,
      }),
      db.query<{
        tanggal: string;
        kategori_transaksi: string;
        kredit: number;
        status_transaksi?: string;
        periode_id?: string;
      }>("keuangan", {}),
      db.query<{
        tanggal: string;
        total_jumlah: number;
        status_transaksi?: string;
        periode_id?: string;
      }>("pembelian", {}),
      listFinanceCategories(),
      listBusinessActors(),
      db.queryOne<{
        nama_toko: string;
        slogan: string | null;
        alamat: string | null;
        telepon: string | null;
        email: string | null;
      }>("pengaturan_toko", { where: { id: "default" } }),
    ]);

  if (keuanganRes.error) throw keuanganRes.error;
  if (pembelianRes.error) throw pembelianRes.error;
  if (tokoRes.error) throw tokoRes.error;

  const totalGaji = (keuanganRes.data ?? [])
    .filter(
      (row) =>
        isPosted(row) &&
        row.kategori_transaksi === "GAJI" &&
        row.periode_id === params.accounting_period_id,
    )
    .reduce((sum, row) => sum + num(row.kredit), 0);

  const pembelianInPeriod = (pembelianRes.data ?? []).filter(
    (row) => isPosted(row) && row.periode_id === params.accounting_period_id,
  );
  const totalPembelian = pembelianInPeriod.reduce(
    (sum, row) => sum + num(row.total_jumlah),
    0,
  );
  const jumlahPO = pembelianInPeriod.length;

  const findByRoleCode = (keyword: string) =>
    actors.find((actor) =>
      actor.role_code.toLowerCase().includes(keyword.toLowerCase()),
    )?.display_name ?? null;

  const ttd: TtdInfo = {
    nama_direktur: findByRoleCode("direktur"),
    nama_manajer: findByRoleCode("manajer") ?? findByRoleCode("manager"),
  };

  const catMap = new Map(
    categories.map((cat) => [cat.category_code, cat.display_name]),
  );

  const bukuKas: BarisBukuKas[] = formal.cashReport.rows.map((row) => ({
    tanggal: row.date,
    kategori_label: catMap.get(row.category) ?? row.category,
    keperluan: row.description,
    debit: num(row.debit),
    kredit: num(row.credit),
    saldo: num(row.balance),
  }));

  const saldoAkhir = num(formal.cashReport.endingBalance);

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
    nilai_inventori: num(formal.inventory.inventoryValue),
  };

  const toko = tokoRes.data;

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
      jumlah_piutang: formal.receivables.count,
      total_piutang: formal.receivables.totalOutstanding,
      jumlah_hutang: formal.payables.count,
      total_hutang: formal.payables.totalOutstanding,
    },
    buku_kas: bukuKas,
    saldo_akhir: saldoAkhir,
    ttd,
    kata_pembuka: params.kata_pembuka,
    kata_penutup: params.kata_penutup,
  };
}
