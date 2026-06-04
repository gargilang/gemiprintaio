import "server-only";

import { db, getServerSupabaseClient } from "@/lib/db-unified";

/**
 * Laporan PPN bulanan — agregasi PPN keluaran (penjualan) dan masukan
 * (pembelian) untuk satu bulan, dipakai sebagai dasar input ke Coretax DJP.
 *
 * Sumber data:
 *   - PPN keluaran: penjualan dengan kena_ppn=1 dan status_transaksi != 'VOIDED'.
 *   - PPN masukan kreditable: pembelian dengan kena_ppn=1, dapat_dikreditkan=1,
 *     status_transaksi != 'VOIDED'.
 *
 * Output: dua array (keluaran + masukan) plus ringkasan (kurang/lebih bayar).
 */

export interface PpnRowKeluaran {
  penjualan_id: string;
  nomor_faktur: string;
  tanggal_faktur_pajak: string | null;
  tanggal_transaksi: string;
  nsfp: string | null;
  pelanggan_nama: string | null;
  pelanggan_npwp: string | null;
  dpp_total: number;
  ppn_total: number;
  total_jumlah: number;
  status_transaksi: string;
}

export interface PpnRowMasukan {
  pembelian_id: string;
  nomor_pembelian: string | null;
  nomor_faktur_pajak_vendor: string | null;
  tanggal_faktur_pajak: string | null;
  tanggal_transaksi: string;
  vendor_nama: string | null;
  vendor_npwp: string | null;
  dpp_total: number;
  ppn_total: number;
  total_jumlah: number;
  dapat_dikreditkan: number;
}

