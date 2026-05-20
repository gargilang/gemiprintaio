"use client";

/**
 * Kelola Orang — manage every person/entity that appears in finance.
 *
 * Role = job title only (Manager, Karyawan, Sales, …).
 * Formula types (bagi hasil / kasbon / bonus) are configured independently
 * per actor — any combination is valid. A Manager can have all three at once.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import ModalFormShell from "@/components/ModalFormShell";
import NotificationToast, {
  type NotificationToastProps,
} from "@/components/NotificationToast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { UsersIcon } from "@/components/icons/ContentIcons";
import { fetchSessionUser } from "@/lib/client-session";

// ── Types ──────────────────────────────────────────────────────────────────

type RoleGroup = "owner" | "management" | "sales" | "staff" | "other";

interface ActorRoleApi {
  id: string;
  role_code: string;
  role_label: string;
  role_group: RoleGroup;
  description: string | null;
  display_order: number;
}

interface BusinessActorApi {
  id: string;
  display_name: string;
  role_code: string;
  is_active: number;
  display_order: number;
  notes: string | null;
  profit_share_percent: number | null;
  cash_advance_categories: string[] | null;
  keperluan_keyword: string | null;
  bonus_percent: number | null;
  bonus_source_formula_key: string | null;
  created_at: string;
}

const ROLE_GROUP_LABEL: Record<RoleGroup, string> = {
  owner: "Pemilik / Komisaris",
  management: "Manajemen",
  sales: "Sales",
  staff: "Staf / Karyawan",
  other: "Lainnya",
};

// ── Form state ─────────────────────────────────────────────────────────────

interface FormState {
  display_name: string;
  role_code: string;
  notes: string;
  // Bagi hasil
  enable_profit_share: boolean;
  profit_share_percent: string;
  // Kasbon
  enable_cash_advance: boolean;
  kasbon_category_codes: string[];
  keperluan_keyword: string;
  // Bonus
  enable_bonus: boolean;
  bonus_percent: string;
  bonus_source_formula_key: string;
}

const EMPTY_FORM: FormState = {
  display_name: "",
  role_code: "",
  notes: "",
  enable_profit_share: false,
  profit_share_percent: "",
  enable_cash_advance: false,
  kasbon_category_codes: [],
  keperluan_keyword: "",
  enable_bonus: false,
  bonus_percent: "",
  bonus_source_formula_key: "omzet",
};

function actorToForm(actor: BusinessActorApi): FormState {
  return {
    display_name: actor.display_name,
    role_code: actor.role_code,
    notes: actor.notes ?? "",
    enable_profit_share: actor.profit_share_percent !== null,
    profit_share_percent:
      actor.profit_share_percent != null
        ? String(actor.profit_share_percent)
        : "",
    enable_cash_advance:
      (actor.cash_advance_categories?.length ?? 0) > 0,
    kasbon_category_codes: actor.cash_advance_categories ?? [],
    keperluan_keyword: actor.keperluan_keyword ?? "",
    enable_bonus: actor.bonus_percent !== null,
    bonus_percent:
      actor.bonus_percent != null ? String(actor.bonus_percent) : "",
    bonus_source_formula_key:
      actor.bonus_source_formula_key ?? "omzet",
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body?.error as string) || "Terjadi kesalahan");
  return body as T;
}

function describeActorFormulas(actor: BusinessActorApi): string[] {
  const parts: string[] = [];
  if (actor.profit_share_percent !== null)
    parts.push(`Bagi hasil ${actor.profit_share_percent}%`);
  if ((actor.cash_advance_categories?.length ?? 0) > 0) {
    const cats = actor.cash_advance_categories!.join("/");
    const kw = actor.keperluan_keyword ? ` · "${actor.keperluan_keyword}"` : "";
    parts.push(`Kasbon ${cats}${kw}`);
  }
  if (actor.bonus_percent !== null)
    parts.push(
      `Bonus ${actor.bonus_percent}% dari ${actor.bonus_source_formula_key ?? "omzet"}`
    );
  return parts;
}

// ── Main component ─────────────────────────────────────────────────────────

interface FinanceCategoryOption {
  category_code: string;
  display_name: string;
  direction: string;
}

export default function KelolaOrangPage() {
  const router = useRouter();
  const [actors, setActors] = useState<BusinessActorApi[]>([]);
  const [roles, setRoles] = useState<ActorRoleApi[]>([]);
  const [financeCategories, setFinanceCategories] = useState<
    FinanceCategoryOption[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    type?: "warning" | "danger" | "info";
    onConfirm: () => void;
  } | null>(null);

  const showMsg = useCallback(
    (type: "success" | "error", message: string) => {
      setNotice({ type, message });
      setTimeout(() => setNotice(null), 3500);
    },
    []
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/business-actors${showInactive ? "?include_inactive=1" : ""}`;
      const result = await fetchJSON<{
        actors: BusinessActorApi[];
        roles: ActorRoleApi[];
      }>(url);
      setActors(result.actors);
      setRoles(result.roles);
    } catch (e) {
      showMsg("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [showInactive, showMsg]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await fetchSessionUser();
      if (cancelled) return;
      if (!u) { router.push("/auth/login"); return; }
      try {
        const catRes = await fetchJSON<{ categories: FinanceCategoryOption[] }>(
          "/api/finance/categories"
        );
        if (!cancelled) setFinanceCategories(catRes.categories ?? []);
      } catch {
        // Non-blocking — user can still save if categories fail to load.
      }
      await reload();
    })();
    return () => { cancelled = true; };
  }, [router, reload]);

  const roleByCode = useMemo(() => {
    const m = new Map<string, ActorRoleApi>();
    for (const r of roles) m.set(r.role_code, r);
    return m;
  }, [roles]);

  const filtered = useMemo(() => {
    let list = [...actors];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.display_name.toLowerCase().includes(q) ||
          a.role_code.toLowerCase().includes(q) ||
          (a.notes?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [actors, searchQuery]);

  // Group actors by role_group for display
  const grouped = useMemo(() => {
    const out: Record<string, BusinessActorApi[]> = {};
    for (const a of filtered) {
      const rg = roleByCode.get(a.role_code)?.role_group ?? "other";
      if (!out[rg]) out[rg] = [];
      out[rg].push(a);
    }
    return out;
  }, [filtered, roleByCode]);

  // Ordered groups for rendering
  const groupOrder: RoleGroup[] = ["owner", "management", "sales", "staff", "other"];

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, role_code: roles[0]?.role_code ?? "" });
    setModalOpen(true);
  }

  function openEdit(actor: BusinessActorApi) {
    setEditingId(actor.id);
    setForm(actorToForm(actor));
    setModalOpen(true);
  }

  async function submitForm() {
    if (!form.display_name.trim()) { showMsg("error", "Nama wajib diisi"); return; }
    if (!form.role_code) { showMsg("error", "Pilih jabatan terlebih dulu"); return; }
    if (
      form.enable_cash_advance &&
      form.kasbon_category_codes.length === 0
    ) {
      showMsg("error", "Pilih minimal satu kategori untuk kasbon");
      return;
    }

    const payload: Record<string, unknown> = {
      action: editingId ? "update" : "create",
      id: editingId,
      display_name: form.display_name,
      role_code: form.role_code,
      notes: form.notes,
      profit_share_percent: form.enable_profit_share
        ? Number(form.profit_share_percent) || 0
        : null,
      cash_advance_categories: form.enable_cash_advance
        ? form.kasbon_category_codes.map((c) => c.toUpperCase())
        : null,
      keperluan_keyword: form.enable_cash_advance
        ? form.keperluan_keyword.trim() || null
        : null,
      bonus_percent: form.enable_bonus
        ? Number(form.bonus_percent) || 0
        : null,
      bonus_source_formula_key: form.enable_bonus
        ? form.bonus_source_formula_key.trim() || "omzet"
        : null,
    };

    setSaving(true);
    try {
      await fetchJSON("/api/business-actors", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showMsg(
        "success",
        editingId
          ? `${form.display_name} berhasil diperbarui.`
          : `${form.display_name} berhasil ditambahkan.`
      );
      setModalOpen(false);
      await reload();
    } catch (e) {
      showMsg("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDeactivate(actor: BusinessActorApi) {
    setConfirm({
      title: `Nonaktifkan ${actor.display_name}?`,
      message:
        "Data historis tetap tersimpan. Rumus yang terkait akan dimatikan. Anda bisa aktifkan kembali kapan saja.",
      confirmText: "Nonaktifkan",
      type: "warning",
      onConfirm: async () => {
        try {
          await fetchJSON("/api/business-actors", {
            method: "POST",
            body: JSON.stringify({ action: "deactivate", id: actor.id }),
          });
          showMsg("success", `${actor.display_name} dinonaktifkan.`);
          await reload();
        } catch (e) { showMsg("error", (e as Error).message); }
      },
    });
  }

  function handleReactivate(actor: BusinessActorApi) {
    setConfirm({
      title: `Aktifkan kembali ${actor.display_name}?`,
      message: "Rumus terkait akan dihidupkan dan buku kas dihitung ulang.",
      confirmText: "Aktifkan",
      type: "info",
      onConfirm: async () => {
        try {
          await fetchJSON("/api/business-actors", {
            method: "POST",
            body: JSON.stringify({ action: "reactivate", id: actor.id }),
          });
          showMsg("success", `${actor.display_name} diaktifkan.`);
          await reload();
        } catch (e) { showMsg("error", (e as Error).message); }
      },
    });
  }

  function handleDelete(actor: BusinessActorApi) {
    setConfirm({
      title: `Hapus permanen ${actor.display_name}?`,
      message:
        "Tidak bisa dibatalkan. Jika sudah ada transaksi terkait, sistem akan menolak dan menyarankan Nonaktifkan.",
      confirmText: "Hapus permanen",
      type: "danger",
      onConfirm: async () => {
        try {
          await fetchJSON("/api/business-actors", {
            method: "POST",
            body: JSON.stringify({ action: "delete", id: actor.id }),
          });
          showMsg("success", `${actor.display_name} dihapus.`);
          await reload();
        } catch (e) { showMsg("error", (e as Error).message); }
      },
    });
  }

  // ── Form helpers ──────────────────────────────────────────────────────────

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleKasbonCategory = (code: string) => {
    const upper = code.toUpperCase();
    setForm((f) => {
      const has = f.kasbon_category_codes.includes(upper);
      return {
        ...f,
        kasbon_category_codes: has
          ? f.kasbon_category_codes.filter((c) => c !== upper)
          : [...f.kasbon_category_codes, upper],
      };
    });
  };

  // Summary line for preview box
  const previewLines: string[] = [];
  if (form.enable_profit_share) {
    const pct = Number(form.profit_share_percent) || 0;
    previewLines.push(`Bagi hasil = Laba Bersih × ${pct}%`);
  }
  if (form.enable_cash_advance) {
    const cats = form.kasbon_category_codes;
    if (cats.length > 0) {
      const kw = form.keperluan_keyword.trim();
      previewLines.push(
        `Kasbon dari kategori ${cats.join("/")}${kw ? ` · keperluan "${kw}"` : ""}`
      );
    } else {
      previewLines.push("Kasbon: isi minimal satu kategori transaksi");
    }
  }
  if (form.enable_bonus) {
    const pct = Number(form.bonus_percent) || 0;
    previewLines.push(
      `Bonus = ${form.bonus_source_formula_key || "omzet"} × ${pct}%`
    );
  }
  if (previewLines.length === 0) {
    previewLines.push(
      "Belum ada rumus aktif. Centang minimal satu jenis kalkulasi di bawah."
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {notice && <NotificationToast type={notice.type} message={notice.message} />}
      {confirm && (
        <ConfirmDialog
          show
          title={confirm.title}
          message={confirm.message}
          confirmText={confirm.confirmText}
          type={confirm.type}
          onConfirm={() => { const h = confirm.onConfirm; setConfirm(null); void h(); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-700">
                <UsersIcon size={22} />
              </span>
              Kelola Orang
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Setiap orang bisa mendapat bagi hasil, kasbon, dan bonus sekaligus
              — tidak terbatas oleh jabatan. Rumus dibuat otomatis.
            </p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow"
          >
            + Tambah Orang
          </button>
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama / jabatan…"
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-md w-56"
            />
            <label className="text-xs text-slate-600 flex items-center gap-2 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Tampilkan yang nonaktif
            </label>
          </div>

          {loading && (
            <div className="py-10 text-center text-slate-500 text-sm">Memuat data…</div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="py-12 text-center text-slate-500 text-sm space-y-2">
              <p>Belum ada orang. Tekan <strong className="text-slate-700">+ Tambah Orang</strong> untuk mulai.</p>
              <p className="text-xs text-slate-400">
                Bar Bagi Hasil / Kasbon / Bonus di halaman Keuangan muncul otomatis
                begitu Anda menambah dan mengaktifkan rumus.
              </p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="space-y-6">
              {groupOrder.map((group) => {
                const list = grouped[group];
                if (!list?.length) return null;
                return (
                  <section key={group}>
                    <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">
                      {ROLE_GROUP_LABEL[group]} ({list.length})
                    </h2>
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                          <tr>
                            <th className="px-3 py-2 text-left">Nama</th>
                            <th className="px-3 py-2 text-left">Jabatan</th>
                            <th className="px-3 py-2 text-left">Rumus aktif</th>
                            <th className="px-3 py-2 text-center">Status</th>
                            <th className="px-3 py-2 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                          {list.map((a) => {
                            const role = roleByCode.get(a.role_code);
                            const formulaLines = describeActorFormulas(a);
                            return (
                              <tr key={a.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-medium text-slate-800">
                                  {a.display_name}
                                  {a.notes && (
                                    <div className="text-[11px] text-slate-400 mt-0.5">{a.notes}</div>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="inline-block px-2 py-0.5 text-[11px] rounded-full border bg-slate-100 text-slate-700 border-slate-300">
                                    {role?.role_label ?? a.role_code}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-600">
                                  {formulaLines.length > 0 ? (
                                    <ul className="space-y-0.5">
                                      {formulaLines.map((l) => (
                                        <li key={l} className="flex items-center gap-1">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                          {l}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="text-slate-400">Tidak ada rumus</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {a.is_active === 1 ? (
                                    <span className="text-xs text-emerald-700">Aktif</span>
                                  ) : (
                                    <span className="text-xs text-slate-400">Nonaktif</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right space-x-1">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(a)}
                                    className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                                  >
                                    Edit
                                  </button>
                                  {a.is_active === 1 ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDeactivate(a)}
                                      className="px-2 py-1 text-xs rounded border border-amber-300 text-amber-700 hover:bg-amber-50"
                                    >
                                      Nonaktifkan
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleReactivate(a)}
                                      className="px-2 py-1 text-xs rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                    >
                                      Aktifkan
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(a)}
                                    className="px-2 py-1 text-xs rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                                  >
                                    Hapus
                                  </button>
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
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      <ModalFormShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidthClass="max-w-2xl"
        header={
          <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-4">
            <h3 className="text-lg font-bold text-white">
              {editingId ? "Edit Orang" : "Tambah Orang"}
            </h3>
            <p className="text-blue-100 text-xs mt-1">
              Jabatan hanya label. Centang rumus mana saja yang berlaku untuk orang ini.
            </p>
          </div>
        }
        footer={
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-1.5 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={submitForm}
              disabled={saving}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Menyimpan…" : editingId ? "Simpan perubahan" : "Tambah orang"}
            </button>
          </div>
        }
      >
        <div className="p-5 space-y-5">
          {/* Nama & Jabatan */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nama</label>
              <input
                type="text"
                value={form.display_name}
                onChange={(e) => setF("display_name", e.target.value)}
                placeholder="Mis. Andi"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Jabatan</label>
              <select
                value={form.role_code}
                onChange={(e) => setF("role_code", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="">— Pilih jabatan —</option>
                {groupOrder.map((g) => {
                  const groupRoles = roles.filter((r) => r.role_group === g);
                  if (!groupRoles.length) return null;
                  return (
                    <optgroup key={g} label={ROLE_GROUP_LABEL[g]}>
                      {groupRoles.map((r) => (
                        <option key={r.id} value={r.role_code}>
                          {r.role_label}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Preview rumus */}
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 space-y-1">
            <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">
              Rumus yang akan dibuat
            </p>
            {previewLines.map((l) => (
              <p key={l} className="text-xs text-blue-800">{l}</p>
            ))}
          </div>

          {/* ── Bagi Hasil ────────────────────────────────────────────────── */}
          <div className={`rounded-lg border-2 p-4 transition-colors ${
            form.enable_profit_share
              ? "border-amber-300 bg-amber-50"
              : "border-slate-200 bg-white"
          }`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.enable_profit_share}
                onChange={(e) => setF("enable_profit_share", e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              <span className="text-sm font-semibold text-slate-700">
                Bagi Hasil
              </span>
              <span className="text-xs text-slate-400">
                persentase dari laba bersih
              </span>
            </label>
            {form.enable_profit_share && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Persentase (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.profit_share_percent}
                  onChange={(e) => setF("profit_share_percent", e.target.value)}
                  placeholder="Mis. 40"
                  className="w-40 px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
            )}
          </div>

          {/* ── Kasbon ────────────────────────────────────────────────────── */}
          <div className={`rounded-lg border-2 p-4 transition-colors ${
            form.enable_cash_advance
              ? "border-violet-300 bg-violet-50"
              : "border-slate-200 bg-white"
          }`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.enable_cash_advance}
                onChange={(e) => setF("enable_cash_advance", e.target.checked)}
                className="w-4 h-4 accent-violet-500"
              />
              <span className="text-sm font-semibold text-slate-700">Kasbon</span>
              <span className="text-xs text-slate-400">
                akumulasi dari kategori transaksi tertentu
              </span>
            </label>
            {form.enable_cash_advance && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Kategori transaksi untuk kasbon
                  </label>
                  {financeCategories.length === 0 ? (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      Daftar kategori belum dimuat. Buka halaman{" "}
                      <a href="/finance" className="underline font-semibold">
                        Keuangan → Pengaturan → Kategori
                      </a>{" "}
                      untuk menambah kategori, lalu refresh halaman ini.
                    </p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto rounded-md border border-violet-200 bg-white divide-y divide-violet-50">
                      {financeCategories.map((cat) => {
                        const code = cat.category_code.toUpperCase();
                        const checked = form.kasbon_category_codes.includes(code);
                        return (
                          <label
                            key={code}
                            className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-violet-50/80 ${
                              checked ? "bg-violet-50" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleKasbonCategory(code)}
                              className="w-4 h-4 accent-violet-600 shrink-0"
                            />
                            <span className="font-mono text-xs font-semibold text-violet-900">
                              {code}
                            </span>
                            <span className="text-xs text-slate-600 truncate">
                              {cat.display_name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {form.kasbon_category_codes.length > 0 && (
                    <p className="text-[11px] text-violet-700 mt-1.5 font-medium">
                      Dipilih: {form.kasbon_category_codes.join(", ")}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1">
                    Sama dengan kategori di buku kas Keuangan — pilih yang
                    transaksinya dihitung sebagai kasbon orang ini.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Keperluan harus mengandung (opsional)
                  </label>
                  <input
                    type="text"
                    value={form.keperluan_keyword}
                    onChange={(e) => setF("keperluan_keyword", e.target.value)}
                    placeholder="Nama panggilan atau kata kunci — untuk membedakan jika ada 2 orang di kategori yang sama"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Bonus ─────────────────────────────────────────────────────── */}
          <div className={`rounded-lg border-2 p-4 transition-colors ${
            form.enable_bonus
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-200 bg-white"
          }`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.enable_bonus}
                onChange={(e) => setF("enable_bonus", e.target.checked)}
                className="w-4 h-4 accent-emerald-500"
              />
              <span className="text-sm font-semibold text-slate-700">Bonus</span>
              <span className="text-xs text-slate-400">
                persentase dari omzet / laba / rumus lain
              </span>
            </label>
            {form.enable_bonus && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Persentase (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.bonus_percent}
                    onChange={(e) => setF("bonus_percent", e.target.value)}
                    placeholder="Mis. 5"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Dari rumus
                  </label>
                  <select
                    value={form.bonus_source_formula_key}
                    onChange={(e) => setF("bonus_source_formula_key", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    <option value="omzet">Omzet</option>
                    <option value="laba_bersih">Laba Bersih</option>
                    <option value="biaya_operasional">Biaya Operasional</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Catatan */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Catatan (opsional)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setF("notes", e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              placeholder="Catatan internal — tidak muncul di rumus"
            />
          </div>
        </div>
      </ModalFormShell>
    </div>
  );
}
