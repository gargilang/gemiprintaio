"use client";

/**
 * PengaturanKeuanganModal — satu modal untuk semua pengaturan keuangan.
 * Tab: Orang | Kategori | Rumus | Uji coba
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExpressionAssistant from "@/components/finance/ExpressionAssistant";
import KolomTab from "@/components/finance/KolomTab";
import { astToDsl, DEFAULT_INPUT_COLUMNS } from "@/lib/ast";
import { DEFAULT_FORMULAS } from "@/lib/ast/defaults";
import type { ASTNode, FormulaGroup } from "@/lib/ast/types";

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
    // Strip DSL syntax characters so user doesn't accidentally embed
    // [brackets], "quotes", or 'apostrophes' in a category code.
    .replace(/[\[\]"']/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, maxLen);
  return base || `KAT${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type PengaturanTab = "kolom" | "kategori" | "pengurus";

export interface PengaturanKeuanganModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: PengaturanTab;
  /** Called when categories change — parent should refresh its category list */
  onCategoriesChanged?: () => void;
  /** Called when actors are created/updated/deleted — refresh ringkasan per orang */
  onActorsChanged?: () => void;
  /** Called when a change triggers cashbook recalculation */
  onRecalcTriggered?: () => void;
}

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
}

// ── Rumus types ─────────────────────────────────────────────────────────────

interface FormulaApi {
  id: string;
  name: string;
  column: string;
  dbColumn: string;
  formulaKey?: string | null;
  actorId?: string | null;
  formulaGroup?: FormulaGroup;
  isVisibleInSummary?: boolean;
  ast: ASTNode;
  enabled: boolean;
  isSystem: boolean;
  displayOrder: number;
  description?: string | null;
}

const FORMULA_GROUP_LABEL: Record<FormulaGroup, string> = {
  summary: "Ringkasan",
  profit_share: "Bagi Hasil",
  cash_advance: "Kasbon",
  bonus: "Bonus",
  custom: "Kustom",
};

const FORMULA_GROUP_ORDER: FormulaGroup[] = [
  "summary",
  "profit_share",
  "cash_advance",
  "bonus",
  "custom",
];

const FORMULA_GROUP_DESCRIPTION: Record<FormulaGroup, string> = {
  summary: "Rumus sistem (Omzet, Saldo, dll). Hanya isinya yang bisa diedit.",
  profit_share: "Otomatis dari tab Orang. Persentase dari laba bersih.",
  cash_advance: "Otomatis dari tab Orang. Akumulasi kategori transaksi.",
  bonus: "Otomatis dari tab Orang. Persentase dari rumus lain.",
  custom: "Rumus tambahan yang Anda buat sendiri.",
};