export interface PpnSummary {
  keluaran: PpnRowKeluaran[];
  masukan: PpnRowMasukan[];
  total_dpp_keluaran: number;
  total_ppn_keluaran: number;
  total_dpp_masukan: number;
  total_ppn_masukan: number;
  total_ppn_masukan_kreditable: number;
  /** PPN terhutang = PPN keluaran − PPN masukan kreditable. Positif = kurang bayar. */
  ppn_terhutang: number;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function monthBounds(year: number, month: number): { from: string; to: string } {
  // month adalah 1-12. JS Date.month adalah 0-11.
  const padM = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${padM}-01`,
    to: `${year}-${padM}-${String(lastDay).padStart(2, "0")}`,
  };
}

export async function getPpnReport(input: {
  year: number;
  month: number; // 1-12
}): Promise<PpnSummary> {
  const { from, to } = monthBounds(input.year, input.month);

  // Penjualan: pakai tanggal_faktur_pajak kalau ada, fallback ke dibuat_pada
  const sb = getServerSupabaseClient();
  let salesRows: any[] = [];
  let purchaseRows: any[] = [];

  if (sb) {
    // Supabase path
    const { data: salesData, error: salesErr } = await sb
      .from("penjualan")
      .select(
        "id, nomor_faktur, tanggal_faktur_pajak, dibuat_pada, status_transaksi, " +
          "kena_ppn, ppn_persen, dpp_total, ppn_total, total_jumlah, " +
          "nsfp_kode_transaksi, nsfp_tahun, nsfp_nomor_seri, " +
          "pelanggan_id, pelanggan_npwp_snapshot, pelanggan_alamat_npwp_snapshot, " +
          "pelanggan_nama_npwp_snapshot, pelanggan_nama_snapshot"
      )
      .eq("kena_ppn", 1)
      .neq("status_transaksi", "VOIDED");
    if (salesErr) throw salesErr;
    salesRows = salesData || [];

    const { data: purchData, error: purchErr } = await sb
      .from("pembelian")
      .select(
        "id, nomor_pembelian, nomor_faktur, tanggal, tanggal_faktur_pajak, " +
          "status_transaksi, kena_ppn, dapat_dikreditkan, ppn_persen, " +
          "dpp_total, ppn_total, total_jumlah, " +
          "vendor_id, vendor_npwp_snapshot, nomor_faktur_pajak_vendor"
      )
      .eq("kena_ppn", 1)
      .neq("status_transaksi", "VOIDED");
    if (purchErr) throw purchErr;
    purchaseRows = purchData || [];
  } else {
    // SQLite/Tauri path — db.query tidak support filter operator gt/lt jadi
    // ambil semua kena_ppn=1 dan filter di JS
    const sales = await db.query<any>("penjualan", {
      where: { kena_ppn: 1 },
    });
    if (sales.error) throw sales.error;
    salesRows = (sales.data || []).filter(
      (r: any) => r.status_transaksi !== "VOIDED"
    );

    const purch = await db.query<any>("pembelian", {
      where: { kena_ppn: 1 },
    });
    if (purch.error) throw purch.error;
    purchaseRows = (purch.data || []).filter(
      (r: any) => r.status_transaksi !== "VOIDED"
    );
  }

  // Filter by month: pakai tanggal_faktur_pajak kalau ada, fallback ke
  // tanggal transaksi (dibuat_pada untuk sale, tanggal untuk purchase)
  const inMonth = (d: string | null | undefined): boolean => {
    if (!d) return false;
    const s = String(d).split("T")[0];
    return s >= from && s <= to;
  };

  // Resolve pelanggan + vendor names in batch
  const pelangganIds = Array.from(
    new Set(salesRows.map((r) => r.pelanggan_id).filter(Boolean))
  );
  const vendorIds = Array.from(
    new Set(purchaseRows.map((r) => r.vendor_id).filter(Boolean))
  );

  const pelangganMap = new Map<string, any>();
  for (const id of pelangganIds) {
    const r = await db.queryOne<any>("pelanggan", { where: { id } });
    if (r.data) pelangganMap.set(id as string, r.data);
  }
  const vendorMap = new Map<string, any>();
  for (const id of vendorIds) {
    const r = await db.queryOne<any>("vendor", { where: { id } });
    if (r.data) vendorMap.set(id as string, r.data);
  }

  const formatNsfp = (
    kode: string | null | undefined,
    tahun: string | null | undefined,
    seri: string | null | undefined
  ): string | null => {
    if (!kode || !tahun || !seri) return null;
    return `${kode}0.000-${tahun}.${String(seri).padStart(8, "0")}`;
  };

  const keluaran: PpnRowKeluaran[] = salesRows
    .filter((r) =>
      inMonth(
        r.tanggal_faktur_pajak ||
          (r.dibuat_pada ? String(r.dibuat_pada).split("T")[0] : null)
      )
    )
    .map((r) => {
      const pl = r.pelanggan_id ? pelangganMap.get(r.pelanggan_id) : null;
      return {
        penjualan_id: r.id,
        nomor_faktur: r.nomor_faktur,
        tanggal_faktur_pajak: r.tanggal_faktur_pajak,
        tanggal_transaksi: r.dibuat_pada
          ? String(r.dibuat_pada).split("T")[0]
          : "",
        nsfp: formatNsfp(r.nsfp_kode_transaksi, r.nsfp_tahun, r.nsfp_nomor_seri),
        pelanggan_nama:
          r.pelanggan_nama_npwp_snapshot ||
          r.pelanggan_nama_snapshot ||
          pl?.nama ||
          null,
        pelanggan_npwp: r.pelanggan_npwp_snapshot || pl?.npwp || null,
        dpp_total: num(r.dpp_total),
        ppn_total: num(r.ppn_total),
        total_jumlah: num(r.total_jumlah),
        status_transaksi: r.status_transaksi || "POSTED",
      };
    })
    .sort((a, b) =>
      (a.tanggal_faktur_pajak || a.tanggal_transaksi).localeCompare(
        b.tanggal_faktur_pajak || b.tanggal_transaksi
      )
    );

  const masukan: PpnRowMasukan[] = purchaseRows
    .filter((r) =>
      inMonth(r.tanggal_faktur_pajak || r.tanggal || null)
    )
    .map((r) => {
      const v = r.vendor_id ? vendorMap.get(r.vendor_id) : null;
      return {
        pembelian_id: r.id,
        nomor_pembelian: r.nomor_pembelian || r.nomor_faktur || null,
        nomor_faktur_pajak_vendor: r.nomor_faktur_pajak_vendor || null,
        tanggal_faktur_pajak: r.tanggal_faktur_pajak || null,
        tanggal_transaksi: r.tanggal
          ? String(r.tanggal).split("T")[0]
          : "",
        vendor_nama: v?.nama_perusahaan || null,
        vendor_npwp: r.vendor_npwp_snapshot || v?.npwp || null,
        dpp_total: num(r.dpp_total),
        ppn_total: num(r.ppn_total),
        total_jumlah: num(r.total_jumlah),
        dapat_dikreditkan: r.dapat_dikreditkan ? 1 : 0,
      };
    })
    .sort((a, b) =>
      (a.tanggal_faktur_pajak || a.tanggal_transaksi).localeCompare(
        b.tanggal_faktur_pajak || b.tanggal_transaksi
      )
    );

  const total_dpp_keluaran = keluaran.reduce((s, r) => s + r.dpp_total, 0);
  const total_ppn_keluaran = keluaran.reduce((s, r) => s + r.ppn_total, 0);
  const total_dpp_masukan = masukan.reduce((s, r) => s + r.dpp_total, 0);
  const total_ppn_masukan = masukan.reduce((s, r) => s + r.ppn_total, 0);
  const total_ppn_masukan_kreditable = masukan
    .filter((r) => r.dapat_dikreditkan === 1)
    .reduce((s, r) => s + r.ppn_total, 0);

  return {
    keluaran,
    masukan,
    total_dpp_keluaran,
    total_ppn_keluaran,
    total_dpp_masukan,
    total_ppn_masukan,
    total_ppn_masukan_kreditable,
    ppn_terhutang: total_ppn_keluaran - total_ppn_masukan_kreditable,
  };
}
