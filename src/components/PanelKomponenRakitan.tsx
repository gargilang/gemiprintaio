"use client";

import { useState, useEffect, useMemo } from "react";
import {
  formatLabelKomponenDimensi,
  hitungQtyKomponenDimensiM2,
  isBarangBerdimensi,
} from "@/lib/bom-utils";

interface KomponenRow {
  id: string;
  komponen_id: string;
  komponen_nama: string;
  komponen_satuan: string;
  komponen_butuh_dimensi?: number;
  qty: number;
  jumlah_roll?: number | null;
  panjang?: number | null;
  lebar?: number | null;
  satuan: string | null;
  catatan: string | null;
}

interface BarangOption {
  id: string;
  nama: string;
  satuan_dasar: string;
  butuh_dimensi_status?: number;
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

  const [selectedKomponenId, setSelectedKomponenId] = useState("");
  const [qty, setQty] = useState("1");
  const [jumlahRoll, setJumlahRoll] = useState("1");
  const [lebar, setLebar] = useState("");
  const [panjang, setPanjang] = useState("");

  const candidateBarang = useMemo(
    () => allBarang.filter((b) => b.id !== parentBarangId),
    [allBarang, parentBarangId]
  );

  const selectedKomponen = useMemo(
    () => candidateBarang.find((b) => b.id === selectedKomponenId) ?? null,
    [candidateBarang, selectedKomponenId]
  );

  const komponenBerdimensi = isBarangBerdimensi(
    selectedKomponen?.butuh_dimensi_status
  );

  useEffect(() => {
    if (!komponenBerdimensi) {
      setJumlahRoll("1");
      setLebar("");
      setPanjang("");
    }
  }, [selectedKomponenId, komponenBerdimensi]);

  useEffect(() => {
    const ac = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/barang-komponen?parent_barang_id=${encodeURIComponent(parentBarangId)}`,
          { signal: ac.signal }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(
            typeof data.error === "string" && data.error
              ? data.error
              : "Gagal memuat komponen."
          );
          setRows([]);
          return;
        }
        setRows(data.komponen || []);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Gagal memuat komponen.");
        setRows([]);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => ac.abort();
  }, [parentBarangId]);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/barang-komponen?parent_barang_id=${encodeURIComponent(parentBarangId)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" && data.error
            ? data.error
            : "Gagal memuat komponen."
        );
        setRows([]);
        return;
      }
      setRows(data.komponen || []);
    } catch {
      setError("Gagal memuat komponen.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleTambah() {
    if (!selectedKomponenId) return setError("Pilih barang komponen.");

    let payload: Record<string, unknown> = {
      parent_barang_id: parentBarangId,
      komponen_id: selectedKomponenId,
    };

    if (komponenBerdimensi) {
      const rolls = Math.max(1, Math.round(parseFloat(jumlahRoll) || 0));
      const lebarNum = parseFloat(lebar);
      const panjangNum = parseFloat(panjang);
      if (!lebarNum || lebarNum <= 0 || !panjangNum || panjangNum <= 0) {
        return setError("Lebar dan panjang harus diisi (meter) untuk barang berdimensi.");
      }
      const qtyM2 = hitungQtyKomponenDimensiM2(rolls, panjangNum, lebarNum);
      if (qtyM2 <= 0) {
        return setError("Luas komponen tidak valid.");
      }
      payload = {
        ...payload,
        qty: qtyM2,
        jumlah_roll: rolls,
        lebar: lebarNum,
        panjang: panjangNum,
      };
    } else {
      const qtyNum = parseFloat(qty);
      if (!qtyNum || qtyNum <= 0) return setError("Qty harus lebih dari 0.");
      payload = { ...payload, qty: qtyNum };
    }

    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/barang-komponen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        return setError(d.error || "Gagal menyimpan.");
      }
      setSelectedKomponenId("");
      setQty("1");
      setJumlahRoll("1");
      setLebar("");
      setPanjang("");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function handleHapus(id: string) {
    const res = await fetch(`/api/barang-komponen?id=${id}`, { method: "DELETE" });
    if (res.ok) await reload();
  }

  function renderQtyCell(r: KomponenRow) {
    const dimLabel = formatLabelKomponenDimensi(r);
    if (dimLabel) {
      return (
        <div className="text-right">
          <div className="text-slate-800 dark:text-slate-100">{dimLabel}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            = {Number(r.qty).toLocaleString("id-ID", { maximumFractionDigits: 4 })} m² / unit
          </div>
        </div>
      );
    }
    return (
      <span className="text-slate-800 dark:text-slate-100">{r.qty}</span>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Saat SPK barang ini diselesaikan, stok komponen di bawah akan berkurang otomatis.
        Barang berdimensi memakai input Lebar × Panjang (m) dan jumlah roll.
      </p>

      {!loading && error && (
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}

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
                  Kebutuhan / unit
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
                  <td className="px-3 py-2 text-right">{renderQtyCell(r)}</td>
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

      <div className="space-y-3">
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
                  {isBarangBerdimensi(b.butuh_dimensi_status) ? " (m²)" : ""}
                </option>
              ))}
            </select>
          </div>

          {komponenBerdimensi ? (
            <>
              <div className="w-20">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Jumlah roll
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={jumlahRoll}
                  onChange={(e) => setJumlahRoll(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm px-2 py-1.5"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Lebar (m)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={lebar}
                  onChange={(e) => setLebar(e.target.value)}
                  placeholder="0"
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm px-2 py-1.5"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Panjang (m)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={panjang}
                  onChange={(e) => setPanjang(e.target.value)}
                  placeholder="0"
                  className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm px-2 py-1.5"
                />
              </div>
            </>
          ) : (
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
          )}

          <button
            type="button"
            disabled={saving}
            onClick={handleTambah}
            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? "Menyimpan..." : "+ Tambah"}
          </button>
        </div>

        {komponenBerdimensi && lebar && panjang && (
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Per unit rakitan:{" "}
            {hitungQtyKomponenDimensiM2(
              Math.max(1, Math.round(parseFloat(jumlahRoll) || 1)),
              parseFloat(panjang) || 0,
              parseFloat(lebar) || 0
            ).toLocaleString("id-ID", { maximumFractionDigits: 4 })}{" "}
            m²
          </p>
        )}
      </div>
    </div>
  );
}