function slugifyFormulaKey(name: string): string {
  return (
    name
      // Strip DSL syntax characters so user doesn't accidentally embed
      // [brackets], "quotes", or 'apostrophes' in a formula key.
      .replace(/[\[\]"']/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `rumus_${Date.now().toString(36)}`
  );
}

// ── Inline notice ───────────────────────────────────────────────────────────

interface Notice { type: "success" | "error"; message: string; }

function InlineNotice({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <div className={`mx-4 mt-3 px-3 py-2 rounded text-sm ${
      notice.type === "success"
        ? "bg-emerald-50 dark:bg-slate-800 border border-emerald-300 text-emerald-800 dark:text-emerald-200"
        : "bg-rose-50 border border-rose-300 text-rose-800"
    }`}>
      {notice.message}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════

// ── Quick-add category button ────────────────────────────────────────────────

/**
 * Inline mini-form to add a new category without leaving the Tambah Pengurus
 * form. Shows a small "+" button; clicking it expands an inline input.
 */
function QuickAddCategoryButton({
  onAdded,
}: {
  onAdded: (code: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function slugifyCode(n: string): string {
    return n
      .trim()
      // Strip DSL syntax characters
      .replace(/[\[\]"']/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toUpperCase()
      .slice(0, 24) || `KAT${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }

  async function submit() {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    setErr(null);
    try {
      const code = slugifyCode(n);
      await apiJSON("/api/finance/config/manage", {
        method: "POST",
        body: JSON.stringify({ action: "create_category", category_code: code, display_name: n }),
      });
      await onAdded(code);
      setName("");
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-violet-700 hover:text-violet-900 font-semibold flex items-center gap-0.5"
        title="Tambah kategori baru"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Tambah kategori
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); if (e.key === "Escape") setOpen(false); }}
        placeholder="Nama kategori baru"
        className="px-2 py-1 text-xs border border-violet-300 rounded-md w-40"
      />
      {name.trim() && (
        <span className="text-[10px] text-slate-400 font-mono">
          → &quot;{slugifyCode(name)}&quot;
        </span>
      )}
      <button
        type="button"
        disabled={saving || !name.trim()}
        onClick={submit}
        className="px-2 py-1 text-[11px] rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {saving ? "…" : "Tambah"}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setName(""); setErr(null); }}
        className="px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
      >
        Batal
      </button>
      {err && <span className="text-[11px] text-rose-600">{err}</span>}
    </div>
  );
}

export default function PengaturanKeuanganModal({
  open, onClose, defaultTab = "kolom",
  onCategoriesChanged, onActorsChanged, onRecalcTriggered,
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
    } else {
      // Reset loaded flags when modal closes so next open re-fetches fresh data.
      setRumusLoaded(false);
      setKatLoaded(false);
      setOrangLoaded(false);
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
    if (open && !orangLoaded) {
      void reloadOrang();
      apiJSON<{ categories: FinanceCatOption[] }>("/api/finance/categories")
        .then((r) => setFinCats(r.categories ?? []))
        .catch(() => {});
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
    if (
      !orangForm.enable_profit_share &&
      !orangForm.enable_cash_advance &&
      !orangForm.enable_bonus
    ) {
      showMsg(
        "error",
        "Centang minimal satu rumus (Bagi Hasil, Kasbon, atau Bonus) supaya pengurus muncul di Ringkasan."
      );
      return;
    }
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
      // Reload formulas too — syncFormulasForActor just created/updated
      // formula rows in cashbook_formula. Without this, the Kolom tab
      // keeps showing stale data until the user closes and reopens the modal.
      void reloadRumus();
      onActorsChanged?.();
      onRecalcTriggered?.();
    } catch (e) { showMsg("error", (e as Error).message); }
    finally { setOrangSaving(false); }
  }

  function handleDeactivate(a: BusinessActorApi) {
    setPendingConfirm({ title: `Nonaktifkan ${a.display_name}?`, message: "Data historis tetap tersimpan. Rumus terkait akan dimatikan.", confirmText: "Nonaktifkan", type: "warning",
      onConfirm: async () => { try { await apiJSON("/api/business-actors", { method: "POST", body: JSON.stringify({ action: "deactivate", id: a.id }) }); showMsg("success", `${a.display_name} dinonaktifkan.`); await reloadOrang(); void reloadRumus(); onActorsChanged?.(); } catch (e) { showMsg("error", (e as Error).message); } },
    });
  }

  function handleReactivate(a: BusinessActorApi) {
    setPendingConfirm({ title: `Aktifkan kembali ${a.display_name}?`, message: "Rumus terkait akan dihidupkan kembali.", confirmText: "Aktifkan", type: "info",
      onConfirm: async () => { try { await apiJSON("/api/business-actors", { method: "POST", body: JSON.stringify({ action: "reactivate", id: a.id }) }); showMsg("success", `${a.display_name} diaktifkan.`); await reloadOrang(); void reloadRumus(); onActorsChanged?.(); onRecalcTriggered?.(); } catch (e) { showMsg("error", (e as Error).message); } },
    });
  }

  function handleDeleteActor(a: BusinessActorApi) {
    setPendingConfirm({ title: `Hapus permanen ${a.display_name}?`, message: "Tidak bisa dibatalkan. Jika ada transaksi terkait, sistem akan menolak.", confirmText: "Hapus permanen", type: "danger",
      onConfirm: async () => { try { await apiJSON("/api/business-actors", { method: "POST", body: JSON.stringify({ action: "delete", id: a.id }) }); showMsg("success", `${a.display_name} dihapus.`); await reloadOrang(); void reloadRumus(); onActorsChanged?.(); } catch (e) { showMsg("error", (e as Error).message); } },
    });
  }

  // ── Kategori state ─────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<KategoriApi[]>([]);
  const [katLoaded, setKatLoaded] = useState(false);
  const [katLoading, setKatLoading] = useState(false);
  const [katSaving, setKatSaving] = useState(false);
  const [katSearch, setKatSearch] = useState("");
  const [newCatName, setNewCatName] = useState("");

  const reloadKat = useCallback(async () => {
    setKatLoading(true);
    try {
      const r = await apiJSON<{ categories: KategoriApi[] }>("/api/finance/config");
      setCategories(r.categories ?? []);
      setKatLoaded(true);
    } catch (e) { showMsg("error", (e as Error).message); }
    finally { setKatLoading(false); }
  }, [showMsg]);

  useEffect(() => {
    if (open && !katLoaded) void reloadKat();
  }, [open, katLoaded, reloadKat]);

  const filteredCats = useMemo(() => {
    const q = katSearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.display_name.toLowerCase().includes(q) || c.category_code.toLowerCase().includes(q));
  }, [categories, katSearch]);

  async function katMutate(payload: Record<string, unknown>) {
    setKatSaving(true);
    try {
      await apiJSON("/api/finance/config/manage", { method: "POST", body: JSON.stringify(payload) });
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

  // ── Rumus state ────────────────────────────────────────────────────────────
  const [formulas, setFormulas] = useState<FormulaApi[]>([]);
  const [rumusLoaded, setRumusLoaded] = useState(false);
  const [rumusSaving, setRunusSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [newFormulaDraft, setNewFormulaDraft] = useState<{
    name: string;
    formulaGroup: FormulaGroup;
  } | null>(null);

  const reloadRumus = useCallback(async () => {
    try {
      const fRes = await apiJSON<{ formulas: FormulaApi[] }>(
        "/api/cashbook-formula"
      );
      setFormulas(fRes.formulas);
      setRumusLoaded(true);
    } catch (e) {
      showMsg("error", (e as Error).message);
    }
  }, [showMsg]);

  useEffect(() => {
    if (open && !rumusLoaded) void reloadRumus();
  }, [open, rumusLoaded, reloadRumus]);

  const editingFormula = useMemo(
    () => formulas.find((f) => f.id === editingFormulaId) ?? null,
    [formulas, editingFormulaId]
  );

  /** Build a quick map of letter → semantic key so legacy ASTs round-trip cleanly. */
  const formulaKeyByLetter = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of formulas) {
      const key = f.formulaKey || f.dbColumn || f.column;
      if (key) {
        m[f.column] = key;
        m[key] = key;
      }
    }
    return m;
  }, [formulas]);

  /** Render a one-line DSL summary used in the formula list rows. */
  function formulaPreview(f: FormulaApi): string {
    try {
      const { normalizeAstColumns } = require("@/lib/ast/normalize") as typeof import("@/lib/ast/normalize");
      const normalised = normalizeAstColumns(f.ast, formulaKeyByLetter);
      return astToDsl(normalised, {
        inputColumns: DEFAULT_INPUT_COLUMNS,
        formulaKeys: Object.values(formulaKeyByLetter),
      });
    } catch {
      return "";
    }
  }

  /** Group formulas by formulaGroup, ordered for display. */
  const formulasByGroup = useMemo(() => {
    const out: Record<FormulaGroup, FormulaApi[]> = {
      summary: [],
      profit_share: [],
      cash_advance: [],
      bonus: [],
      custom: [],
    };
    for (const f of formulas) {
      const g = (f.formulaGroup ?? "custom") as FormulaGroup;
      out[g] = out[g] ?? [];
      out[g].push(f);
    }
    for (const g of FORMULA_GROUP_ORDER) {
      out[g].sort((a, b) => a.displayOrder - b.displayOrder);
    }
    return out;
  }, [formulas]);

  async function saveFormula(ast: ASTNode) {
    if (!editingFormula) return;
    setRunusSaving(true);
    try {
      await apiJSON("/api/cashbook-formula", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert",
          formula: { ...editingFormula, ast },
        }),
      });
      await reloadRumus();
      setEditingFormulaId(null);
      onRecalcTriggered?.();
      showMsg("success", `Rumus "${editingFormula.name}" disimpan.`);
    } catch (e) {
      showMsg("error", `Gagal menyimpan: ${(e as Error).message}`);
    } finally {
      setRunusSaving(false);
    }
  }

  async function toggleFormula(f: FormulaApi) {
    setRunusSaving(true);
    try { await apiJSON("/api/cashbook-formula", { method: "POST", body: JSON.stringify({ action: "upsert", formula: { ...f, enabled: !f.enabled } }) }); await reloadRumus(); }
    finally { setRunusSaving(false); }
  }

  async function toggleVisibleInSummary(f: FormulaApi) {
    setRunusSaving(true);
    try {
      await apiJSON("/api/cashbook-formula", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert",
          formula: {
            ...f,
            isVisibleInSummary: !(f.isVisibleInSummary ?? false),
          },
        }),
      });
      await reloadRumus();
    } finally {
      setRunusSaving(false);
    }
  }

  async function deleteFormula(f: FormulaApi) {
    setPendingConfirm({
      title: `Hapus rumus "${f.name}"?`,
      message: f.isSystem
        ? "Rumus sistem akan kembali ke definisi bawaan saat reset."
        : "Aksi ini tidak bisa dibatalkan.",
      confirmText: "Hapus",
      type: "danger",
      onConfirm: async () => {
        setRunusSaving(true);
        try {
          await apiJSON("/api/cashbook-formula", {
            method: "POST",
            body: JSON.stringify({ action: "delete", id: f.id }),
          });
          await reloadRumus();
          if (editingFormulaId === f.id) setEditingFormulaId(null);
          showMsg("success", "Rumus dihapus.");
          onRecalcTriggered?.();
        } catch (e) {
          showMsg("error", `Gagal menghapus: ${(e as Error).message}`);
        } finally {
          setRunusSaving(false);
        }
      },
    });
  }

  async function resetFormulas() {
    setPendingConfirm({
      title: "Kembalikan ke bawaan?",
      message: "Semua rumus diganti dengan default sistem. Perubahan kustom akan hilang.",
      confirmText: "Kembalikan",
      type: "warning",
      onConfirm: async () => {
        setResetting(true);
        try {
          await apiJSON("/api/cashbook-formula", {
            method: "POST",
            body: JSON.stringify({ action: "reset" }),
          });
          await reloadRumus();
          setEditingFormulaId(null);
          onRecalcTriggered?.();
          showMsg("success", "Rumus dikembalikan ke bawaan.");
        } catch (e) {
          showMsg("error", `Gagal reset: ${(e as Error).message}`);
        } finally {
          setResetting(false);
        }
      },
    });
  }

  /** Submit the "+ Tambah rumus" form: creates a placeholder formula then opens the assistant. */
  async function createCustomFormula(input: { name: string; formulaGroup: FormulaGroup }) {
    const name = input.name.trim();
    if (!name) {
      showMsg("error", "Nama rumus wajib diisi");
      return;
    }
    const formulaKey = slugifyFormulaKey(name);
    const used = new Set(formulas.map((f) => f.column.toUpperCase()));
    const newLetter = "PQRSTUVWXYZ".split("").find((c) => !used.has(c)) ?? `X${Date.now().toString(36).toUpperCase().slice(-3)}`;

    setRunusSaving(true);
    try {
      const cr = await apiJSON<{ formula: FormulaApi }>("/api/cashbook-formula", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert",
          formula: {
            name,
            column: newLetter,
            dbColumn: formulaKey,
            formulaKey,
            formulaGroup: input.formulaGroup,
            ast: { type: "literal", value: 0 },
            enabled: true,
            isSystem: false,
            displayOrder: formulas.length * 10 + 100,
            description: null,
          },
        }),
      });
      await reloadRumus();
      setNewFormulaDraft(null);
      setEditingFormulaId(cr.formula.id);
      showMsg("success", `Rumus "${name}" dibuat. Sekarang isi rumusnya.`);
    } catch (e) {
      showMsg("error", `Gagal membuat rumus: ${(e as Error).message}`);
    } finally {
      setRunusSaving(false);
    }
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
    { id: "kolom",    label: "Kolom" },
    { id: "kategori", label: "Kategori" },
    { id: "pengurus", label: "Pengurus" },
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
          <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">{editingActorId ? "Edit Pengurus" : "Tambah Pengurus"}</h3>
              <p className="text-blue-100 text-xs mt-1">Jabatan hanya label. Centang rumus yang berlaku untuk orang ini.</p>
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
              <input type="text" value={orangForm.display_name} onChange={(e) => setF("display_name", e.target.value)} placeholder="Mis. Andi" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Jabatan</label>
              <select value={orangForm.role_code} onChange={(e) => setF("role_code", e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white dark:bg-slate-900">
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
            <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Rumus yang akan dibuat</p>
            {orangPreview.map((l) => <p key={l} className="text-xs text-blue-800 dark:text-blue-200">{l}</p>)}
          </div>

          {/* Bagi Hasil */}
          <div className={`rounded-lg border-2 p-4 transition-colors ${orangForm.enable_profit_share ? "border-amber-300 dark:border-amber-800/50 bg-amber-50" : "border-slate-200 bg-white dark:bg-slate-900"}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={orangForm.enable_profit_share} onChange={(e) => setF("enable_profit_share", e.target.checked)} className="w-4 h-4 accent-amber-500" />
              <span className="text-sm font-semibold text-slate-700">Bagi Hasil</span>
              <span className="text-xs text-slate-400">persentase dari laba bersih</span>
            </label>
            {orangForm.enable_profit_share && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Persentase (%)</label>
                <input type="number" min="0" max="100" step="0.01" value={orangForm.profit_share_percent} onChange={(e) => setF("profit_share_percent", e.target.value)} placeholder="Mis. 40" className="w-40 px-3 py-2 text-sm border border-slate-300 rounded-md dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" />
              </div>
            )}
          </div>

          {/* Kasbon */}
          <div className={`rounded-lg border-2 p-4 transition-colors ${orangForm.enable_cash_advance ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white dark:bg-slate-900"}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={orangForm.enable_cash_advance} onChange={(e) => setF("enable_cash_advance", e.target.checked)} className="w-4 h-4 accent-violet-500" />
              <span className="text-sm font-semibold text-slate-700">Kasbon</span>
              <span className="text-xs text-slate-400">akumulasi dari kategori transaksi tertentu</span>
            </label>
            {orangForm.enable_cash_advance && (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-600">Kategori transaksi untuk kasbon</label>
                    <QuickAddCategoryButton
                      onAdded={async (code) => {
                        // Reload category list and auto-check the new category.
                        const r = await apiJSON<{ categories: FinanceCatOption[] }>("/api/finance/categories");
                        setFinCats(r.categories ?? []);
                        const up = code.toUpperCase();
                        setOrangForm((f) => ({
                          ...f,
                          kasbon_category_codes: f.kasbon_category_codes.includes(up)
                            ? f.kasbon_category_codes
                            : [...f.kasbon_category_codes, up],
                        }));
                      }}
                    />
                  </div>
                  {finCats.length === 0 ? (
                    <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-amber-800/50 rounded-md px-3 py-2">Daftar kategori belum dimuat. Buka tab Kategori untuk menambah kategori.</p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto rounded-md border border-violet-200 bg-white dark:bg-slate-900 divide-y divide-violet-50">
                      {finCats.map((cat) => {
                        const code = cat.category_code.toUpperCase();
                        const checked = orangForm.kasbon_category_codes.includes(code);
                        return (
                          <label key={code} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 ${checked ? "bg-violet-50" : ""}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleKasbonCat(code)} className="w-4 h-4 accent-violet-600 shrink-0" />
                            <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-300">&quot;{code}&quot;</span>
                            <span className="text-xs text-slate-600 truncate">{cat.display_name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Keperluan harus mengandung (opsional)</label>
                  <input type="text" value={orangForm.keperluan_keyword} onChange={(e) => setF("keperluan_keyword", e.target.value)} placeholder="Kata kunci untuk membedakan jika ada 2 orang di kategori yang sama" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" />
                </div>
              </div>
            )}
          </div>

          {/* Bonus */}
          <div className={`rounded-lg border-2 p-4 transition-colors ${orangForm.enable_bonus ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white dark:bg-slate-900"}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={orangForm.enable_bonus} onChange={(e) => setF("enable_bonus", e.target.checked)} className="w-4 h-4 accent-emerald-500" />
              <span className="text-sm font-semibold text-slate-700">Bonus</span>
              <span className="text-xs text-slate-400">persentase dari omzet / laba / rumus lain</span>
            </label>
            {orangForm.enable_bonus && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Persentase (%)</label>
                  <input type="number" min="0" max="100" step="0.01" value={orangForm.bonus_percent} onChange={(e) => setF("bonus_percent", e.target.value)} placeholder="Mis. 5" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Dari rumus</label>
                  <select value={orangForm.bonus_source_formula_key} onChange={(e) => setF("bonus_source_formula_key", e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white dark:bg-slate-900">
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
            <textarea value={orangForm.notes} onChange={(e) => setF("notes", e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" placeholder="Catatan internal — tidak muncul di rumus" />
          </div>
        </div>
      </ModalFormShell>

      {/* ── Main Pengaturan Modal ─────────────────────────────────────────── */}
      <ModalFormShell
        open={open}
        onClose={onClose}
        maxWidthClass="max-w-5xl"
        allowDismiss={!formOpen && !pendingConfirm && !editingFormulaId && !newFormulaDraft}
        header={
          <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">Pengaturan Keuangan</h3>
              <p className="text-slate-300 text-sm mt-1">Kelola orang, kategori transaksi, dan rumus kalkulasi buku kas.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
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
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              {tab === "kolom" && `${formulas.length} kolom`}
              {tab === "pengurus" && `${actors.filter((a) => a.is_active === 1).length} pengurus aktif`}
              {tab === "kategori" && `${categories.length} kategori`}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-4 py-1.5 text-sm rounded bg-slate-700 text-white hover:bg-slate-800">Tutup</button>
            </div>
          </div>
        }
      >
        {/* Tab navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-0 z-10">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setEditingFormulaId(null); }}
              className={`px-5 py-3 text-sm border-b-2 transition-colors ${
                tab === t.id
                  ? "border-slate-700 dark:border-slate-300 text-slate-900 dark:text-white font-semibold bg-slate-50 dark:bg-slate-800"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <InlineNotice notice={notice} />

        {/* ── Tab: Kolom ──────────────────────────────────────────────────── */}
        {/* All tab panels stay mounted; CSS hidden keeps them out of view */}
        <div className={tab === "kolom" ? undefined : "hidden"}>
          <KolomTab
            formulas={formulas}
            rumusSaving={rumusSaving}
            formulaKeyByLetter={formulaKeyByLetter}
            onEditFormula={(id) => {
              setEditingFormulaId(id);
            }}
            onDeleteFormula={deleteFormula}
            onNewFormula={createCustomFormula}
            onOpenKategori={() => setTab("kategori")}
          />
        </div>

        {/* ── Tab: Orang ──────────────────────────────────────────────────── */}
        <div className={tab === "pengurus" ? undefined : "hidden"}>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <input type="text" value={orangSearch} onChange={(e) => setOrangSearch(e.target.value)} placeholder="Cari nama / jabatan…" className="px-3 py-1.5 text-sm border border-slate-300 rounded-md w-52 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500" />
                <label className="text-xs text-slate-600 flex items-center gap-2 select-none cursor-pointer">
                  <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                  Tampilkan nonaktif
                </label>
              </div>
              <button type="button" onClick={() => { setEditingActorId(null); setOrangForm({ ...EMPTY_ORANG, role_code: roles[0]?.role_code ?? "" }); setFormOpen(true); }} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold">
                + Tambah Pengurus
              </button>
            </div>

            {orangLoading && <div className="py-10 text-center text-slate-500 text-sm">Memuat data…</div>}

            {!orangLoading && filteredActors.length === 0 && (
              <div className="py-12 text-center text-slate-500 text-sm space-y-2">
                <p>Belum ada pengurus. Tekan <strong>+ Tambah Pengurus</strong> untuk mulai.</p>
                <p className="text-xs text-slate-400">Bar Bagi Hasil / Kasbon / Bonus muncul otomatis begitu ada pengurus aktif.</p>
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
                          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 text-xs uppercase">
                            <tr>
                              <th className="px-3 py-2 text-left">Nama</th>
                              <th className="px-3 py-2 text-left">Jabatan</th>
                              <th className="px-3 py-2 text-left">Rumus aktif</th>
                              <th className="px-3 py-2 text-center">Status</th>
                              <th className="px-3 py-2 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100">
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
                                      ? <span className="text-xs text-emerald-700 dark:text-emerald-300">Aktif</span>
                                      : <span className="text-xs text-slate-400">Nonaktif</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <div className="inline-flex items-center justify-end gap-0.5">
                                      <button type="button" onClick={() => { setEditingActorId(a.id); setOrangForm(actorToForm(a)); setFormOpen(true); }} className="p-1.5 rounded-md text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800 transition-colors" title="Edit pengurus">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                      </button>
                                      {a.is_active === 1
                                        ? <button type="button" onClick={() => handleDeactivate(a)} className="p-1.5 rounded-md text-amber-600 dark:text-amber-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800 transition-colors" title="Nonaktifkan pengurus">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                          </button>
                                        : <button type="button" onClick={() => handleReactivate(a)} className="p-1.5 rounded-md text-emerald-600 dark:text-emerald-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800 transition-colors" title="Aktifkan kembali">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                          </button>}
                                      <button type="button" onClick={() => handleDeleteActor(a)} className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 transition-colors" title="Hapus permanen">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                      </button>
                                    </div>
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

        {/* ── Tab: Kategori ───────────────────────────────────────────────── */}
        <div className={tab === "kategori" ? undefined : "hidden"}>
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
                          setPendingConfirm({
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
        </div>

      </ModalFormShell>

      {/* ── Expression Assistant overlay ─────────────────────────────────── */}
      {/* Rendered outside ModalFormShell so it sits on top as its own modal */}
      {editingFormula && (
        <ModalFormShell
          open={!!editingFormula}
          onClose={() => setEditingFormulaId(null)}
          maxWidthClass="max-w-3xl"
          zIndexClass="z-[60]"
          allowDismiss={false}
          header={
              <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-6 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400 uppercase tracking-wider">
                  Konfigurasi Rumus
                </p>
                <h3 className="text-base font-bold text-white truncate">
                  {editingFormula.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingFormulaId(null)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          }
          footer={<div />}
        >
          <ExpressionAssistant
            key={editingFormula.id}
            title={editingFormula.name}
            initialAst={editingFormula.ast}
            selfFormulaKey={editingFormula.formulaKey ?? editingFormula.dbColumn}
            onSave={saveFormula}
            onCancel={() => setEditingFormulaId(null)}
            saving={rumusSaving}
            defaultAst={
              editingFormula.isSystem
                ? (DEFAULT_FORMULAS.find(
                    (f) =>
                      (f.formulaKey ?? f.dbColumn) ===
                      (editingFormula.formulaKey ?? editingFormula.dbColumn)
                  )?.ast ?? null)
                : null
            }
          />
        </ModalFormShell>
      )}
    </>
  );
}
