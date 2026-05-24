"use client";

/**
 * Tab "PPN / Pajak" di halaman Settings.
 *
 * Mengelola:
 * 1. Status PKP toko (NPWP, alamat NPWP, default tarif & metode PPN).
 * 2. Pool NSFP (Nomor Seri Faktur Pajak) yang sudah dialokasikan dari
 *    Coretax DJP. User upload range, app pakai berurutan saat terbitkan
 *    faktur kena PPN.
 *
 * Model mental: pengaturan_toko adalah singleton ('default' row), nsfp_pool
 * append-only — sekali nomor TERPAKAI tidak boleh re-use, kalau cacet user
 * tandai BATAL dengan alasan.
 */

import { useEffect, useState } from "react";
import {
  getShopSettingsAction,
  updateShopSettingsAction,
  importNsfpRangeAction,
  listNsfpPoolAction,
  cancelNsfpAction,
} from "@/app/settings/actions";
import { formatNsfpString, formatNpwp, isValidNpwp } from "@/lib/ppn-helpers";

interface ShopSettings {
  id: string;
  nama_toko: string;
  alamat?: string | null;
  telepon?: string | null;
  email?: string | null;
  npwp?: string | null;
  alamat_npwp?: string | null;
  status_pkp: number;
  ppn_persen_default: number;
  ppn_metode_default: "EKSKLUSIF" | "INKLUSIF";
  ppn_default_aktif: number;
  nsfp_kode_transaksi_default: string;
  nsfp_tahun_aktif?: string | null;
  nsfp_seri_terakhir?: string | null;
}

interface NsfpRow {
  id: string;
  tahun: string;
  kode_transaksi: string;
  nomor_seri: string;
  status: "TERSEDIA" | "TERPAKAI" | "BATAL";
  penjualan_id?: string | null;
  catatan?: string | null;
}

