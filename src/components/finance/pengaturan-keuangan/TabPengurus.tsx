"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import MenuAksi from "@/components/MenuAksi";
import { apiJSON, type ConfirmRequest } from "./shared";

// Tab Pengurus (business actors) di PengaturanKeuanganModal. Diekstrak (Fase 6 B2).
// Memiliki seluruh state Orang + modal form + tombol tambah kategori cepat.
// Induk hanya mengoper notifikasi, dialog konfirmasi, dan callback lintas-tab.

type RoleGroup = "owner" | "management" | "sales" | "staff" | "other";

const ROLE_GROUP_LABEL: Record<RoleGroup, string> = {
  owner: "Pemilik / Komisaris",
  management: "Manajemen",
  sales: "Sales",
  staff: "Staf / Karyawan",
  other: "Lainnya",
};
const GROUP_ORDER: RoleGroup[] = ["owner", "management", "sales", "staff", "other"];

interface ActorRoleApi {
  id: string; role_code: string; role_label: string;
  role_group: RoleGroup; display_order: number;
}
interface BusinessActorApi {
  id: string; display_name: string; role_code: string;
  is_active: number; notes: string | null;
  profit_share_percent: number | null;
  cash_advance_categories: string[] | null;
  keperluan_keyword: string | null;
  bonus_percent: number | null;
  bonus_source_formula_key: string | null;
}
interface OrangForm {
  display_name: string; role_code: string; notes: string;
  enable_profit_share: boolean; profit_share_percent: string;
}
const EMPTY_ORANG: OrangForm = {
  display_name: "", role_code: "", notes: "",
  enable_profit_share: false, profit_share_percent: "",
};
function actorToForm(a: BusinessActorApi): OrangForm {
  return {
    display_name: a.display_name, role_code: a.role_code, notes: a.notes ?? "",
    enable_profit_share: a.profit_share_percent !== null,
    profit_share_percent: a.profit_share_percent != null ? String(a.profit_share_percent) : "",
  };
}
function describeActor(a: BusinessActorApi): string[] {
  const p: string[] = [];
  if (a.profit_share_percent !== null) p.push(`Bagi hasil ${a.profit_share_percent}%`);
  return p;
}

export interface TabPengurusProps {
  /** Modal terbuka — pemicu lazy-load daftar pengurus. */
  open: boolean;
  showMsg: (type: "success" | "error", message: string) => void;
  requestConfirm: (req: ConfirmRequest) => void;
  /** Pengurus dibuat/diubah/dihapus — induk refresh ringkasan per orang. */
  onActorsChanged?: () => void;
  /** Perubahan memicu rekalkulasi buku kas. */
  onRecalcTriggered?: () => void;
  /** Rumus per-pengurus baru disinkron — induk reload daftar rumus (tab Kolom). */
  onFormulasChanged?: () => void;
  /** Lapor jumlah pengurus aktif ke induk (untuk hitungan footer). */
  onActiveCountChange?: (n: number) => void;
  /** Lapor status modal form terbuka agar induk menonaktifkan dismiss modal utama. */
  onFormOpenChange?: (open: boolean) => void;
}

