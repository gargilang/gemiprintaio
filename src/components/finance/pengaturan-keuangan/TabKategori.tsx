"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJSON, type ConfirmRequest, type KategoriApi } from "./shared";

// Tab Kategori transaksi di PengaturanKeuanganModal. Diekstrak (Fase 6 B2).
// Memiliki state-nya sendiri; induk hanya mengoper notifikasi + dialog konfirmasi.

/** Ubah nama jadi kode kategori UPPERCASE tanpa karakter sintaks DSL. */
function slugifyCode(name: string, maxLen = 24): string {
  const base = name
    .trim()
    .replace(/[\[\]"']/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, maxLen);
  return base || `KAT${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export interface TabKategoriProps {
  /** Modal terbuka — pemicu lazy-load daftar kategori. */
  open: boolean;
  showMsg: (type: "success" | "error", message: string) => void;
  requestConfirm: (req: ConfirmRequest) => void;
  /** Dipanggil setelah kategori berubah agar induk me-refresh daftarnya. */
  onCategoriesChanged?: () => void;
  /** Lapor jumlah kategori ke induk (untuk hitungan di footer). */
  onCountChange?: (n: number) => void;
}

export default function TabKategori({
  open,
  showMsg,
  requestConfirm,
  onCategoriesChanged,
  onCountChange,
}: TabKategoriProps) {
  const [categories, setCategories] = useState<KategoriApi[]>([]);
  const [katLoaded, setKatLoaded] = useState(false);
  const [katLoading, setKatLoading] = useState(false);
  const [katSaving, setKatSaving] = useState(false);
  const [katSearch, setKatSearch] = useState("");
  const [newCatName, setNewCatName] = useState("");

  const reloadKat = useCallback(async () => {
    setKatLoading(true);
    try {
      const r = await apiJSON<{ categories: KategoriApi[] }>("/api/keuangan/config");
      setCategories(r.categories ?? []);
      setKatLoaded(true);
    } catch (e) { showMsg("error", (e as Error).message); }
    finally { setKatLoading(false); }
  }, [showMsg]);

  useEffect(() => {
    if (open && !katLoaded) void reloadKat();
  }, [open, katLoaded, reloadKat]);

  useEffect(() => {
    onCountChange?.(categories.length);
  }, [categories.length, onCountChange]);

  const filteredCats = useMemo(() => {
    const q = katSearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.display_name.toLowerCase().includes(q) || c.category_code.toLowerCase().includes(q));
  }, [categories, katSearch]);

  async function katMutate(payload: Record<string, unknown>) {
    setKatSaving(true);
    try {
      await apiJSON("/api/keuangan/config/manage", { method: "POST", body: JSON.stringify(payload) });
      await reloadKat();
      onCategoriesChanged?.();
      showMsg("success", "Kategori diperbarui.");
    } catch (e) { showMsg("error", (e as Error).message); }
    finally { setKatSaving(false); }
  }

  async function addCategory() {
    const name = newCatName.trim();
    if (!name) { showMsg("error", "Mohon isi nama kategori."); return; }
    const code = slugifyCode(name);
    if (categories.some((c) => c.category_code.toUpperCase() === code)) { showMsg("error", "Kode kategori sudah ada. Coba nama yang sedikit berbeda."); return; }
    await katMutate({ action: "create_category", category_code: code, display_name: name });
    setNewCatName("");
  }

  return (
      <div className="p-4 space-y-4">
        {/* Add form */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700 mb-2">Tambah kategori baru</p>
          <p className="text-xs text-slate-500 mb-3">
            Kategori muncul saat mencatat transaksi. Cara kategori mempengaruhi omzet, laba, dan
            kasbon diatur di tab <strong>Rumus</strong>, bukan di sini.
          </p>
          <div className="flex gap-2 max-w-lg">
            <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addCategory(); }} placeholder='Contoh: Asuransi (tanpa menggunakan ")' className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" />
            <button type="button" disabled={katSaving || !newCatName.trim()} onClick={addCategory} className="px-4 py-2 bg-slate-700 text-white text-sm rounded-lg disabled:opacity-50">Tambah</button>
          </div>
        </div>

        {/* Search */}
        <input type="search" value={katSearch} onChange={(e) => setKatSearch(e.target.value)} placeholder="Cari kategori…" className="px-3 py-1.5 text-sm border border-slate-300 rounded-md w-56 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" />

        {/* List */}
        {katLoading && <div className="py-8 text-center text-slate-500 text-sm">Memuat…</div>}
        {!katLoading && (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {filteredCats.length === 0 && (
              <p className="py-8 text-center text-slate-500 text-sm">{categories.length === 0 ? "Belum ada kategori." : "Tidak ada yang cocok."}</p>
            )}
            {filteredCats.map((cat) => {
              return (
              <div
                key={cat.id || cat.category_code}
                className="flex items-center justify-between gap-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {cat.display_name}
                  </span>
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-mono truncate mt-0.5">
                    &quot;{cat.category_code}&quot;
                  </span>
                </div>
                {cat.id && (
                  <button
                    type="button"
                    disabled={katSaving}
                    onClick={() =>
                      requestConfirm({
                        title: `Hapus kategori "${cat.display_name}"?`,
                        message: "Transaksi yang sudah ada tetap tersimpan dengan kode lama.",
                        confirmText: "Hapus",
                        type: "danger",
                        onConfirm: () => void katMutate({ action: "delete_category", id: cat.id }),
                      })
                    }
                    className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40 shrink-0"
                    title="Hapus kategori"
                    aria-label="Hapus kategori"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
  );
}
