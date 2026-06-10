"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCachedData } from "@/lib/use-cached-data";
import { sembunyikanPlaceholderBarang } from "@/lib/barang-placeholder";
import { PurchaseOrderFlowIcon } from "@/components/icons/PageIcons";
import {
  createPurchaseOrderAction,
  getPurchaseOrdersInitAction,
  receivePurchaseOrderAction,
  updatePurchaseOrderStatusAction,
} from "./actions";

type DraftItem = {
  barang_id: string;
  harga_satuan_id?: string;
  jumlah: number;
  nama_satuan: string;
  faktor_konversi: number;
  harga_satuan: number;
};

type ReceiveModalState = {
  po: any;
  metode_pembayaran: "CASH" | "TRANSFER" | "NET30";
  jumlah_dibayar: number;
  tanggal: string;
  qtyByItem: Record<string, number>;
};

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const initial = { purchaseOrders: [], materials: [], vendors: [] };

export default function PurchaseOrdersPage() {
  const { data: rawData, isLoading, mutate } = useCachedData<any>(
    "purchase-orders-init",
    getPurchaseOrdersInitAction
  );
  const data = rawData ?? initial;
  const loading = isLoading && !rawData;
  const reload = async () => {
    await mutate();
  };
  const [vendorId, setVendorId] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [catatan, setCatatan] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [receiveModal, setReceiveModal] = useState<ReceiveModalState | null>(null);
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.jumlah * item.harga_satuan, 0),
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
        harga_satuan: Number(unit.harga_beli || 0),
      },
    ]);
  }

  async function submit() {
    if (!vendorId) return setNotice("Vendor wajib dipilih.");
    if (items.length === 0) return setNotice("Tambahkan item dulu.");
    setSaving(true);
    try {
      await createPurchaseOrderAction({
        vendor_id: vendorId,
        status: "DRAFT",
        catatan,
        items: items.map((item) => ({ ...item, subtotal: item.jumlah * item.harga_satuan })),
      });
      setItems([]);
      setCatatan("");
      setNotice("Pesanan pembelian tersimpan.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan pesanan pembelian");
    } finally {
      setSaving(false);
    }
  }

  function openReceive(po: any) {
    setReceiveModal({
      po,
      metode_pembayaran: "NET30",
      jumlah_dibayar: 0,
      tanggal: new Date().toISOString().slice(0, 10),
      qtyByItem: {},
    });
  }

  async function confirmReceive() {
    if (!receiveModal) return;
    const lines = (receiveModal.po.items || [])
      .map((item: any) => ({
        purchase_order_item_id: item.id,
        qty: Number(receiveModal.qtyByItem[item.id] || 0),
      }))
      .filter((line: any) => line.qty > 0);
    if (lines.length === 0) {
      setNotice("Isi qty terima minimal satu item.");
      return;
    }
    if (!window.confirm(
      `Posting penerimaan pesanan pembelian ${receiveModal.po.nomor_po}?\nIni akan membuat pembelian dan menambah stok.`
    )) {
      return;
    }
    setSaving(true);
    try {
      await receivePurchaseOrderAction({
        purchase_order_id: receiveModal.po.id,
        metode_pembayaran: receiveModal.metode_pembayaran,
        jumlah_dibayar:
          receiveModal.metode_pembayaran === "NET30"
            ? receiveModal.jumlah_dibayar
            : undefined,
        tanggal: receiveModal.tanggal,
        items: lines,
      });
      setReceiveModal(null);
      setNotice("Penerimaan pesanan pembelian masuk ke pembelian.");
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal menerima PO");
    } finally {
      setSaving(false);
    }
  }

  function printPo(po: any) {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const itemsHtml = (po.items || [])
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
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${po.nomor_po}</title>
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
<h1>PESANAN PEMBELIAN</h1>
<div style="font-size:13px;color:#475569;">No: ${po.nomor_po}</div>
<div class="meta">
  <div>
    <div><strong>Kepada vendor:</strong> ${po.vendor_name || "(belum diisi)"}</div>
  </div>
  <div style="text-align:right;">
    <div>Tanggal: ${po.tanggal || ""}</div>
    <div>Perkiraan: ${po.expected_date || "-"}</div>
    <div>Status: ${po.status}</div>
  </div>
</div>
<table>
  <thead><tr><th>#</th><th>Barang</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Harga</th><th style="text-align:right;">Subtotal</th></tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<div class="total">Total: ${money(po.total_jumlah)}</div>
${po.catatan ? `<div class="notes"><strong>Catatan:</strong>\n${po.catatan}</div>` : ""}
<div class="footer">Dokumen ini dihasilkan otomatis. Konfirmasi sebelum penerimaan barang.</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
    win.document.write(html);
    win.document.close();
  }

  return (
    <div className="space-y-6">
      {/* Kartu judul */}
      <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PurchaseOrderFlowIcon size={28} className="text-white" />
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-wide">Pesanan Pembelian</h2>
              <p className="text-white/90 text-sm">Draf, kirim, cetak, dan penerimaan parsial.</p>
            </div>
          </div>
          {notice ? <div className="rounded-md bg-white/20 px-3 py-2 text-sm text-white">{notice}</div> : null}
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">Buat Pesanan Pembelian</h2>
          <div className="space-y-3">
            <select className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2" value={vendorId} onChange={(e) => setVendorId(e.target.value)} disabled={saving}>
              <option value="">Pilih vendor</option>
              {data.vendors.map((v: any) => (
                <option key={v.id} value={v.id}>{v.nama_perusahaan}</option>
              ))}
            </select>
            <select className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2" onChange={(e) => { addItem(e.target.value); e.currentTarget.value = ""; }} disabled={saving}>
              <option value="">Tambah barang</option>
              {sembunyikanPlaceholderBarang(data.materials).map((m: any) => (
                <option key={m.id} value={m.id}>{m.nama}</option>
              ))}
            </select>
            {items.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-600 p-3 text-center text-xs text-slate-500 dark:text-slate-400">Belum ada item</div>
            ) : null}
            {items.map((item, index) => {
              const material = data.materials.find((m: any) => m.id === item.barang_id);
              return (
                <div key={`${item.barang_id}-${index}`} className="grid grid-cols-[1fr_70px_100px_32px] gap-2 rounded-md bg-slate-50 dark:bg-slate-800 p-2 text-sm">
                  <span className="self-center truncate text-slate-800 dark:text-slate-100">{material?.nama || item.barang_id}</span>
                  <input className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1" type="number" min="0" value={item.jumlah} onChange={(e) => setItems((prev) => prev.map((row, i) => i === index ? { ...row, jumlah: Number(e.target.value) } : row))} />
                  <input className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1" type="number" min="0" value={item.harga_satuan} onChange={(e) => setItems((prev) => prev.map((row, i) => i === index ? { ...row, harga_satuan: Number(e.target.value) } : row))} />
                  <button className="rounded bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))} aria-label="Hapus item">x</button>
                </div>
              );
            })}
            <textarea className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2" placeholder="Catatan" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
            <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-100"><span>Total</span><span>{money(total)}</span></div>
            <button disabled={saving} className="w-full rounded-md bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-60 hover:bg-indigo-700 transition-colors" onClick={submit}>Simpan Pesanan Pembelian</button>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400 shadow-sm">Memuat...</div>
          ) : data.purchaseOrders.length === 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400 shadow-sm">Belum ada pesanan pembelian.</div>
          ) : data.purchaseOrders.map((po: any) => {
            const allReceived = (po.items || []).every((it: any) => Number(it.qty_received || 0) >= Number(it.jumlah || 0) - 0.000001);
            return (
              <div key={po.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-100">{po.nomor_po}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">{po.vendor_name || "Vendor"} - {po.status}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={() => printPo(po)}>Cetak</button>
                    <button disabled={saving || po.status === "CANCELLED" || po.status === "RECEIVED"} className="rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors" onClick={() => updatePurchaseOrderStatusAction(po.id, "SENT").then(() => reload())}>Tandai Terkirim</button>
                    <button disabled={saving || po.status === "CANCELLED" || allReceived} className="rounded bg-emerald-600 px-2 py-1 text-sm text-white disabled:opacity-50 hover:bg-emerald-700 transition-colors" onClick={() => openReceive(po)}>Terima</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-300">
                      <tr><th className="p-2">Barang</th><th className="p-2 text-right">Dipesan</th><th className="p-2 text-right">Diterima</th><th className="p-2 text-right">Sisa</th></tr>
                    </thead>
                    <tbody>
                      {(po.items || []).map((item: any) => (
                        <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                          <td className="p-2">
                            {item.barang_id ? (
                              <Link className="text-cyan-600 dark:text-cyan-400 underline-offset-2 hover:underline" href={`/barang?id=${item.barang_id}`}>{item.barang_nama || item.barang_id}</Link>
                            ) : (item.barang_nama || "-")}
                          </td>
                          <td className="p-2 text-right">{item.jumlah} {item.nama_satuan}</td>
                          <td className="p-2 text-right">{item.qty_received || 0}</td>
                          <td className="p-2 text-right">{Math.max(0, Number(item.jumlah || 0) - Number(item.qty_received || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {receiveModal ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Penerimaan Pesanan {receiveModal.po.nomor_po}</h2>
              <button className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100" onClick={() => setReceiveModal(null)}>x</button>
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <label className="block">
                <span className="text-xs text-slate-600 dark:text-slate-400">Tanggal</span>
                <input type="date" className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
                  value={receiveModal.tanggal}
                  onChange={(e) => setReceiveModal((prev) => prev ? { ...prev, tanggal: e.target.value } : prev)} />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600 dark:text-slate-400">Metode bayar vendor</span>
                <select className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
                  value={receiveModal.metode_pembayaran}
                  onChange={(e) => setReceiveModal((prev) => prev ? { ...prev, metode_pembayaran: e.target.value as any } : prev)}>
                  <option value="CASH">CASH (lunas)</option>
                  <option value="TRANSFER">TRANSFER (lunas)</option>
                  <option value="NET30">NET30 (jadi hutang)</option>
                </select>
              </label>
              {receiveModal.metode_pembayaran === "NET30" ? (
                <label className="block md:col-span-2">
                  <span className="text-xs text-slate-600 dark:text-slate-400">DP yang dibayar (opsional)</span>
                  <input type="number" min={0} className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
                    value={receiveModal.jumlah_dibayar || ""}
                    onChange={(e) => setReceiveModal((prev) => prev ? { ...prev, jumlah_dibayar: Number(e.target.value || 0) } : prev)} />
                </label>
              ) : null}
            </div>
            <div className="mt-4 max-h-72 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-300">
                  <tr><th className="p-2">Barang</th><th className="p-2 text-right">Dipesan</th><th className="p-2 text-right">Sudah</th><th className="p-2 text-right">Terima</th></tr>
                </thead>
                <tbody>
                  {(receiveModal.po.items || []).map((item: any) => {
                    const remaining = Math.max(0, Number(item.jumlah || 0) - Number(item.qty_received || 0));
                    return (
                      <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                        <td className="p-2">{item.barang_nama || item.barang_id}</td>
                        <td className="p-2 text-right">{item.jumlah} {item.nama_satuan}</td>
                        <td className="p-2 text-right">{item.qty_received || 0}</td>
                        <td className="p-2 text-right">
                          <input
                            className="w-24 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-right"
                            type="number"
                            min={0}
                            max={remaining}
                            value={receiveModal.qtyByItem[item.id] || ""}
                            onChange={(e) => setReceiveModal((prev) => prev ? {
                              ...prev,
                              qtyByItem: { ...prev.qtyByItem, [item.id]: Number(e.target.value) },
                            } : prev)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={() => setReceiveModal(null)}>Batal</button>
              <button disabled={saving} className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-60 hover:bg-emerald-700 transition-colors" onClick={confirmReceive}>Posting Penerimaan</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