export default function PpnTab() {
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [pool, setPool] = useState<NsfpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    msg: string;
  } | null>(null);

  // Form import NSFP
  const [importTahun, setImportTahun] = useState(
    String(new Date().getFullYear()).slice(-2)
  );
  const [importKode, setImportKode] = useState("01");
  const [importAwal, setImportAwal] = useState("");
  const [importAkhir, setImportAkhir] = useState("");

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        getShopSettingsAction(),
        listNsfpPoolAction({ limit: 1000 }),
      ]);
      setSettings(s as ShopSettings);
      setPool(p as NsfpRow[]);
    } catch (e) {
      console.error(e);
      setNotice({ kind: "error", msg: "Gagal memuat pengaturan PPN" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const showMsg = (kind: "success" | "error", msg: string) => {
    setNotice({ kind, msg });
    setTimeout(() => setNotice(null), 4000);
  };

  const saveSettings = async (patch: Partial<ShopSettings>) => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await updateShopSettingsAction(patch);
      setSettings(updated as ShopSettings);
      showMsg("success", "Pengaturan disimpan");
    } catch (e: any) {
      showMsg("error", e?.message || "Gagal menyimpan pengaturan");
    } finally {
      setSaving(false);
    }
  };

  const handleImportNsfp = async (e: React.FormEvent) => {
    e.preventDefault();
    const awal = parseInt(importAwal, 10);
    const akhir = parseInt(importAkhir, 10);
    if (
      !Number.isInteger(awal) ||
      !Number.isInteger(akhir) ||
      awal <= 0 ||
      akhir < awal
    ) {
      showMsg("error", "Range NSFP tidak valid");
      return;
    }
    try {
      const r = await importNsfpRangeAction({
        tahun: importTahun,
        kode_transaksi: importKode,
        nomor_awal: awal,
        nomor_akhir: akhir,
      });
      showMsg(
        "success",
        `Import NSFP: ${r.inserted} ditambah, ${r.skipped} sudah ada`
      );
      setImportAwal("");
      setImportAkhir("");
      await loadAll();
    } catch (e: any) {
      showMsg("error", e?.message || "Gagal import NSFP");
    }
  };

  const handleCancelNsfp = async (id: string) => {
    const alasan = prompt(
      "Alasan pembatalan NSFP (akan tercatat permanen):"
    );
    if (!alasan?.trim()) return;
    try {
      await cancelNsfpAction(id, alasan.trim());
      showMsg("success", "NSFP ditandai BATAL");
      await loadAll();
    } catch (e: any) {
      showMsg("error", e?.message || "Gagal membatalkan NSFP");
    }
  };

  if (loading || !settings) {
    return (
      <div className="text-gray-500 py-12 text-center">
        Memuat pengaturan PPN...
      </div>
    );
  }

  const tersedia = pool.filter((p) => p.status === "TERSEDIA").length;
  const terpakai = pool.filter((p) => p.status === "TERPAKAI").length;
  const batal = pool.filter((p) => p.status === "BATAL").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">PPN / Pajak</h2>
          <p className="text-sm text-gray-500">
            Pengaturan PKP, NPWP toko, dan pool Nomor Seri Faktur Pajak
            (NSFP) dari Coretax DJP.
          </p>
        </div>
      </div>

      {notice && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            notice.kind === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {notice.msg}
        </div>
      )}

      {/* Status PKP toko */}
      <section className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">Status PKP Toko</h3>
        <p className="text-sm text-gray-600">
          Aktifkan kalau toko sudah terdaftar sebagai Pengusaha Kena Pajak
          (PKP). Kalau non-aktif, toggle PPN di POS dan Pembelian disembunyikan.
        </p>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.status_pkp === 1}
            onChange={(e) =>
              saveSettings({ status_pkp: e.target.checked ? 1 : 0 })
            }
            className="w-5 h-5 rounded text-emerald-600"
            disabled={saving}
          />
          <span className="font-medium text-gray-700">
            Toko terdaftar sebagai PKP (memungut PPN)
          </span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              NPWP Toko
            </label>
            <input
              type="text"
              defaultValue={settings.npwp || ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && !isValidNpwp(v)) {
                  showMsg("error", "Format NPWP tidak valid (15 atau 16 digit)");
                  return;
                }
                if (v !== (settings.npwp || ""))
                  saveSettings({ npwp: v || null });
              }}
              placeholder="01.234.567.8-901.234"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              disabled={!settings.status_pkp}
            />
            {settings.npwp && (
              <p className="text-xs text-gray-500 mt-1">
                Tampilan: {formatNpwp(settings.npwp)}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alamat sesuai NPWP
            </label>
            <input
              type="text"
              defaultValue={settings.alamat_npwp || ""}
              onBlur={(e) => {
                if (e.target.value !== (settings.alamat_npwp || ""))
                  saveSettings({ alamat_npwp: e.target.value || null });
              }}
              placeholder="Alamat resmi yang muncul di faktur pajak"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              disabled={!settings.status_pkp}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tarif default PPN (%)
            </label>
            <input
              type="number"
              step="0.01"
              defaultValue={settings.ppn_persen_default}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v !== settings.ppn_persen_default)
                  saveSettings({ ppn_persen_default: v });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              disabled={!settings.status_pkp}
            />
            <p className="text-xs text-gray-500 mt-1">
              Saat ini 11% (UU HPP). Akan jadi 12% sesuai aturan DJP.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Metode default
            </label>
            <select
              value={settings.ppn_metode_default}
              onChange={(e) =>
                saveSettings({
                  ppn_metode_default: e.target.value as
                    | "EKSKLUSIF"
                    | "INKLUSIF",
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              disabled={!settings.status_pkp}
            >
              <option value="EKSKLUSIF">EKSKLUSIF (harga + PPN)</option>
              <option value="INKLUSIF">INKLUSIF (harga sudah PPN)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aktifkan PPN otomatis
            </label>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.ppn_default_aktif === 1}
                onChange={(e) =>
                  saveSettings({ ppn_default_aktif: e.target.checked ? 1 : 0 })
                }
                className="w-5 h-5 rounded text-emerald-600"
                disabled={!settings.status_pkp || saving}
              />
              <span className="text-sm text-gray-600">
                Toggle "kena PPN" ON di setiap transaksi baru
              </span>
            </label>
          </div>
        </div>
      </section>

      {/* NSFP pool */}
      <section className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">
          Nomor Seri Faktur Pajak (NSFP)
        </h3>
        <p className="text-sm text-gray-600">
          Upload range NSFP yang sudah didapat dari Coretax DJP. App akan
          memakai berurutan dari nomor terkecil saat menerbitkan faktur.
          NSFP yang sudah TERPAKAI tidak bisa dipakai ulang.
        </p>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-emerald-100 text-emerald-800 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{tersedia}</div>
            <div>Tersedia</div>
          </div>
          <div className="bg-blue-100 text-blue-800 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{terpakai}</div>
            <div>Terpakai</div>
          </div>
          <div className="bg-gray-200 text-gray-700 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{batal}</div>
            <div>Batal</div>
          </div>
        </div>

        <form
          onSubmit={handleImportNsfp}
          className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Tahun (2 digit)
            </label>
            <input
              type="text"
              maxLength={2}
              value={importTahun}
              onChange={(e) => setImportTahun(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Kode transaksi
            </label>
            <select
              value={importKode}
              onChange={(e) => setImportKode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="01">01 - Penjualan umum</option>
              <option value="02">02 - Pemungut PPN bendaharawan</option>
              <option value="03">03 - Pemungut PPN selain bendahara</option>
              <option value="04">04 - DPP nilai lain</option>
              <option value="05">05 - Reserved</option>
              <option value="06">06 - Tarif khusus</option>
              <option value="07">07 - Tidak dipungut</option>
              <option value="08">08 - Dibebaskan</option>
              <option value="09">09 - Aktiva pasal 16D</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Nomor awal
            </label>
            <input
              type="number"
              value={importAwal}
              onChange={(e) => setImportAwal(e.target.value)}
              placeholder="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Nomor akhir
            </label>
            <input
              type="number"
              value={importAkhir}
              onChange={(e) => setImportAkhir(e.target.value)}
              placeholder="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
          >
            Import Range
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2">NSFP</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Penjualan</th>
                <th className="px-3 py-2">Catatan</th>
                <th className="px-3 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {pool.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    Belum ada NSFP. Import range dari Coretax dulu.
                  </td>
                </tr>
              )}
              {pool.map((row) => (
                <tr key={row.id} className="border-t border-gray-200">
                  <td className="px-3 py-2 font-mono">
                    {formatNsfpString(
                      row.kode_transaksi,
                      row.tahun,
                      row.nomor_seri
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        row.status === "TERSEDIA"
                          ? "bg-emerald-100 text-emerald-800"
                          : row.status === "TERPAKAI"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {row.penjualan_id || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {row.catatan || ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.status === "TERSEDIA" && (
                      <button
                        type="button"
                        onClick={() => handleCancelNsfp(row.id)}
                        className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                      >
                        Batalkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
