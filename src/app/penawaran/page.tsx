"use client";

import { useMemo, useState } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { sembunyikanPlaceholderBarang } from "@/lib/barang-placeholder";
import { QuotationIcon } from "@/components/icons/PageIcons";
import MenuAksi from "@/components/MenuAksi";
import { TrashIcon } from "@/components/icons/ContentIcons";
import {
  formatTampilanQtyItem,
  mapPenawaranItemKeFaktur,
  catatanUntukPihakLuar,
} from "@/lib/dokumen-item-display";
import {
  generateFakturHTML,
  patchQuotationHTML,
} from "@/lib/faktur-print";
import { preparePrintHtml } from "@/lib/print-embed-client";
import { openPrintDocument } from "@/lib/print-fonts";
import {
  convertQuotationToSaleAction,
  createQuotationAction,
  deleteQuotationDraftAction,
  getPenawaranInitAction,
  updateQuotationAction,
  updateQuotationStatusAction,
} from "./actions";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";

type DraftItem = {
  barang_id: string;
  harga_satuan_id?: string;
  jumlah: number;
  nama_satuan: string;
  faktor_konversi: number;
  harga_satuan: number;
  panjang?: number | null;
  lebar?: number | null;
  jumlah_lembar?: number | null;
  butuh_dimensi?: boolean;
};

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const initial = { quotations: [], customers: [], materials: [], shop: null };

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
  const [confirmState, setConfirmState] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: "warning" | "danger" | "info";
    onConfirm: () => void;
  }>({ show: false, title: "", message: "", type: "danger", onConfirm: () => {} });
  const closeConfirm = () => setConfirmState((s) => ({ ...s, show: false }));
  const [customerId, setCustomerId] = useState("");
  const [catatan, setCatatan] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "SENT">("DRAFT");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
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
    const isDim = Number(material.butuh_dimensi_status) === 1;
    setItems((prev) => [
      ...prev,
      {
        barang_id: material.id,
        harga_satuan_id: unit.id,
        jumlah: isDim ? 0 : 1,
        nama_satuan: isDim ? "m²" : (unit.nama_satuan || "pcs"),
        faktor_konversi: Number(unit.faktor_konversi || 1),
        harga_satuan: Number(unit.harga_jual || unit.harga_member || 0),
        butuh_dimensi: isDim,
        panjang: isDim ? 0 : null,
        lebar: isDim ? 0 : null,
        jumlah_lembar: isDim ? 1 : null,
      },
    ]);
  }

  function resetForm() {
    setCustomerId("");
    setItems([]);
    setCatatan("");
    setStatus("DRAFT");
    setEditingQuoteId(null);
  }

  function loadQuoteForEdit(quote: any) {
    if (quote.status === "CONVERTED" || quote.status === "CANCELLED") return;
    setEditingQuoteId(quote.id);
    setCustomerId(quote.pelanggan_id || "");
    setCatatan(quote.catatan || "");
    setStatus(quote.status === "SENT" ? "SENT" : "DRAFT");
    setItems(
      (quote.items || []).map((item: any) => {
        const material = data.materials.find((m: any) => m.id === item.barang_id);
        const isDim = Number(material?.butuh_dimensi_status) === 1;
        return {
          barang_id: item.barang_id,
          harga_satuan_id: item.harga_satuan_id || undefined,
          jumlah: Number(item.jumlah || 0),
          nama_satuan: item.nama_satuan || (isDim ? "m²" : "pcs"),
          faktor_konversi: Number(item.faktor_konversi || 1),
          harga_satuan: Number(item.harga_satuan || 0),
          butuh_dimensi: isDim,
          panjang: item.panjang ?? (isDim ? 0 : null),
          lebar: item.lebar ?? (isDim ? 0 : null),
          jumlah_lembar: item.jumlah_lembar ?? (isDim ? 1 : null),
        };
      })
    );
    setNotice(`Mengedit ${quote.nomor_penawaran}.`);
  }

  async function submit() {
    if (items.length === 0) return setNotice("Tambahkan item dulu.");
    setSaving(true);
    try {
      const customer = data.customers.find((c: any) => c.id === customerId);
      const payload = {
        pelanggan_id: customerId || null,
        pelanggan_nama_snapshot: customer?.nama || null,
        pelanggan_kota: customer?.alamat || null,
        status,
        catatan,
        items: items.map((item) => ({
          ...item,
          panjang: item.panjang || null,
          lebar: item.lebar || null,
          jumlah_lembar: item.jumlah_lembar || null,
          subtotal: Number(item.jumlah || 0) * Number(item.harga_satuan || 0),
        })),
      };
      if (editingQuoteId) {
        await updateQuotationAction(editingQuoteId, payload);
        setNotice("Penawaran diperbarui.");
      } else {
        await createQuotationAction(payload);
        setNotice("Penawaran tersimpan.");
      }
      resetForm();
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

  function confirmDeleteQuote(quote: any) {
    setConfirmState({
      show: true,
      title: "Hapus Draf Penawaran",
      message: `Hapus draf ${quote.nomor_penawaran}?\nTindakan ini tidak bisa dibatalkan.`,
      type: "danger",
      onConfirm: async () => {
        setSaving(true);
        try {
          await deleteQuotationDraftAction(quote.id);
          if (editingQuoteId === quote.id) resetForm();
          setNotice(`Draf ${quote.nomor_penawaran} dihapus.`);
          await reload();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Gagal menghapus draf");
        } finally {
          setSaving(false);
        }
      },
    });
  }

  async function printQuote(quote: any) {
    try {
      const html = patchQuotationHTML(
        generateFakturHTML({
          nomor_faktur: quote.nomor_penawaran,
          tanggal: quote.tanggal || new Date().toISOString(),
          pelanggan_nama: quote.pelanggan_nama_snapshot || "Pelanggan Umum",
          pelanggan_detail: quote.pelanggan_kota
            ? [String(quote.pelanggan_kota)]
            : undefined,
          items: (quote.items || []).map((item: any) =>
            mapPenawaranItemKeFaktur({
              ...item,
              barang_nama: item.barang_nama || item.barang_id,
            })
          ),
          total: Number(quote.total_jumlah || 0),
          bayar: 0,
          sisa: 0,
          catatan: catatanUntukPihakLuar(quote.catatan) || undefined,
          shop: {
            ...data.shop,
            catatan_faktur:
              "Penawaran ini berlaku 7 hari sejak tanggal tertera. Harga dapat berubah sewaktu-waktu.",
          },
        })
      );
      const ready = await preparePrintHtml(html);
      openPrintDocument(ready, "Cetak Penawaran");
    } catch (error) {
      console.error("printQuote error:", error);
      setNotice("Gagal menyiapkan dokumen cetak.");
    }
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
              <p className="text-white/90 text-base">Draf, kirim, cetak, dan konversi ke faktur.</p>
            </div>
          </div>
          {notice ? <div className="rounded-md bg-white/20 px-3 py-2.5 text-base text-white">{notice}</div> : null}
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">
            {editingQuoteId ? "Edit Penawaran" : "Buat Penawaran"}
          </h2>
          <div className="space-y-3">
            <select className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Pelanggan Umum</option>
              {data.customers.map((c: any) => (
                <option key={c.id} value={c.id}>{c.nama}</option>
              ))}
            </select>
            <select className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2" onChange={(e) => { addItem(e.target.value); e.currentTarget.value = ""; }}>
              <option value="">Tambah barang</option>
              {sembunyikanPlaceholderBarang(data.materials).map((m: any) => (
                <option key={m.id} value={m.id}>{m.nama}</option>
              ))}
            </select>
            <div className="space-y-2">
              {items.map((item, index) => {
                const material = data.materials.find((m: any) => m.id === item.barang_id);
                const isDim = item.butuh_dimensi;

                const updateDim = (
                  field: "lebar" | "panjang" | "jumlah_lembar",
                  val: number
                ) => {
                  setItems((prev) =>
                    prev.map((row, i) => {
                      if (i !== index) return row;
                      const updated = { ...row, [field]: val };
                      const l = Number(updated.lebar) || 0;
                      const p = Number(updated.panjang) || 0;
                      const lembar = Number(updated.jumlah_lembar) || 1;
                      return {
                        ...updated,
                        jumlah: isDim ? l * p * lembar : row.jumlah,
                      };
                    })
                  );
                };

                return (
                  <div
                    key={`${item.barang_id}-${index}`}
                    className="rounded-md bg-slate-50 dark:bg-slate-800 p-2 text-base space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800 dark:text-slate-100 truncate">
                        {material?.nama || item.barang_id}
                      </span>
                      <button
                        className="rounded bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 px-2 py-0.5 ml-2"
                        onClick={() =>
                          setItems((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        ×
                      </button>
                    </div>
                    {isDim ? (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">
                            Lebar (m)
                          </label>
                          <input
                            className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-base"
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.lebar ?? ""}
                            onChange={(e) =>
                              updateDim("lebar", Number(e.target.value))
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">
                            Panjang (m)
                          </label>
                          <input
                            className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-base"
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.panjang ?? ""}
                            onChange={(e) =>
                              updateDim("panjang", Number(e.target.value))
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">
                            Lembar
                          </label>
                          <input
                            className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-base"
                            type="number"
                            min="1"
                            step="1"
                            value={item.jumlah_lembar ?? 1}
                            onChange={(e) =>
                              updateDim("jumlah_lembar", Number(e.target.value))
                            }
                          />
                        </div>
                        <div className="col-span-3 text-sm text-slate-400 dark:text-slate-500">
                          = {Number(item.jumlah).toFixed(2)} m² @ Rp{" "}
                          {money(item.harga_satuan)}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-[70px_100px] gap-2">
                        <input
                          className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-base"
                          type="number"
                          min="0"
                          placeholder="Qty"
                          value={item.jumlah}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === index
                                  ? { ...row, jumlah: Number(e.target.value) }
                                  : row
                              )
                            )
                          }
                        />
                        <input
                          className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-base"
                          type="number"
                          min="0"
                          placeholder="Harga"
                          value={item.harga_satuan}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === index
                                  ? {
                                      ...row,
                                      harga_satuan: Number(e.target.value),
                                    }
                                  : row
                              )
                            )
                          }
                        />
                      </div>
                    )}
                    {isDim ? (
                      <input
                        className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 p-1 text-base"
                        type="number"
                        min="0"
                        placeholder="Harga per m²"
                        value={item.harga_satuan}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((row, i) =>
                              i === index
                                ? { ...row, harga_satuan: Number(e.target.value) }
                                : row
                            )
                          )
                        }
                      />
                    ) : null}
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
            <div className="flex gap-2">
              {editingQuoteId ? (
                <button
                  type="button"
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-base text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  onClick={resetForm}
                >
                  Batal Edit
                </button>
              ) : null}
              <button disabled={saving} className="w-full rounded-md bg-cyan-600 px-4 py-2.5 font-medium text-white disabled:opacity-60 hover:bg-cyan-700 transition-colors" onClick={submit}>
                {editingQuoteId ? "Simpan Perubahan" : "Simpan Penawaran"}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-base">
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
                  <td className="p-3">{quote.status}{quote.converted_penjualan_id ? <span className="ml-2 text-sm text-emerald-600 dark:text-emerald-400">→ faktur</span> : null}</td>
                  <td className="p-3 text-right">{money(quote.total_jumlah)}</td>
                  <td className="p-3">
                    <MenuAksi
                      ambangInline={0}
                      labelMenu={`Aksi untuk ${quote.nomor_penawaran}`}
                      aksi={[
                        {
                          label: "Edit",
                          judul: "Edit penawaran",
                          tampil: quote.status === "DRAFT" || quote.status === "SENT",
                          disabled: saving,
                          onClick: () => loadQuoteForEdit(quote),
                          ikon: (
                            <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          ),
                        },
                        {
                          label: "Cetak",
                          judul: "Cetak penawaran",
                          onClick: () => printQuote(quote),
                          ikon: (
                            <svg className="w-5 h-5 text-blue-600 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                          ),
                        },
                        {
                          label: "Terima",
                          judul: "Tandai penawaran diterima",
                          disabled: saving || quote.status === "CONVERTED" || quote.status === "ACCEPTED",
                          onClick: () => changeStatus(quote.id, "ACCEPTED"),
                          ikon: (
                            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ),
                        },
                        {
                          label: "Konversi ke Faktur",
                          judul: "Konversi penawaran menjadi faktur penjualan",
                          disabled: saving || quote.status === "CONVERTED" || quote.status === "CANCELLED" || quote.status === "EXPIRED",
                          onClick: () => openConvert(quote),
                          ikon: (
                            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          ),
                        },
                        {
                          label: "Hapus Draf",
                          judul: "Hapus draf penawaran",
                          varian: "bahaya",
                          tampil: quote.status === "DRAFT",
                          disabled: saving,
                          onClick: () => confirmDeleteQuote(quote),
                          ikon: <TrashIcon size={20} className="text-red-500" />,
                        },
                      ]}
                    />
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
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Konversi {convertTarget.nomor_penawaran}</h2>
              <button className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100" onClick={() => setConvertTarget(null)}>x</button>
            </div>
            <div className="space-y-3 text-base">
              <div className="flex items-center justify-between rounded bg-slate-50 dark:bg-slate-800 p-3">
                <span className="text-slate-600 dark:text-slate-300">Total faktur</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{money(convertTarget.total_jumlah)}</span>
              </div>
              <label className="block">
                <span className="text-sm text-slate-600 dark:text-slate-400">Tanggal faktur</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
                  value={convertForm.tanggal}
                  onChange={(e) => setConvertForm((prev) => ({ ...prev, tanggal: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-600 dark:text-slate-400">Metode bayar</span>
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
                  <span className="text-sm text-slate-600 dark:text-slate-400">DP (opsional)</span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-2"
                    value={convertForm.jumlah_dibayar || ""}
                    onChange={(e) => setConvertForm((prev) => ({ ...prev, jumlah_dibayar: Number(e.target.value || 0) }))}
                  />
                </label>
              ) : null}
              <p className="text-sm text-slate-500 dark:text-slate-400">
                CASH/TRANSFER: penjualan langsung lunas, masuk kas. NET30: tagihan jatuh ke piutang.
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border border-slate-300 dark:border-slate-600 px-3 py-2.5 text-base text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={() => setConvertTarget(null)}>Batal</button>
              <button disabled={saving} className="rounded bg-emerald-600 px-3 py-2.5 text-base text-white disabled:opacity-60 hover:bg-emerald-700 transition-colors" onClick={confirmConvert}>Konversi</button>
            </div>
          </div>
        </div>
      ) : null}
      <DialogKonfirmasi
        show={confirmState.show}
        title={confirmState.title}
        message={confirmState.message}
        confirmText="Ya, Hapus"
        cancelText="Batal"
        onConfirm={() => { confirmState.onConfirm(); closeConfirm(); }}
        onCancel={closeConfirm}
        type={confirmState.type}
      />
    </div>
  );
}
