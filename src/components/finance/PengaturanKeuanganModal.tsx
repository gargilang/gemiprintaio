"use client";

/**
 * PengaturanKeuanganModal — satu modal untuk semua pengaturan keuangan.
 * Tab: Orang | Kategori | Rumus | Uji coba
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import FormulaEditor from "@/components/formula-editor/FormulaEditor";
import { astToText } from "@/lib/ast/graph";
import type { ASTNode } from "@/lib/ast/types";

// ── Shared helpers ──────────────────────────────────────────────────────────

async function apiJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body?.error as string) || "Terjadi kesalahan");
  return body as T;
}

function slugifyCode(name: string, maxLen = 24): string {
  const base = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, maxLen);
  return base || `KAT${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type PengaturanTab = "orang" | "kategori" | "rumus" | "uji-coba";

export interface PengaturanKeuanganModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: PengaturanTab;
  /** Called when categories change — parent should refresh its category list */
  onCategoriesChanged?: () => void;
  /** Called when a change triggers cashbook recalculation */
  onRecalcTriggered?: () => void;
}

// ── Orang types ─────────────────────────────────────────────────────────────

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
interface FinanceCatOption { category_code: string; display_name: string; }

interface OrangForm {
  display_name: string; role_code: string; notes: string;
  enable_profit_share: boolean; profit_share_percent: string;
  enable_cash_advance: boolean; kasbon_category_codes: string[]; keperluan_keyword: string;
  enable_bonus: boolean; bonus_percent: string; bonus_source_formula_key: string;
}
const EMPTY_ORANG: OrangForm = {
  display_name: "", role_code: "", notes: "",
  enable_profit_share: false, profit_share_percent: "",
  enable_cash_advance: false, kasbon_category_codes: [], keperluan_keyword: "",
  enable_bonus: false, bonus_percent: "", bonus_source_formula_key: "omzet",
};
function actorToForm(a: BusinessActorApi): OrangForm {
  return {
    display_name: a.display_name, role_code: a.role_code, notes: a.notes ?? "",
    enable_profit_share: a.profit_share_percent !== null,
    profit_share_percent: a.profit_share_percent != null ? String(a.profit_share_percent) : "",
    enable_cash_advance: (a.cash_advance_categories?.length ?? 0) > 0,
    kasbon_category_codes: a.cash_advance_categories ?? [], keperluan_keyword: a.keperluan_keyword ?? "",
    enable_bonus: a.bonus_percent !== null,
    bonus_percent: a.bonus_percent != null ? String(a.bonus_percent) : "",
    bonus_source_formula_key: a.bonus_source_formula_key ?? "omzet",
  };
}
function describeActor(a: BusinessActorApi): string[] {
  const p: string[] = [];
  if (a.profit_share_percent !== null) p.push(`Bagi hasil ${a.profit_share_percent}%`);
  if ((a.cash_advance_categories?.length ?? 0) > 0) {
    const cats = a.cash_advance_categories!.join("/");
    p.push(`Kasbon ${cats}${a.keperluan_keyword ? ` · "${a.keperluan_keyword}"` : ""}`);
  }
  if (a.bonus_percent !== null)
    p.push(`Bonus ${a.bonus_percent}% dari ${a.bonus_source_formula_key ?? "omzet"}`);
  return p;
}

// ── Kategori types ──────────────────────────────────────────────────────────

interface KategoriApi {
  id?: string; category_code: string; display_name: string;
  metric_contributions?: unknown;
}
interface ColumnRuleApi {
  column_name: string; display_name: string; rule_type: string;
}

// ── Rumus types ─────────────────────────────────────────────────────────────

interface FormulaApi {
  id: string; name: string; column: string; dbColumn: string;
  ast: ASTNode; enabled: boolean; isSystem: boolean; displayOrder: number;
}
interface PartnerApi { id: string; name: string; }

// ── Inline notice ───────────────────────────────────────────────────────────

interface Notice { type: "success" | "error"; message: string; }

