"use client";

import { useState, useEffect, useMemo } from "react";

interface KomponenRow {
  id: string;
  komponen_id: string;
  komponen_nama: string;
  komponen_satuan: string;
  qty: number;
  satuan: string | null;
  catatan: string | null;
}

interface BarangOption {
  id: string;
  nama: string;
  satuan_dasar: string;
}

interface Props {
  parentBarangId: string;
  /** Semua barang untuk pilih komponen — dikirim dari parent agar tidak double-fetch */
  allBarang: BarangOption[];
}

export default function PanelKomponenRakitan({ parentBarangId, allBarang }: Props) {
  const [rows, setRows] = useState<KomponenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form tambah komponen
  const [selectedKomponenId, setSelectedKomponenId] = useState("");
  const [qty, setQty] = useState("1");

  const candidateBarang = useMemo(
    () => allBarang.filter((b) => b.id !== parentBarangId),
    [allBarang, parentBarangId]
  );

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/barang-komponen?parent_barang_id=${parentBarangId}`);
      const data = await res.json();
      setRows(data.komponen || []);
    } catch {
      setError("Gagal memuat komponen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [parentBarangId]);

  async function handleTambah() {
    if (!selectedKomponenId) return setError("Pilih barang komponen.");
    const qtyNum = parseFloat(qty);
    if (!qtyNum || qtyNum <= 0) return setError("Qty harus lebih dari 0.");
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/barang-komponen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_barang_id: parentBarangId,
          komponen_id: selectedKomponenId,
          qty: qtyNum,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        return setError(d.error || "Gagal menyimpan.");
      }
      setSelectedKomponenId("");
      setQty("1");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleHapus(id: string) {
    const res = await fetch(`/api/barang-komponen?id=${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Saat SPK barang ini diselesaikan, stok komponen di bawah akan berkurang otomatis.
      </p>

      {loading ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Memuat...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 italic">
          Belum ada komponen. Tambahkan di bawah.
        </p>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">
                  Komponen
                </th>
                <th className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-300">
                  Qty
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300">
                  Satuan
                </th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{r.komponen_nama}</td>
                  <td className="px-3 py-2 text-right text-slate-800 dark:text-slate-100">{r.qty}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                    {r.satuan || r.komponen_satuan}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleHapus(r.id)}
                      className="text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 text-xs font-medium"
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form tambah komponen */}
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Barang komponen
          </label>
          <select
            value={selectedKomponenId}
            onChange={(e) => setSelectedKomponenId(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm px-2 py-1.5"
          >
            <option value="">— Pilih barang —</option>
            {candidateBarang.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nama}
              </option>
            ))}
          </select>
        </div>
        <div className="w-20">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Qty
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm px-2 py-1.5"
          />
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleTambah}
          className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? "Menyimpan..." : "+ Tambah"}
        </button>
      </div>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
