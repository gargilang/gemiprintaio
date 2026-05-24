"use client";

/**
 * KolomTab — tab "Kolom" di PengaturanKeuanganModal.
 *
 * Satu tabel flat berisi setiap kolom yang ada di tabel transaksi buku kas:
 *   1. Kolom sistem (Tanggal, Kategori, Nominal, Keperluan, Aksi) yang
 *      di-render dari konstanta lokal — tidak bisa dihapus, tidak bisa
 *      disembunyikan (icon gembok pada toggle).
 *   2. Kolom kalkulasi (semua `cashbook_formula`) yang punya rumus AST.
 *      User bisa toggle "Tampil di tabel" (= is_visible_in_summary), edit
 *      rumus, dan hapus kolom non-sistem non-actor.
 *
 * Tidak ada toggle Aktif lagi — kalau user tidak mau rumusnya jalan, hapus
 * kolomnya. Setiap kolom yang ada di tabel ini = aktif dan dihitung engine.
 */

import { useMemo, useState } from "react";
import type { ASTNode, FormulaGroup } from "@/lib/ast/types";
import { astToDsl, DEFAULT_INPUT_COLUMNS } from "@/lib/ast";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FormulaApi {
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

export interface KolomTabProps {
  formulas: FormulaApi[];
  rumusSaving: boolean;
  formulaKeyByLetter: Record<string, string>;
  onEditFormula: (id: string) => void;
  onDeleteFormula: (f: FormulaApi) => void;
  onNewFormula: (draft: { name: string; formulaGroup: FormulaGroup }) => void;
  /** Redirect to the Kategori tab so the user can manage kategori_transaksi values. */
  onOpenKategori: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Locked system columns. They live in the table by virtue of the database
 * shape (tabel `keuangan` has these fields directly) and don't have an AST,
 * so they're modelled separately from formula rows.
 */
const SYSTEM_COLUMNS: Array<{
  key: string;
  label: string;
  description: string;
  type: string;
}> = [
  { key: "tanggal",            label: "Tanggal",   description: "Tanggal transaksi.",                                      type: "Tanggal" },
  { key: "kategori_transaksi", label: "Kategori",  description: "Kode kategori transaksi (mis. OMZET, BIAYA).",          type: "Teks" },
  { key: "nominal",            label: "Nominal",   description: "Debit (masuk) atau Kredit (keluar) — digabung satu kolom.", type: "Angka" },
  { key: "keperluan",          label: "Keperluan", description: "Catatan teks bebas untuk transaksi.",                   type: "Teks" },
  { key: "aksi",               label: "Aksi",      description: "Tombol Edit dan Hapus.",                                type: "Kontrol" },
];

const FORMULA_GROUP_LABEL: Record<FormulaGroup, string> = {
  summary:      "Ringkasan",
  profit_share: "Bagi Hasil",
  cash_advance: "Kasbon",
  bonus:        "Bonus",
  custom:       "Kustom",
};

const FORMULA_GROUP_OPTIONS: FormulaGroup[] = [
  "profit_share",
  "cash_advance",
  "bonus",
  "custom",
];

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
      .replace(/^_+|_+$/g, "") || `kolom_${Date.now().toString(36)}`
  );
}

// ── Lock icon (small SVG so we don't pull a whole icon set) ──────────────────

function LockIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function KolomTab({
  formulas,
  rumusSaving,
  formulaKeyByLetter,
  onEditFormula,
  onDeleteFormula,
  onNewFormula,
  onOpenKategori,
}: KolomTabProps) {
  const [newDraft, setNewDraft] = useState<{
    name: string;
    formulaGroup: FormulaGroup;
  } | null>(null);

  // Sort formulas: system summary first, then by display_order. We never
  // hide enabled=false rows from the column list — "ada rumus = aktif".
  // If the user toggles enabled=false elsewhere, deleting them is the
  // intended UX, so we surface them here too.
  const orderedFormulas = useMemo(() => {
    return [...formulas].sort((a, b) => {
      const sa = a.isSystem ? 0 : 1;
      const sb = b.isSystem ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a.displayOrder - b.displayOrder;
    });
  }, [formulas]);

  function formulaPreview(f: FormulaApi): string {
    try {
      const { normalizeAstColumns } =
        require("@/lib/ast/normalize") as typeof import("@/lib/ast/normalize");
      const normalised = normalizeAstColumns(f.ast, formulaKeyByLetter);
      return astToDsl(normalised, {
        inputColumns: DEFAULT_INPUT_COLUMNS,
        formulaKeys: Object.values(formulaKeyByLetter),
      });
    } catch {
      return "";
    }
  }

  return (
    <div className="p-4 space-y-3">
      {/* Header + Tambah button */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-700">
            Kolom Tabel Transaksi
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Semua kolom yang muncul di tabel buku kas. Kolom sistem terkunci.
            Kolom kalkulasi bisa di-edit, dihapus, atau ditambah baru.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewDraft({ name: "", formulaGroup: "custom" })}
          className="px-3 py-1.5 text-xs rounded border border-blue-400 bg-blue-50 dark:bg-slate-800 text-blue-800 dark:text-blue-200 hover:bg-slate-50 dark:hover:bg-white/5 font-semibold"
        >
          + Tambah kolom
        </button>
      </div>

      {/* New column draft form */}
      {newDraft && (
        <div className="border-2 border-blue-200 dark:border-slate-700 bg-blue-50 dark:bg-slate-800 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-blue-900 uppercase tracking-wider">
            Kolom baru
          </p>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Nama kolom
            </label>
            <input
              type="text"
              autoFocus
              value={newDraft.name}
              onChange={(e) =>
                setNewDraft((d) => (d ? { ...d, name: e.target.value } : d))
              }
              placeholder="Contoh: Tunjangan Bulanan (tanpa menggunakan [ ] dan underscore _)"
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Identifier:{" "}
              <span className="font-mono text-emerald-700 dark:text-emerald-300">
                [{slugifyFormulaKey(newDraft.name || "kolom_baru")}]
              </span>
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setNewDraft(null)}
              className="px-3 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={rumusSaving || !newDraft.name.trim()}
              onClick={() => {
                onNewFormula(newDraft);
                setNewDraft(null);
              }}
              className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Buat &amp; edit rumus
            </button>
          </div>
        </div>
      )}

      {/* Single flat table — system rows + formula rows */}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Nama Kolom</th>
              <th className="px-3 py-2 text-left">Tipe</th>
              <th className="px-3 py-2 text-left">Rumus / Keterangan</th>
              <th className="px-3 py-2 text-right w-24">Aksi</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100">
            {/* System columns — always shown, locked */}
            {SYSTEM_COLUMNS.map((col) => {
              const isKategoriRow = col.key === "kategori_transaksi";
              return (
              <tr key={col.key} className="bg-slate-50 dark:bg-slate-800/60">
                <td className="px-3 py-2.5 align-top">
                  <div className="flex items-center gap-2 flex-wrap">
                    <LockIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                      [{col.key}]
                    </span>
                    <BadgeTag tone="slate">Sistem</BadgeTag>
                  </div>
                  <div className="text-[11px] text-slate-500 ml-5 mt-0.5">{col.label}</div>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <span className="text-xs text-slate-500">{col.type}</span>
                </td>
                <td className="px-3 py-2.5 align-top text-xs text-slate-500">
                  {col.description}
                </td>
                <td className="px-3 py-2.5 text-right align-top">
                  {isKategoriRow ? (
                    <button
                      type="button"
                      onClick={onOpenKategori}
                      className="p-1.5 rounded-md transition-colors text-amber-700 dark:text-amber-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800"
                      title="Kelola daftar kategori transaksi"
                      aria-label="Kelola kategori"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">terkunci</span>
                  )}
                </td>
              </tr>
              );
            })}

            {/* Formula columns — system + actor + custom together */}
            {orderedFormulas.map((f) => {
              const group = (f.formulaGroup ?? "custom") as FormulaGroup;
              const groupLabel = FORMULA_GROUP_LABEL[group];
              const formulaKey = f.formulaKey ?? f.dbColumn;
              const canDelete = !f.isSystem && !f.actorId;
              const deleteReason = f.isSystem
                ? "Kolom sistem tidak bisa dihapus"
                : f.actorId
                  ? "Hapus dari tab Pengurus untuk menghilangkan kolom ini"
                  : "";
              return (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 align-top">
                    <button
                      type="button"
                      onClick={() => onEditFormula(f.id)}
                      className="font-mono font-semibold text-emerald-700 dark:text-emerald-300 hover:underline text-left"
                    >
                      [{formulaKey}]
                    </button>
                    <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-500">{f.name}</span>
                      {f.isSystem && <BadgeTag tone="slate">Sistem</BadgeTag>}
                      {f.actorId && <BadgeTag tone="blue">Pengurus</BadgeTag>}
                      {!f.isSystem && !f.actorId && <BadgeTag tone="violet">Kustom</BadgeTag>}
                      {!f.isSystem && groupLabel && (
                        <BadgeTag tone="emerald">{groupLabel}</BadgeTag>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <span className="text-xs text-slate-500">Angka</span>
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs text-slate-600 font-mono">
                    <div className="max-w-[40ch] truncate">
                      {formulaPreview(f) || "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right align-top">
                    <div className="inline-flex items-center justify-end gap-1">
                      <IconButton
                        title="Edit rumus"
                        tone="blue"
                        onClick={() => onEditFormula(f.id)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        title={canDelete ? "Hapus kolom" : deleteReason}
                        tone="rose"
                        disabled={!canDelete || rumusSaving}
                        onClick={() => onDeleteFormula(f)}
                      >
                        <TrashIcon />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}

            {orderedFormulas.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-4 text-center text-xs text-slate-400 italic"
                >
                  Belum ada kolom kalkulasi. Tambah kolom baru atau buat
                  pengurus dengan rumus di tab Pengurus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Small UI helpers (kept local so KolomTab stays self-contained) ────────

function BadgeTag({
  tone,
  children,
}: {
  tone: "slate" | "blue" | "emerald" | "violet";
  children: React.ReactNode;
}) {
  const cls = {
    slate: "bg-slate-100 text-slate-600 border-slate-200",
    blue: "bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-slate-700",
    emerald: "bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-slate-700",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
  }[tone];
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold rounded border ${cls}`}
    >
      {children}
    </span>
  );
}

function IconButton({
  title,
  tone,
  disabled,
  onClick,
  children,
}: {
  title: string;
  tone: "blue" | "rose";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const cls = {
    blue: "text-blue-600 dark:text-blue-300 hover:bg-slate-50 dark:hover:bg-white/5",
    rose: "text-rose-600 hover:bg-rose-50",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${cls}`}
    >
      {children}
    </button>
  );
}

function EditIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}
