"use client";

/**
 * PengaturanKeuanganModal — satu modal untuk semua pengaturan keuangan.
 * Tab: Kolom | Kategori | Pegawai
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import ExpressionAssistant from "@/components/finance/ExpressionAssistant";
import KolomTab from "@/components/finance/KolomTab";
import TabKategori from "@/components/finance/pengaturan-keuangan/TabKategori";
import TabPengurus from "@/components/finance/pengaturan-keuangan/TabPengurus";
import { type ConfirmRequest } from "@/components/finance/pengaturan-keuangan/shared";
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


export default function PengaturanKeuanganModal({
  open, onClose, defaultTab = "kolom",
  onCategoriesChanged, onActorsChanged, onRecalcTriggered,
}: PengaturanKeuanganModalProps) {
  const [tab, setTab] = useState<PengaturanTab>(defaultTab);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmRequest | null>(null);

  const showMsg = useCallback((type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3500);
  }, []);

  const requestConfirm = useCallback((req: ConfirmRequest) => {
    setPendingConfirm(req);
  }, []);

  useEffect(() => {
    if (open) {
      setTab(defaultTab);
      setNotice(null);
    } else {
      // Reset rumus loaded flag saat modal ditutup agar dibuka lagi memuat data segar.
      // Tab Kategori & Pengurus mengelola siklus muat-ulangnya sendiri lewat prop `open`.
      setRumusLoaded(false);
    }
  }, [open, defaultTab]);


  // ── Hitungan footer dilaporkan oleh tab anak ───────────────────────────────
  const [kategoriCount, setKategoriCount] = useState(0);
  const [pengurusAktif, setPengurusAktif] = useState(0);
  // Modal form Orang terbuka → matikan dismiss modal utama agar tidak ikut tertutup.
  const [pengurusFormOpen, setPengurusFormOpen] = useState(false);


  // ── Rumus state ────────────────────────────────────────────────────────────
  const [formulas, setFormulas] = useState<FormulaApi[]>([]);
  const [rumusLoaded, setRumusLoaded] = useState(false);
  const [rumusSaving, setRunusSaving] = useState(false);
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

  // ── Render ──────────────────────────────────────────────────────────────────

  const TABS: Array<{ id: PengaturanTab; label: string }> = [
    { id: "kolom",    label: "Kolom" },
    { id: "kategori", label: "Kategori" },
    { id: "pengurus", label: "Pegawai" },
  ];

  return (
    <>
      {pendingConfirm && (
        <DialogKonfirmasi
          show
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmText={pendingConfirm.confirmText}
          type={pendingConfirm.type}
          onConfirm={() => { const h = pendingConfirm.onConfirm; setPendingConfirm(null); void h(); }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}


      {/* ── Main Pengaturan Modal ─────────────────────────────────────────── */}
      <ModalFormShell
        open={open}
        onClose={onClose}
        maxWidthClass="max-w-5xl"
        allowDismiss={!pengurusFormOpen && !pendingConfirm && !editingFormulaId && !newFormulaDraft}
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
              {tab === "pengurus" && `${pengurusAktif} pegawai aktif`}
              {tab === "kategori" && `${kategoriCount} kategori`}
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

        {/* ── Tab: Pengurus ─────────────────────────────────────────────── */}
        <div className={tab === "pengurus" ? undefined : "hidden"}>
          <TabPengurus
            open={open}
            showMsg={showMsg}
            requestConfirm={requestConfirm}
            onActorsChanged={onActorsChanged}
            onRecalcTriggered={onRecalcTriggered}
            onFormulasChanged={reloadRumus}
            onActiveCountChange={setPengurusAktif}
            onFormOpenChange={setPengurusFormOpen}
          />
        </div>

        {/* ── Tab: Kategori ───────────────────────────────────────────────── */}
        <div className={tab === "kategori" ? undefined : "hidden"}>
          <TabKategori
            open={open}
            showMsg={showMsg}
            requestConfirm={requestConfirm}
            onCategoriesChanged={onCategoriesChanged}
            onCountChange={setKategoriCount}
          />
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