function InlineNotice({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <div className={`mx-4 mt-3 px-3 py-2 rounded text-sm ${
      notice.type === "success"
        ? "bg-emerald-50 border border-emerald-300 text-emerald-800"
        : "bg-rose-50 border border-rose-300 text-rose-800"
    }`}>
      {notice.message}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════

export default function PengaturanKeuanganModal({
  open, onClose, defaultTab = "orang",
  onCategoriesChanged, onRecalcTriggered,
}: PengaturanKeuanganModalProps) {
  const [tab, setTab] = useState<PengaturanTab>(defaultTab);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string; message: string; confirmText?: string;
    type?: "warning" | "danger" | "info"; onConfirm: () => void;
  } | null>(null);

  const showMsg = useCallback((type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3500);
  }, []);

  useEffect(() => {
    if (open) {
      setTab(defaultTab);
      setNotice(null);
    }
  }, [open, defaultTab]);

  // ── Orang state ────────────────────────────────────────────────────────────
  const [actors, setActors] = useState<BusinessActorApi[]>([]);
  const [roles, setRoles] = useState<ActorRoleApi[]>([]);
  const [finCats, setFinCats] = useState<FinanceCatOption[]>([]);
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
    if (open && tab === "orang" && !orangLoaded) {
      void reloadOrang();
      apiJSON<{ categories: FinanceCatOption[] }>("/api/finance/categories")
        .then((r) => setFinCats(r.categories ?? []))
        .catch(() => {});
    }
  }, [open, tab, orangLoaded, reloadOrang]);

  useEffect(() => {
    if (orangLoaded) void reloadOrang(showInactive);
  }, [showInactive]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleByCode = useMemo(() => {
    const m = new Map<string, ActorRoleApi>();
    roles.forEach((r) => m.set(r.role_code, r));
    return m;
  }, [roles]);

  const filteredActors = useMemo(() => {
    let list = [...actors];
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

  const setF = <K extends keyof OrangForm>(k: K, v: OrangForm[K]) =>
    setOrangForm((f) => ({ ...f, [k]: v }));

  const toggleKasbonCat = (code: string) => {
    const up = code.toUpperCase();
    setOrangForm((f) => {
      const has = f.kasbon_category_codes.includes(up);
      return { ...f, kasbon_category_codes: has ? f.kasbon_category_codes.filter((c) => c !== up) : [...f.kasbon_category_codes, up] };
    });
  };

  const orangPreview: string[] = [];
  if (orangForm.enable_profit_share) orangPreview.push(`Bagi hasil = Laba Bersih × ${Number(orangForm.profit_share_percent) || 0}%`);
  if (orangForm.enable_cash_advance) {
    orangPreview.push(orangForm.kasbon_category_codes.length > 0
      ? `Kasbon dari ${orangForm.kasbon_category_codes.join("/")}${orangForm.keperluan_keyword ? ` · "${orangForm.keperluan_keyword}"` : ""}`
      : "Kasbon: pilih minimal satu kategori");
  }
  if (orangForm.enable_bonus) orangPreview.push(`Bonus = ${orangForm.bonus_source_formula_key || "omzet"} × ${Number(orangForm.bonus_percent) || 0}%`);
  if (orangPreview.length === 0) orangPreview.push("Belum ada rumus aktif.");

  async function submitOrang() {
    if (!orangForm.display_name.trim()) { showMsg("error", "Nama wajib diisi"); return; }
    if (!orangForm.role_code) { showMsg("error", "Pilih jabatan terlebih dulu"); return; }
    if (orangForm.enable_cash_advance && orangForm.kasbon_category_codes.length === 0) {
      showMsg("error", "Pilih minimal satu kategori untuk kasbon"); return;
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
          cash_advance_categories: orangForm.enable_cash_advance ? orangForm.kasbon_category_codes.map((c) => c.toUpperCase()) : null,
          keperluan_keyword: orangForm.enable_cash_advance ? orangForm.keperluan_keyword.trim() || null : null,
          bonus_percent: orangForm.enable_bonus ? Number(orangForm.bonus_percent) || 0 : null,
          bonus_source_formula_key: orangForm.enable_bonus ? orangForm.bonus_source_formula_key.trim() || "omzet" : null,
        }),
      });
      showMsg("success", editingActorId ? `${orangForm.display_name} diperbarui.` : `${orangForm.display_name} ditambahkan.`);
      setFormOpen(false);
      await reloadOrang();
    } catch (e) { showMsg("error", (e as Error).message); }
    finally { setOrangSaving(false); }
  }

  function handleDeactivate(a: BusinessActorApi) {
    setPendingConfirm({ title: `Nonaktifkan ${a.display_name}?`, message: "Data historis tetap tersimpan. Rumus terkait akan dimatikan.", confirmText: "Nonaktifkan", type: "warning",
      onConfirm: async () => { try { await apiJSON("/api/business-actors", { method: "POST", body: JSON.stringify({ action: "deactivate", id: a.id }) }); showMsg("success", `${a.display_name} dinonaktifkan.`); await reloadOrang(); } catch (e) { showMsg("error", (e as Error).message); } },
    });
  }

  function handleReactivate(a: BusinessActorApi) {
    setPendingConfirm({ title: `Aktifkan kembali ${a.display_name}?`, message: "Rumus terkait akan dihidupkan kembali.", confirmText: "Aktifkan", type: "info",
      onConfirm: async () => { try { await apiJSON("/api/business-actors", { method: "POST", body: JSON.stringify({ action: "reactivate", id: a.id }) }); showMsg("success", `${a.display_name} diaktifkan.`); await reloadOrang(); } catch (e) { showMsg("error", (e as Error).message); } },
    });
  }

  function handleDeleteActor(a: BusinessActorApi) {
    setPendingConfirm({ title: `Hapus permanen ${a.display_name}?`, message: "Tidak bisa dibatalkan. Jika ada transaksi terkait, sistem akan menolak.", confirmText: "Hapus permanen", type: "danger",
      onConfirm: async () => { try { await apiJSON("/api/business-actors", { method: "POST", body: JSON.stringify({ action: "delete", id: a.id }) }); showMsg("success", `${a.display_name} dihapus.`); await reloadOrang(); } catch (e) { showMsg("error", (e as Error).message); } },
    });
  }

  // ── Kategori state ─────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<KategoriApi[]>([]);
  const [columnRules, setColumnRules] = useState<ColumnRuleApi[]>([]);
  const [katLoaded, setKatLoaded] = useState(false);
  const [katLoading, setKatLoading] = useState(false);
  const [katSaving, setKatSaving] = useState(false);
  const [katSearch, setKatSearch] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catDraft, setCatDraft] = useState<{ column: string; amount_field: "debit" | "kredit" } | null>(null);

  const reloadKat = useCallback(async () => {
    setKatLoading(true);
    try {
      const r = await apiJSON<{ categories: KategoriApi[]; columnRules?: ColumnRuleApi[] }>("/api/finance/config");
      setCategories((r as any).categories ?? []);
      setColumnRules((r as any).columnRules ?? []);
      setKatLoaded(true);
    } catch (e) { showMsg("error", (e as Error).message); }
    finally { setKatLoading(false); }
  }, [showMsg]);

  useEffect(() => {
    if (open && tab === "kategori" && !katLoaded) void reloadKat();
  }, [open, tab, katLoaded, reloadKat]);

  const filteredCats = useMemo(() => {
    const q = katSearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.display_name.toLowerCase().includes(q) || c.category_code.toLowerCase().includes(q));
  }, [categories, katSearch]);

  const accumulatorCols = useMemo(
    () => columnRules.filter((r) => r.rule_type === "accumulator").map((r) => ({ value: r.column_name, label: r.display_name })),
    [columnRules]
  );

  async function katMutate(payload: Record<string, unknown>) {
    setKatSaving(true);
    try {
      await apiJSON("/api/finance/config/manage", { method: "POST", body: JSON.stringify(payload) });
      await reloadKat();
      onCategoriesChanged?.();
      if (payload.action === "update_category_contributions") onRecalcTriggered?.();
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

  // ── Rumus state ────────────────────────────────────────────────────────────
  const [formulas, setFormulas] = useState<FormulaApi[]>([]);
  const [partners, setPartners] = useState<PartnerApi[]>([]);
  const [rumusLoaded, setRumusLoaded] = useState(false);
  const [rumusSaving, setRunusSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);

  const reloadRumus = useCallback(async () => {
    try {
      const [fRes, pRes] = await Promise.all([
        apiJSON<{ formulas: FormulaApi[] }>("/api/cashbook-formula"),
        apiJSON<{ partners: PartnerApi[] }>("/api/cashbook-partner"),
      ]);
      setFormulas(fRes.formulas);
      setPartners(pRes.partners);
      setRumusLoaded(true);
    } catch (e) { showMsg("error", (e as Error).message); }
  }, [showMsg]);

  useEffect(() => {
    if (open && (tab === "rumus" || tab === "uji-coba") && !rumusLoaded) void reloadRumus();
  }, [open, tab, rumusLoaded, reloadRumus]);

  const editingFormula = useMemo(() => formulas.find((f) => f.id === editingFormulaId) ?? null, [formulas, editingFormulaId]);
  const outputColumns = useMemo(() => formulas.map((f) => f.column), [formulas]);

  async function saveFormula(ast: ASTNode) {
    if (!editingFormula) return;
    setRunusSaving(true);
    try {
      await apiJSON("/api/cashbook-formula", { method: "POST", body: JSON.stringify({ action: "upsert", formula: { ...editingFormula, ast } }) });
      await reloadRumus();
      setEditingFormulaId(null);
    } catch (e) { alert(`Gagal menyimpan: ${(e as Error).message}`); }
    finally { setRunusSaving(false); }
  }

  async function toggleFormula(f: FormulaApi) {
    setRunusSaving(true);
    try { await apiJSON("/api/cashbook-formula", { method: "POST", body: JSON.stringify({ action: "upsert", formula: { ...f, enabled: !f.enabled } }) }); await reloadRumus(); }
    finally { setRunusSaving(false); }
  }

  async function deleteFormula(f: FormulaApi) {
    if (!window.confirm(`Hapus rumus "${f.name}"?`)) return;
    setRunusSaving(true);
    try { await apiJSON("/api/cashbook-formula", { method: "POST", body: JSON.stringify({ action: "delete", id: f.id }) }); await reloadRumus(); if (editingFormulaId === f.id) setEditingFormulaId(null); }
    catch (e) { alert(`Gagal menghapus: ${(e as Error).message}`); }
    finally { setRunusSaving(false); }
  }

  async function resetFormulas() {
    if (!window.confirm("Kembalikan semua rumus ke bawaan? Perubahan kustom akan hilang.")) return;
    setResetting(true);
    try { await apiJSON("/api/cashbook-formula", { method: "POST", body: JSON.stringify({ action: "reset" }) }); await reloadRumus(); setEditingFormulaId(null); }
    catch (e) { alert(`Gagal reset: ${(e as Error).message}`); }
    finally { setResetting(false); }
  }

  async function newFormula() {
    const used = new Set(formulas.map((f) => f.column.toUpperCase()));
    const newLetter = "PQRSTUVWXYZ".split("").find((c) => !used.has(c)) ?? "X";
    const name = window.prompt("Nama rumus baru?", `Rumus ${newLetter}`);
    if (!name) return;
    const dbCol = window.prompt("Kolom DB di tabel keuangan (mis. omzet, kasbon_x):", `kolom_${newLetter.toLowerCase()}`);
    if (!dbCol) return;
    setRunusSaving(true);
    try {
      const cr = await apiJSON<{ formula: FormulaApi }>("/api/cashbook-formula", { method: "POST", body: JSON.stringify({ action: "upsert", formula: { name, column: newLetter, dbColumn: dbCol, ast: { type: "literal", value: 0 }, enabled: true, isSystem: false, displayOrder: formulas.length * 10 + 10 } }) });
      await reloadRumus();
      setEditingFormulaId(cr.formula.id);
    } catch (e) { alert(`Gagal membuat rumus: ${(e as Error).message}`); }
    finally { setRunusSaving(false); }
  }

  // ── Uji coba state ─────────────────────────────────────────────────────────
  const [testRows, setTestRows] = useState("OMZET\t1000000\t0\tPenjualan Cahaya\nBIAYA\t0\t150000\tListrik\nSUPPLY\t0\t200000\tTinta");
  const [testOutputs, setTestOutputs] = useState<Array<Record<string, number | string | boolean>> | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  async function runTest() {
    setTestError(null);
    setTestOutputs(null);
    const rows: Array<{ C: string; D: number; E: number; F: string }> = [];
    for (const line of testRows.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const p = t.split(/\t|,/);
      rows.push({ C: (p[0] ?? "").trim(), D: Number(p[1] ?? 0) || 0, E: Number(p[2] ?? 0) || 0, F: (p[3] ?? "").trim() });
    }
    try {
      const r = await apiJSON<{ outputs: Array<Record<string, number | string | boolean>> }>("/api/evaluate", { method: "POST", body: JSON.stringify({ rows }) });
      setTestOutputs(r.outputs);
    } catch (e) { setTestError((e as Error).message); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const TABS: Array<{ id: PengaturanTab; label: string }> = [
    { id: "orang", label: "Orang" },
    { id: "kategori", label: "Kategori" },
    { id: "rumus", label: "Rumus" },
    { id: "uji-coba", label: "Uji coba" },
  ];

  return (
    <>
      {pendingConfirm && (
        <ConfirmDialog
          show
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmText={pendingConfirm.confirmText}
          type={pendingConfirm.type}
          onConfirm={() => { const h = pendingConfirm.onConfirm; setPendingConfirm(null); void h(); }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {/* Inner form modal for Orang tab (z-[60] so it appears above PengaturanModal z-50) */}
      <ModalFormShell
        open={formOpen}
        onClose={() => setFormOpen(false)}
        maxWidthClass="max-w-2xl"
        zIndexClass="z-[60]"
        header={
          <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-4">
            <h3 className="text-lg font-bold text-white">{editingActorId ? "Edit Orang" : "Tambah Orang"}</h3>
            <p className="text-blue-100 text-xs mt-1">Jabatan hanya label. Centang rumus yang berlaku untuk orang ini.</p>
          </div>
        }
        footer={
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-1.5 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-100">Batal</button>
            <button type="button" onClick={submitOrang} disabled={orangSaving} className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {orangSaving ? "Menyimpan…" : editingActorId ? "Simpan perubahan" : "Tambah orang"}
            </button>
          </div>
        }
      >
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nama</label>
              <input type="text" value={orangForm.display_name} onChange={(e) => setF("display_name", e.target.value)} placeholder="Mis. Andi" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Jabatan</label>
              <select value={orangForm.role_code} onChange={(e) => setF("role_code", e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white">
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

          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 space-y-1">
            <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Rumus yang akan dibuat</p>
            {orangPreview.map((l) => <p key={l} className="text-xs text-blue-800">{l}</p>)}
          </div>

          {/* Bagi Hasil */}
          <div className={`rounded-lg border-2 p-4 transition-colors ${orangForm.enable_profit_share ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={orangForm.enable_profit_share} onChange={(e) => setF("enable_profit_share", e.target.checked)} className="w-4 h-4 accent-amber-500" />
              <span className="text-sm font-semibold text-slate-700">Bagi Hasil</span>
              <span className="text-xs text-slate-400">persentase dari laba bersih</span>
            </label>
            {orangForm.enable_profit_share && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Persentase (%)</label>
                <input type="number" min="0" max="100" step="0.01" value={orangForm.profit_share_percent} onChange={(e) => setF("profit_share_percent", e.target.value)} placeholder="Mis. 40" className="w-40 px-3 py-2 text-sm border border-slate-300 rounded-md" />
              </div>
            )}
          </div>

          {/* Kasbon */}
          <div className={`rounded-lg border-2 p-4 transition-colors ${orangForm.enable_cash_advance ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={orangForm.enable_cash_advance} onChange={(e) => setF("enable_cash_advance", e.target.checked)} className="w-4 h-4 accent-violet-500" />
              <span className="text-sm font-semibold text-slate-700">Kasbon</span>
              <span className="text-xs text-slate-400">akumulasi dari kategori transaksi tertentu</span>
            </label>
            {orangForm.enable_cash_advance && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Kategori transaksi untuk kasbon</label>
                  {finCats.length === 0 ? (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">Daftar kategori belum dimuat. Buka tab Kategori untuk menambah kategori.</p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto rounded-md border border-violet-200 bg-white divide-y divide-violet-50">
                      {finCats.map((cat) => {
                        const code = cat.category_code.toUpperCase();
                        const checked = orangForm.kasbon_category_codes.includes(code);
                        return (
                          <label key={code} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-violet-50/80 ${checked ? "bg-violet-50" : ""}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleKasbonCat(code)} className="w-4 h-4 accent-violet-600 shrink-0" />
                            <span className="font-mono text-xs font-semibold text-violet-900">{code}</span>
                            <span className="text-xs text-slate-600 truncate">{cat.display_name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Keperluan harus mengandung (opsional)</label>
                  <input type="text" value={orangForm.keperluan_keyword} onChange={(e) => setF("keperluan_keyword", e.target.value)} placeholder="Kata kunci untuk membedakan jika ada 2 orang di kategori yang sama" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                </div>
              </div>
            )}
          </div>

          {/* Bonus */}
          <div className={`rounded-lg border-2 p-4 transition-colors ${orangForm.enable_bonus ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={orangForm.enable_bonus} onChange={(e) => setF("enable_bonus", e.target.checked)} className="w-4 h-4 accent-emerald-500" />
              <span className="text-sm font-semibold text-slate-700">Bonus</span>
              <span className="text-xs text-slate-400">persentase dari omzet / laba / rumus lain</span>
            </label>
            {orangForm.enable_bonus && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Persentase (%)</label>
                  <input type="number" min="0" max="100" step="0.01" value={orangForm.bonus_percent} onChange={(e) => setF("bonus_percent", e.target.value)} placeholder="Mis. 5" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Dari rumus</label>
                  <select value={orangForm.bonus_source_formula_key} onChange={(e) => setF("bonus_source_formula_key", e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white">
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
            <label className="block text-xs font-semibold text-slate-600 mb-1">Catatan (opsional)</label>
            <textarea value={orangForm.notes} onChange={(e) => setF("notes", e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md" placeholder="Catatan internal — tidak muncul di rumus" />
          </div>
        </div>
      </ModalFormShell>

      {/* ── Main Pengaturan Modal ─────────────────────────────────────────── */}
      <ModalFormShell
        open={open}
        onClose={onClose}
        maxWidthClass="max-w-5xl"
        header={
          <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-6 py-4 border-b border-slate-800">
            <h3 className="text-xl font-bold text-white">Pengaturan Keuangan</h3>
            <p className="text-slate-300 text-sm mt-1">Kelola orang, kategori transaksi, dan rumus kalkulasi buku kas.</p>
          </div>
        }
        footer={
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              {tab === "orang" && `${actors.filter((a) => a.is_active === 1).length} orang aktif`}
              {tab === "kategori" && `${categories.length} kategori`}
              {tab === "rumus" && `${formulas.length} rumus`}
            </div>
            <div className="flex items-center gap-2">
              {tab === "rumus" && (
                <button type="button" onClick={resetFormulas} disabled={resetting} className="px-3 py-1.5 text-xs rounded border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50">
                  {resetting ? "Mereset…" : "Kembalikan ke bawaan"}
                </button>
              )}
              <button type="button" onClick={onClose} className="px-4 py-1.5 text-sm rounded bg-slate-700 text-white hover:bg-slate-800">Tutup</button>
            </div>
          </div>
        }
      >
        {/* Tab navigation */}
        <div className="flex border-b border-slate-200 bg-white sticky top-0 z-10">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setEditingFormulaId(null); }}
              className={`px-5 py-3 text-sm border-b-2 transition-colors ${
                tab === t.id
                  ? "border-slate-700 text-slate-900 font-semibold bg-slate-50"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <InlineNotice notice={notice} />

        {/* ── Tab: Orang ──────────────────────────────────────────────────── */}
        {tab === "orang" && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <input type="text" value={orangSearch} onChange={(e) => setOrangSearch(e.target.value)} placeholder="Cari nama / jabatan…" className="px-3 py-1.5 text-sm border border-slate-300 rounded-md w-52" />
                <label className="text-xs text-slate-600 flex items-center gap-2 select-none cursor-pointer">
                  <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                  Tampilkan nonaktif
                </label>
              </div>
              <button type="button" onClick={() => { setEditingActorId(null); setOrangForm({ ...EMPTY_ORANG, role_code: roles[0]?.role_code ?? "" }); setFormOpen(true); }} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold">
                + Tambah Orang
              </button>
            </div>

            {orangLoading && <div className="py-10 text-center text-slate-500 text-sm">Memuat data…</div>}

            {!orangLoading && filteredActors.length === 0 && (
              <div className="py-12 text-center text-slate-500 text-sm space-y-2">
                <p>Belum ada orang. Tekan <strong>+ Tambah Orang</strong> untuk mulai.</p>
                <p className="text-xs text-slate-400">Bar Bagi Hasil / Kasbon / Bonus muncul otomatis begitu ada orang aktif.</p>
              </div>
            )}

            {!orangLoading && filteredActors.length > 0 && (
              <div className="space-y-4">
                {GROUP_ORDER.map((group) => {
                  const list = groupedActors[group];
                  if (!list?.length) return null;
                  return (
                    <section key={group}>
                      <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">{ROLE_GROUP_LABEL[group]} ({list.length})</h3>
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
                              const lines = describeActor(a);
                              return (
                                <tr key={a.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-medium text-slate-800">
                                    {a.display_name}
                                    {a.notes && <div className="text-[11px] text-slate-400 mt-0.5">{a.notes}</div>}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className="inline-block px-2 py-0.5 text-[11px] rounded-full border bg-slate-100 text-slate-700 border-slate-300">{role?.role_label ?? a.role_code}</span>
                                  </td>
                                  <td className="px-3 py-2 text-xs text-slate-600">
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
                                  <td className="px-3 py-2 text-center">
                                    {a.is_active === 1
                                      ? <span className="text-xs text-emerald-700">Aktif</span>
                                      : <span className="text-xs text-slate-400">Nonaktif</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right space-x-1">
                                    <button type="button" onClick={() => { setEditingActorId(a.id); setOrangForm(actorToForm(a)); setFormOpen(true); }} className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50">Edit</button>
                                    {a.is_active === 1
                                      ? <button type="button" onClick={() => handleDeactivate(a)} className="px-2 py-1 text-xs rounded border border-amber-300 text-amber-700 hover:bg-amber-50">Nonaktifkan</button>
                                      : <button type="button" onClick={() => handleReactivate(a)} className="px-2 py-1 text-xs rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50">Aktifkan</button>}
                                    <button type="button" onClick={() => handleDeleteActor(a)} className="px-2 py-1 text-xs rounded border border-rose-300 text-rose-700 hover:bg-rose-50">Hapus</button>
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
        )}

        {/* ── Tab: Kategori ───────────────────────────────────────────────── */}
        {tab === "kategori" && (
          <div className="p-4 space-y-4">
            {/* Add form */}
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Tambah kategori baru</p>
              <p className="text-xs text-slate-500 mb-3">Kategori muncul saat mencatat transaksi. Pakai kata yang dikenal seluruh staf.</p>
              <div className="flex gap-2 max-w-lg">
                <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addCategory(); }} placeholder="Contoh: Bonus lebaran" className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                <button type="button" disabled={katSaving || !newCatName.trim()} onClick={addCategory} className="px-4 py-2 bg-slate-700 text-white text-sm rounded-lg disabled:opacity-50">Tambah</button>
              </div>
            </div>

            {/* Search */}
            <input type="search" value={katSearch} onChange={(e) => setKatSearch(e.target.value)} placeholder="Cari kategori…" className="px-3 py-1.5 text-sm border border-slate-300 rounded-md w-56" />

            {/* List */}
            {katLoading && <div className="py-8 text-center text-slate-500 text-sm">Memuat…</div>}
            {!katLoading && (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {filteredCats.length === 0 && (
                  <p className="py-8 text-center text-slate-500 text-sm">{categories.length === 0 ? "Belum ada kategori." : "Tidak ada yang cocok."}</p>
                )}
                {filteredCats.map((cat) => {
                  const isExpanded = editingCatId === (cat.id || cat.category_code);
                  type ContribEntry = { column: string; amount_field: "debit" | "kredit" };
                  let currentContrib: ContribEntry | null = null;
                  try {
                    const raw = typeof cat.metric_contributions === "string" ? JSON.parse(cat.metric_contributions) : cat.metric_contributions;
                    if (Array.isArray(raw) && raw.length > 0) currentContrib = raw[0] as ContribEntry;
                  } catch { /* ignore */ }

                  return (
                    <div key={cat.id || cat.category_code} className="rounded-lg border border-slate-200 overflow-hidden">
                      <div className="flex items-center justify-between gap-2 text-sm bg-white p-3">
                        <span className="font-medium text-slate-800 truncate min-w-0">
                          <span className="font-mono text-xs text-slate-400 mr-2">{cat.category_code}</span>
                          {cat.display_name}
                          {currentContrib && (() => {
                            const cc = currentContrib as ContribEntry;
                            return (
                              <span className="ml-2 text-xs text-slate-500 font-normal">
                                → {accumulatorCols.find((c) => c.value === cc.column)?.label ?? cc.column} ({cc.amount_field})
                              </span>
                            );
                          })()}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button type="button" onClick={() => {
                            if (isExpanded) { setEditingCatId(null); }
                            else { setEditingCatId(cat.id || cat.category_code); setCatDraft(currentContrib ?? { column: accumulatorCols[0]?.value ?? "omzet", amount_field: "debit" }); }
                          }} className="text-slate-600 hover:text-slate-800 text-xs border border-slate-300 rounded px-2 py-1">
                            {isExpanded ? "Tutup" : "Edit Kalkulasi"}
                          </button>
                          {cat.id && (
                            <button type="button" disabled={katSaving} onClick={() => setPendingConfirm({ title: `Hapus kategori "${cat.display_name}"?`, message: "Transaksi yang sudah ada tetap tersimpan dengan kode lama.", confirmText: "Hapus", type: "danger", onConfirm: () => void katMutate({ action: "delete_category", id: cat.id }) })} className="text-rose-600 hover:text-rose-800 text-sm">Hapus</button>
                          )}
                        </div>
                      </div>
                      {isExpanded && cat.id && (
                        <div className="bg-blue-50 border-t border-blue-100 p-3 space-y-3">
                          <p className="text-xs text-blue-800 font-medium">Ketika kategori <strong>{cat.display_name}</strong> dipakai, nilai apa yang ditambahkan ke metrik mana?</p>
                          <div className="flex flex-wrap gap-3 items-end">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-600">Tambahkan ke metrik</label>
                              <select value={catDraft?.column ?? ""} onChange={(e) => setCatDraft((p) => p ? { ...p, column: e.target.value } : { column: e.target.value, amount_field: "debit" })} className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white">
                                <option value="">— Tidak ada —</option>
                                {accumulatorCols.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                            </div>
                            {catDraft?.column && (
                              <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-600">Menggunakan nilai</label>
                                <select value={catDraft?.amount_field ?? "debit"} onChange={(e) => setCatDraft((p) => p ? { ...p, amount_field: e.target.value as "debit" | "kredit" } : null)} className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white">
                                  <option value="debit">Debit (uang masuk)</option>
                                  <option value="kredit">Kredit (uang keluar)</option>
                                </select>
                              </div>
                            )}
                            <button type="button" disabled={katSaving} onClick={async () => { const contributions = catDraft?.column ? [{ column: catDraft.column, amount_field: catDraft.amount_field, sign: 1 }] : []; await katMutate({ action: "update_category_contributions", category_id: cat.id, contributions }); setEditingCatId(null); }} className="px-3 py-1.5 bg-slate-700 text-white text-sm rounded-lg disabled:opacity-50">Simpan</button>
                            <button type="button" onClick={() => setEditingCatId(null)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Batal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Rumus ──────────────────────────────────────────────────── */}
        {tab === "rumus" && (
          <div className="p-4 space-y-3">
            {!editingFormula ? (
              <>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-700">Daftar rumus perhitungan</h4>
                  <button type="button" onClick={newFormula} className="px-3 py-1.5 text-xs rounded border border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100">+ Tambah rumus</button>
                </div>
                <div className="overflow-hidden rounded border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2 text-left">Nama</th>
                        <th className="px-3 py-2 text-left">Kolom DB</th>
                        <th className="px-3 py-2 text-left">Ringkasan</th>
                        <th className="px-3 py-2 text-center">Aktif</th>
                        <th className="px-3 py-2 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {formulas.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{f.name}</td>
                          <td className="px-3 py-2 text-slate-500 text-xs font-mono">{f.dbColumn}</td>
                          <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-[28ch]">{astToText(f.ast)}</td>
                          <td className="px-3 py-2 text-center"><input type="checkbox" checked={f.enabled} onChange={() => toggleFormula(f)} /></td>
                          <td className="px-3 py-2 text-right space-x-1">
                            <button type="button" onClick={() => setEditingFormulaId(f.id)} className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50">Edit</button>
                            <button type="button" onClick={() => deleteFormula(f)} className="px-2 py-1 text-xs rounded border border-rose-300 text-rose-700 hover:bg-rose-50">Hapus</button>
                          </td>
                        </tr>
                      ))}
                      {formulas.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500 text-sm">Belum ada rumus. Tekan &quot;Kembalikan ke bawaan&quot; untuk memuat default.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-sm text-slate-500">Mengedit</div>
                    <h4 className="text-lg font-semibold text-slate-800">{editingFormula.name}</h4>
                    <p className="text-xs text-slate-500">Kolom DB: <span className="font-mono">{editingFormula.dbColumn}</span></p>
                  </div>
                  <button type="button" onClick={() => setEditingFormulaId(null)} className="px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-100">← Kembali ke daftar</button>
                </div>
                <div className="h-[600px] border border-slate-200 rounded overflow-hidden">
                  <FormulaEditor
                    key={editingFormula.id}
                    initialAst={editingFormula.ast}
                    partners={partners}
                    outputColumns={outputColumns}
                    onSave={saveFormula}
                    saving={rumusSaving}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Uji coba ───────────────────────────────────────────────── */}
        {tab === "uji-coba" && (
          <div className="p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-700">Uji coba rumus</h4>
            <p className="text-xs text-slate-500">Format: <code>C TAB D TAB E TAB F</code> (atau koma). Setiap baris = satu transaksi.</p>
            <textarea className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-mono h-40" value={testRows} onChange={(e) => setTestRows(e.target.value)} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={runTest} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Jalankan</button>
              {testError && <span className="text-xs text-rose-600">{testError}</span>}
            </div>
            {testOutputs && (
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="text-xs min-w-full">
                  <thead className="bg-slate-100 text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="px-2 py-1 text-left">#</th>
                      {formulas.map((f) => <th key={f.column} className="px-2 py-1 text-right">{f.name}</th>)}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {testOutputs.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1 text-slate-500">{idx + 1}</td>
                        {formulas.map((f) => {
                          const v = row[f.column];
                          return <td key={f.column} className="px-2 py-1 text-right font-mono">{typeof v === "number" ? v.toLocaleString("id-ID") : String(v ?? "")}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </ModalFormShell>
    </>
  );
}
