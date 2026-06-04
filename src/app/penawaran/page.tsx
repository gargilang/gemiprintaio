"use client";

import { useMemo, useState } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { QuotationIcon } from "@/components/icons/PageIcons";
import {
  convertQuotationToSaleAction,
  createQuotationAction,
  getPenawaranInitAction,
  updateQuotationStatusAction,
} from "./actions";

type DraftItem = {
  barang_id: string;
  harga_satuan_id?: string;
  jumlah: number;
  nama_satuan: string;
  faktor_konversi: number;
  harga_satuan: number;
};

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const initial = { quotations: [], customers: [], materials: [] };

export default function PenawaranPage() {
  const { data: rawData, isLoading, mutate } = useCachedData<any>(
    "penawaran-init",
    getPenawaranInitAction
  );
  const data = rawData ?? initial;
  const loading = isLoading && !rawData;
  const reload = async () => {
    await mutate();
  };
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [catatan, setCatatan] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "SENT">("DRAFT");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [convertTarget, setConvertTarget] = useState<any>(null);
  const [convertForm, setConvertForm] = useState({
    metode_pembayaran: "NET30" as "CASH" | "TRANSFER" | "NET30",
    jumlah_dibayar: 0,
    tanggal: "",
  });

  const total = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.jumlah || 0) * Number(item.harga_satuan || 0), 0),
    [items]
  );

  function addItem(materialId: string) {
    const material = data.materials.find((m: any) => m.id === materialId);
    const unit =
      material?.unit_prices?.find((u: any) => Number(u.default_status) === 1) ||
      material?.unit_prices?.[0];
    if (!material || !unit) return;
    setItems((prev) => [
      ...prev,
      {
        barang_id: material.id,
        harga_satuan_id: unit.id,
        jumlah: 1,
        nama_satuan: unit.nama_satuan,
        faktor_konversi: Number(unit.faktor_konversi || 1),
        harga_satuan: Number(unit.harga_jual || unit.harga_member || 0),
      },
    ]);
  }

  async function submit() {
    if (items.length === 0) return setNotice("Tambahkan item dulu.");
    setSaving(true);
    try {
      const customer = data.customers.find((c: any) => c.id === customerId);
      await createQuotationAction({
        pelanggan_id: customerId || null,
        pelanggan_nama_snapshot: customer?.nama || null,
        pelanggan_kota: customer?.alamat || null,
        status,
        catatan,
        items: items.map((item) => ({
          ...item,
          subtotal: Number(item.jumlah || 0) * Number(item.harga_satuan || 0),
        })),
      });
      setItems([]);
      setCatatan("");
      setNotice("Penawaran tersimpan.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan penawaran");
    } finally {
      setSaving(false);
    }
  }

  function openConvert(quote: any) {
    setConvertTarget(quote);
    setConvertForm({
      metode_pembayaran: "NET30",
      jumlah_dibayar: 0,
      tanggal: new Date().toISOString().slice(0, 10),
    });
  }

  async function confirmConvert() {
    if (!convertTarget) return;
    setSaving(true);
    try {
      await convertQuotationToSaleAction(convertTarget.id, {
        metode_pembayaran: convertForm.metode_pembayaran,
        jumlah_dibayar: Number(convertForm.jumlah_dibayar || 0),
        jumlah_kembalian: 0,
        tanggal: convertForm.tanggal || undefined,
      });
      setNotice(`Penawaran ${convertTarget.nomor_penawaran} dikonversi ke penjualan.`);
      setConvertTarget(null);
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal konversi");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, next: "ACCEPTED" | "SENT" | "CANCELLED") {
    setSaving(true);
    try {
      await updateQuotationStatusAction(id, next);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  function printQuote(quote: any) {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const itemsHtml = (quote.items || [])
      .map(
        (item: any, index: number) => `
          <tr>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;">${index + 1}</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;">${item.barang_nama || item.barang_id}</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;">${Number(item.jumlah || 0).toLocaleString("id-ID")} ${item.nama_satuan || ""}</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;">${money(item.harga_satuan)}</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;">${money(item.subtotal)}</td>
          </tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${quote.nomor_penawaran}</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;padding:24px;}
  h1{margin:0 0 4px;font-size:22px;}
  table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;}
  th{background:#f1f5f9;border:1px solid #cbd5e1;padding:8px;text-align:left;}
  .meta{display:flex;justify-content:space-between;margin-top:12px;font-size:13px;color:#475569;}
  .total{margin-top:12px;display:flex;justify-content:flex-end;font-size:16px;font-weight:600;}
  .notes{margin-top:18px;font-size:12px;color:#475569;white-space:pre-wrap;}
  .footer{margin-top:32px;font-size:12px;color:#94a3b8;}
</style></head><body>
<h1>PENAWARAN HARGA</h1>
<div style="font-size:13px;color:#475569;">No: ${quote.nomor_penawaran}</div>
<div class="meta">
  <div>
    <div><strong>Kepada:</strong> ${quote.pelanggan_nama_snapshot || "Pelanggan Umum"}</div>
    <div>${quote.pelanggan_kota || ""}</div>
  </div>
  <div style="text-align:right;">
    <div>Tanggal: ${quote.tanggal || ""}</div>
    <div>Berlaku s.d.: ${quote.berlaku_sampai || "-"}</div>
    <div>Status: ${quote.status}</div>
  </div>
</div>
<table>
  <thead><tr><th>#</th><th>Barang</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Harga</th><th style="text-align:right;">Subtotal</th></tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<div class="total">Total: ${money(quote.total_jumlah)}</div>
${quote.catatan ? `<div class="notes"><strong>Catatan:</strong>\n${quote.catatan}</div>` : ""}
<div class="footer">Dokumen ini dihasilkan otomatis. Silakan konfirmasi sebelum konversi ke faktur.</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
    win.document.write(html);
    win.document.close();
  }

  return (
    <div className="space-y-6">
      {/* Title Card */}
      <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <QuotationIcon size={28} className="text-white" />
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wide">Penawaran</h2>
              <p className="text-white/90 text-sm">Draf, kirim, cetak, dan konversi ke faktur.</p>
            </div>
          </div>
          {notice ? <div className="rounded-md bg-white/20 px-3 py-2 text-sm text-white">{notice}</div> : null}
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">Buat Penawaran</h2>
          <div className="space-y-3">
            <select className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Pelanggan Umum</option>
              {data.customers.map((c: any) => (
                <option key={c.id} value={c.id}>{c.nama}</option>
              ))}
            </select>
            <select className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2" onChange={(e) => { addItem(e.target.value); e.currentTarget.value = ""; }}>
              <option value="">Tambah barang</option>
              {data.materials.map((m: any) => (
                <option key={m.id} value={m.id}>{m.nama}</option>
              ))}
            </select>
            <div className="space-y-2">
              {items.map((item, index) => {
                const material = data.materials.find((m: any) => m.id === item.barang_id);
                return (
                  <div key={`${item.barang_id}-${index}`} className="grid grid-cols-[1fr_70px_100px_32px] gap-2 rounded-md bg-slate-50 dark:bg-slate-800 p-2 text-sm">
                    <span className="self-center truncate text-slate-800 dark:text-slate-100">{material?.nama || item.barang_id}</span>
                    <input className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1" type="number" min="0" value={item.jumlah} onChange={(e) => setItems((prev) => prev.map((row, i) => i === index ? { ...row, jumlah: Number(e.target.value) } : row))} />
                    <input className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1" type="number" min="0" value={item.harga_satuan} onChange={(e) => setItems((prev) => prev.map((row, i) => i === index ? { ...row, harga_satuan: Number(e.target.value) } : row))} />
                    <button className="rounded bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}>x</button>
                  </div>
                );
              })}
            </div>
            <textarea className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2" placeholder="Catatan" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
            <select className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2" value={status} onChange={(e) => setStatus(e.target.value as "DRAFT" | "SENT")}>
              <option value="DRAFT">Draf</option>
              <option value="SENT">Terkirim</option>
            </select>
            <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-100">
              <span>Total</span>
              <span>{money(total)}</span>
            </div>
            <button disabled={saving} className="w-full rounded-md bg-cyan-600 px-4 py-2 font-medium text-white disabled:opacity-60 hover:bg-cyan-700 transition-colors" onClick={submit}>
              Simpan Penawaran
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-300">
              <tr>
                <th className="p-3">Nomor</th>
                <th className="p-3">Pelanggan</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-4 text-slate-500 dark:text-slate-400" colSpan={5}>Memuat...</td></tr>
              ) : data.quotations.length === 0 ? (
                <tr><td className="p-4 text-slate-500 dark:text-slate-400" colSpan={5}>Belum ada penawaran.</td></tr>
              ) : data.quotations.map((quote: any) => (
                <tr key={quote.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200">
                  <td className="p-3 font-medium">{quote.nomor_penawaran}</td>
                  <td className="p-3">{quote.pelanggan_nama_snapshot || "Umum"}</td>
                  <td className="p-3">{quote.status}{quote.converted_penjualan_id ? <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">→ faktur</span> : null}</td>
                  <td className="p-3 text-right">{money(quote.total_jumlah)}</td>
                  <td className="space-x-2 p-3">
                    <button className="rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={() => printQuote(quote)}>Cetak</button>
                    <button disabled={saving || quote.status === "CONVERTED" || quote.status === "ACCEPTED"} className="rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors" onClick={() => changeStatus(quote.id, "ACCEPTED")}>Terima</button>
                    <button disabled={saving || quote.status === "CONVERTED" || quote.status === "CANCELLED" || quote.status === "EXPIRED"} className="rounded bg-emerald-600 px-2 py-1 text-white disabled:opacity-50 hover:bg-emerald-700 transition-colors" onClick={() => openConvert(quote)}>Konversi</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {convertTarget ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Konversi {convertTarget.nomor_penawaran}</h2>
              <button className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100" onClick={() => setConvertTarget(null)}>x</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded bg-slate-50 dark:bg-slate-800 p-3">
                <span className="text-slate-600 dark:text-slate-300">Total faktur</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{money(convertTarget.total_jumlah)}</span>
              </div>
              <label className="block">
                <span className="text-xs text-slate-600 dark:text-slate-400">Tanggal faktur</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
                  value={convertForm.tanggal}
                  onChange={(e) => setConvertForm((prev) => ({ ...prev, tanggal: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600 dark:text-slate-400">Metode bayar</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
                  value={convertForm.metode_pembayaran}
                  onChange={(e) => setConvertForm((prev) => ({ ...prev, metode_pembayaran: e.target.value as any }))}
                >
                  <option value="CASH">CASH (lunas)</option>
                  <option value="TRANSFER">TRANSFER (lunas)</option>
                  <option value="NET30">NET30 (jadi piutang)</option>
                </select>
              </label>
              {convertForm.metode_pembayaran === "NET30" ? (
                <label className="block">
                  <span className="text-xs text-slate-600 dark:text-slate-400">DP (opsional)</span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
                    value={convertForm.jumlah_dibayar || ""}
                    onChange={(e) => setConvertForm((prev) => ({ ...prev, jumlah_dibayar: Number(e.target.value || 0) }))}
                  />
                </label>
              ) : null}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                CASH/TRANSFER: penjualan langsung lunas, masuk kas. NET30: tagihan jatuh ke piutang.
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={() => setConvertTarget(null)}>Batal</button>
              <button disabled={saving} className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-60 hover:bg-emerald-700 transition-colors" onClick={confirmConvert}>Konversi</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