export default function TabPengurus({
  open,
  showMsg,
  requestConfirm,
  onActorsChanged,
  onRecalcTriggered,
  onFormulasChanged,
  onActiveCountChange,
  onFormOpenChange,
}: TabPengurusProps) {
  // ── Orang state ────────────────────────────────────────────────────────────
  const [actors, setActors] = useState<BusinessActorApi[]>([]);
  const [roles, setRoles] = useState<ActorRoleApi[]>([]);
  const [orangLoaded, setOrangLoaded] = useState(false);
  const [orangLoading, setOrangLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [orangSearch, setOrangSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingActorId, setEditingActorId] = useState<string | null>(null);
  const [orangForm, setOrangForm] = useState<OrangForm>(EMPTY_ORANG);
  const [orangSaving, setOrangSaving] = useState(false);

  const reloadOrang = useCallback(async (inactive?: boolean) => {
    setOrangLoading(true);
    try {
      const si = inactive ?? showInactive;
      const r = await apiJSON<{ actors: BusinessActorApi[]; roles: ActorRoleApi[] }>(
        `/api/business-actors${si ? "?include_inactive=1" : ""}`
      );
      setActors(r.actors);
      setRoles(r.roles);
      setOrangLoaded(true);
    } catch (e) { showMsg("error", (e as Error).message); }
    finally { setOrangLoading(false); }
  }, [showInactive, showMsg]);

  useEffect(() => {
    if (open && !orangLoaded) {
      void reloadOrang();
    }
  }, [open, orangLoaded, reloadOrang]);

  useEffect(() => {
    if (orangLoaded) void reloadOrang(showInactive);
  }, [showInactive]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleByCode = useMemo(() => {
    const m = new Map<string, ActorRoleApi>();
    roles.forEach((r) => m.set(r.role_code, r));
    return m;
  }, [roles]);

  const filteredActors = useMemo(() => {
    let list = actors.filter((a) => a.profit_share_percent !== null);
    const q = orangSearch.trim().toLowerCase();
    if (q) list = list.filter((a) =>
      a.display_name.toLowerCase().includes(q) || a.role_code.toLowerCase().includes(q)
    );
    return list;
  }, [actors, orangSearch]);

  const groupedActors = useMemo(() => {
    const out: Record<string, BusinessActorApi[]> = {};
    filteredActors.forEach((a) => {
      const g = roleByCode.get(a.role_code)?.role_group ?? "other";
      if (!out[g]) out[g] = [];
      out[g].push(a);
    });
    return out;
  }, [filteredActors, roleByCode]);

  // Sisa jatah bagi hasil = 100 − Σ(bagi hasil pengurus AKTIF lain).
  // Saat edit, kecualikan diri sendiri agar tidak menghitung jatahnya dua kali.
  const sisaBagiHasil = useMemo(() => {
    const terpakai = actors
      .filter((a) => a.is_active === 1 && a.id !== editingActorId)
      .reduce((sum, a) => sum + (a.profit_share_percent ?? 0), 0);
    return Math.max(0, 100 - terpakai);
  }, [actors, editingActorId]);

  const setF = <K extends keyof OrangForm>(k: K, v: OrangForm[K]) =>
    setOrangForm((f) => ({ ...f, [k]: v }));

  const orangPreview: string[] = [];
  if (orangForm.enable_profit_share) orangPreview.push(`Bagi hasil = Laba Bersih × ${Number(orangForm.profit_share_percent) || 0}%`);
  if (orangPreview.length === 0) orangPreview.push("Belum ada rumus aktif.");

  async function submitOrang() {
    if (!orangForm.display_name.trim()) { showMsg("error", "Nama wajib diisi"); return; }
    if (!orangForm.role_code) { showMsg("error", "Pilih jabatan terlebih dulu"); return; }
    if (!orangForm.enable_profit_share) {
      showMsg("error", "Aktifkan Bagi Hasil supaya pengurus muncul di Ringkasan.");
      return;
    }
    const persenInput = Number(orangForm.profit_share_percent) || 0;
    if (persenInput > sisaBagiHasil) {
      showMsg("error", `Bagi hasil ${persenInput}% melebihi sisa jatah ${sisaBagiHasil}%. Total semua pengurus maksimal 100%.`);
      return;
    }
    setOrangSaving(true);
    try {
      await apiJSON("/api/business-actors", {
        method: "POST",
        body: JSON.stringify({
          action: editingActorId ? "update" : "create",
          id: editingActorId,
          display_name: orangForm.display_name,
          role_code: orangForm.role_code,
          notes: orangForm.notes,
          profit_share_percent: orangForm.enable_profit_share ? Number(orangForm.profit_share_percent) || 0 : null,
        }),
      });
      showMsg("success", editingActorId ? `${orangForm.display_name} diperbarui.` : `${orangForm.display_name} ditambahkan.`);
      setFormOpen(false);
      await reloadOrang();
      // Reload formulas too — syncFormulasForActor just created/updated
      // formula rows in rumus_buku_kas. Without this, the Kolom tab
      // keeps showing stale data until the user closes and reopens the modal.
      onFormulasChanged?.();
      onActorsChanged?.();
      onRecalcTriggered?.();
    } catch (e) { showMsg("error", (e as Error).message); }
    finally { setOrangSaving(false); }
  }

  function handleDeactivate(a: BusinessActorApi) {
    requestConfirm({ title: `Nonaktifkan ${a.display_name}?`, message: "Data historis tetap tersimpan. Rumus terkait akan dimatikan.", confirmText: "Nonaktifkan", type: "warning",
      onConfirm: async () => { try { await apiJSON("/api/business-actors", { method: "POST", body: JSON.stringify({ action: "deactivate", id: a.id }) }); showMsg("success", `${a.display_name} dinonaktifkan.`); await reloadOrang(); onFormulasChanged?.(); onActorsChanged?.(); } catch (e) { showMsg("error", (e as Error).message); } },
    });
  }

  function handleReactivate(a: BusinessActorApi) {
    requestConfirm({ title: `Aktifkan kembali ${a.display_name}?`, message: "Rumus terkait akan dihidupkan kembali.", confirmText: "Aktifkan", type: "info",
      onConfirm: async () => { try { await apiJSON("/api/business-actors", { method: "POST", body: JSON.stringify({ action: "reactivate", id: a.id }) }); showMsg("success", `${a.display_name} diaktifkan.`); await reloadOrang(); onFormulasChanged?.(); onActorsChanged?.(); onRecalcTriggered?.(); } catch (e) { showMsg("error", (e as Error).message); } },
    });
  }

  function handleDeleteActor(a: BusinessActorApi) {
    requestConfirm({ title: `Hapus permanen ${a.display_name}?`, message: "Tidak bisa dibatalkan. Jika ada transaksi terkait, sistem akan menolak.", confirmText: "Hapus permanen", type: "danger",
      onConfirm: async () => { try { await apiJSON("/api/business-actors", { method: "POST", body: JSON.stringify({ action: "delete", id: a.id }) }); showMsg("success", `${a.display_name} dihapus.`); await reloadOrang(); onFormulasChanged?.(); onActorsChanged?.(); } catch (e) { showMsg("error", (e as Error).message); } },
    });
  }

  // Lapor jumlah pengurus aktif + status modal form ke induk.
  useEffect(() => {
    onActiveCountChange?.(actors.filter((a) => a.is_active === 1).length);
  }, [actors, onActiveCountChange]);

  useEffect(() => {
    onFormOpenChange?.(formOpen);
  }, [formOpen, onFormOpenChange]);

  return (
    <>
      {/* Inner form modal for Orang tab (z-[60] so it appears above PengaturanModal z-50) */}
      <ModalFormShell
        open={formOpen}
        onClose={() => setFormOpen(false)}
        maxWidthClass="max-w-2xl"
        zIndexClass="z-[60]"
        header={
          <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">{editingActorId ? "Edit Pengurus" : "Tambah Pengurus"}</h3>
              <p className="text-blue-100 text-base mt-1">Jabatan hanya label. Atur persentase bagi hasil untuk orang ini.</p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0"
              aria-label="Tutup"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        }
        footer={
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 dark:bg-slate-800 flex justify-end gap-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-1.5 text-base rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Batal</button>
            <button type="button" onClick={submitOrang} disabled={orangSaving} className="px-4 py-1.5 text-base rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {orangSaving ? "Menyimpan…" : editingActorId ? "Simpan perubahan" : "Tambah orang"}
            </button>
          </div>
        }
      >
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-semibold text-slate-600 dark:text-slate-300 mb-1">Nama</label>
              <input type="text" value={orangForm.display_name} onChange={(e) => setF("display_name", e.target.value)} placeholder="Mis. Andi" className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-md dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" />
            </div>
            <div>
              <label className="block text-base font-semibold text-slate-600 dark:text-slate-300 mb-1">Jabatan</label>
              <select value={orangForm.role_code} onChange={(e) => setF("role_code", e.target.value)} className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-md bg-white dark:bg-slate-900">
                <option value="">— Pilih jabatan —</option>
                {GROUP_ORDER.map((g) => {
                  const gr = roles.filter((r) => r.role_group === g);
                  if (!gr.length) return null;
                  return (
                    <optgroup key={g} label={ROLE_GROUP_LABEL[g]}>
                      {gr.map((r) => <option key={r.id} value={r.role_code}>{r.role_label}</option>)}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="rounded-md border border-blue-200 dark:border-slate-700 bg-blue-50 dark:bg-slate-800 px-3 py-2.5 space-y-1">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Rumus yang akan dibuat</p>
            {orangPreview.map((l) => <p key={l} className="text-base text-blue-800 dark:text-blue-200">{l}</p>)}
          </div>

          {/* Bagi Hasil */}
          <div className={`rounded-lg border-2 p-4 transition-colors ${orangForm.enable_profit_share ? "border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/40" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={orangForm.enable_profit_share} onChange={(e) => setF("enable_profit_share", e.target.checked)} className="w-4 h-4 accent-amber-500" />
              <span className="text-base font-semibold text-slate-700 dark:text-slate-200">Bagi Hasil</span>
              <span className="text-base text-slate-400">persentase dari laba bersih</span>
            </label>
            {orangForm.enable_profit_share && (
              <div className="mt-3">
                <label className="block text-base font-semibold text-slate-600 dark:text-slate-300 mb-1">Persentase (%)</label>
                <input type="number" min="0" max="100" step="0.01" value={orangForm.profit_share_percent} onChange={(e) => setF("profit_share_percent", e.target.value)} placeholder="Mis. 40" className="w-40 px-3 py-2.5 text-base border border-slate-300 rounded-md dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" />
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Sisa jatah bagi hasil tersedia: <strong>{sisaBagiHasil}%</strong>. Total semua pengurus tidak boleh lebih dari 100%.</p>
              </div>
            )}
          </div>

          {/* Kasbon */}

          {/* Bonus */}

          {/* Catatan */}
          <div>
            <label className="block text-base font-semibold text-slate-600 dark:text-slate-300 mb-1">Catatan (opsional)</label>
            <textarea value={orangForm.notes} onChange={(e) => setF("notes", e.target.value)} rows={2} className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-md dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" placeholder="Catatan internal — tidak muncul di rumus" />
          </div>
        </div>
      </ModalFormShell>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <input type="text" value={orangSearch} onChange={(e) => setOrangSearch(e.target.value)} placeholder="Cari nama / jabatan…" className="px-3 py-1.5 text-base border border-slate-300 rounded-md w-52 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" />
            <label className="text-base text-slate-600 flex items-center gap-2 select-none cursor-pointer">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Tampilkan nonaktif
            </label>
          </div>
          <button type="button" onClick={() => { setEditingActorId(null); setOrangForm({ ...EMPTY_ORANG, role_code: roles[0]?.role_code ?? "", enable_profit_share: true, profit_share_percent: String(sisaBagiHasil) }); setFormOpen(true); }} className="px-3 py-1.5 text-base rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold">
            + Tambah Pengurus
          </button>
        </div>

        {orangLoading && <div className="py-10 text-center text-slate-500 text-base">Memuat data…</div>}

        {!orangLoading && filteredActors.length === 0 && (
          <div className="py-12 text-center text-slate-500 text-base space-y-2">
            <p>Belum ada pengurus. Tekan <strong>+ Tambah Pengurus</strong> untuk mulai.</p>
            <p className="text-base text-slate-400">Pengurus menerima bagi hasil dari laba bersih.</p>
          </div>
        )}

        {!orangLoading && filteredActors.length > 0 && (
          <div className="space-y-4">
            {GROUP_ORDER.map((group) => {
              const list = groupedActors[group];
              if (!list?.length) return null;
              return (
                <section key={group}>
                  <h3 className="text-base uppercase tracking-wider font-semibold text-slate-500 mb-2">{ROLE_GROUP_LABEL[group]} ({list.length})</h3>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-base">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 text-base uppercase">
                        <tr>
                          <th className="px-3 py-2.5 text-left">Nama</th>
                          <th className="px-3 py-2.5 text-left">Jabatan</th>
                          <th className="px-3 py-2.5 text-left">Rumus aktif</th>
                          <th className="px-3 py-2.5 text-center">Status</th>
                          <th className="px-3 py-2.5 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100">
                        {list.map((a) => {
                          const role = roleByCode.get(a.role_code);
                          const lines = describeActor(a);
                          return (
                            <tr key={a.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                                {a.display_name}
                                {a.notes && <div className="text-sm text-slate-400 mt-0.5">{a.notes}</div>}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="inline-block px-2 py-0.5 text-sm rounded-full border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600">{role?.role_label ?? a.role_code}</span>
                              </td>
                              <td className="px-3 py-2.5 text-base text-slate-600 dark:text-slate-300">
                                {lines.length > 0 ? (
                                  <ul className="space-y-0.5">
                                    {lines.map((l) => (
                                      <li key={l} className="flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                        {l}
                                      </li>
                                    ))}
                                  </ul>
                                ) : <span className="text-slate-400">Tidak ada rumus</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {a.is_active === 1
                                  ? <span className="text-base text-emerald-700 dark:text-emerald-300">Aktif</span>
                                  : <span className="text-base text-slate-400">Nonaktif</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <MenuAksi
                                  labelMenu={`Aksi untuk ${a.display_name}`}
                                  aksi={[
                                    {
                                      label: "Edit Pengurus",
                                      judul: "Edit pengurus",
                                      onClick: () => { setEditingActorId(a.id); setOrangForm(actorToForm(a)); setFormOpen(true); },
                                      ikon: <svg className="w-5 h-5 text-blue-600 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
                                    },
                                    {
                                      label: "Nonaktifkan Pengurus",
                                      judul: "Nonaktifkan pengurus",
                                      tampil: a.is_active === 1,
                                      onClick: () => handleDeactivate(a),
                                      ikon: <svg className="w-5 h-5 text-amber-600 dark:text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>,
                                    },
                                    {
                                      label: "Aktifkan Kembali",
                                      judul: "Aktifkan kembali",
                                      tampil: a.is_active !== 1,
                                      onClick: () => handleReactivate(a),
                                      ikon: <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                                    },
                                    {
                                      label: "Hapus Permanen",
                                      judul: "Hapus permanen",
                                      varian: "bahaya",
                                      onClick: () => handleDeleteActor(a),
                                      ikon: <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
                                    },
                                  ]}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
