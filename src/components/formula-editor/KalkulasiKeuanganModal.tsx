"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import FormulaEditor from "./FormulaEditor";
import { astToText } from "@/lib/ast/graph";
import type { ASTNode } from "@/lib/ast/types";

interface FormulaApi {
  id: string;
  name: string;
  column: string;
  dbColumn: string;
  ast: ASTNode;
  enabled: boolean;
  isSystem: boolean;
  displayOrder: number;
  description?: string | null;
}

interface PartnerApi {
  id: string;
  name: string;
  category: string | null;
  displayOrder: number;
}

type TabId = "formulas" | "test";

export interface KalkulasiKeuanganModalProps {
  open: boolean;
  onClose: () => void;
  /** Buka modal kelola kategori transaksi (orang/kategori di luar rumus). */
  onManageCategories?: () => void;
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body?.error as string) || "Gagal memproses");
  return body as T;
}

export default function KalkulasiKeuanganModal({
  open,
  onClose,
  onManageCategories,
}: KalkulasiKeuanganModalProps) {
  const [tab, setTab] = useState<TabId>("formulas");
  const [formulas, setFormulas] = useState<FormulaApi[]>([]);
  const [partners, setPartners] = useState<PartnerApi[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testRows, setTestRows] = useState(
    'OMZET\t1000000\t0\tPenjualan Cahaya\nBIAYA\t0\t150000\tListrik\nSUPPLY\t0\t200000\tTinta'
  );
  const [testOutputs, setTestOutputs] = useState<
    Array<Record<string, number | string | boolean>> | null
  >(null);
  const [testError, setTestError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [fRes, pRes] = await Promise.all([
        fetchJSON<{ formulas: FormulaApi[] }>("/api/cashbook-formula"),
        fetchJSON<{ partners: PartnerApi[] }>("/api/cashbook-partner"),
      ]);
      setFormulas(fRes.formulas);
      setPartners(pRes.partners);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (open) {
      refresh();
      setEditingId(null);
      setTab("formulas");
    }
  }, [open, refresh]);

  const editingFormula = useMemo(
    () => formulas.find((f) => f.id === editingId) ?? null,
    [formulas, editingId]
  );

  const outputColumns = useMemo(
    () => formulas.map((f) => f.column),
    [formulas]
  );

  const handleSaveFormula = async (ast: ASTNode) => {
    if (!editingFormula) return;
    setSaving(true);
    try {
      await fetchJSON("/api/cashbook-formula", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert",
          formula: { ...editingFormula, ast },
        }),
      });
      await refresh();
      setEditingId(null);
    } catch (e) {
      alert(`Gagal menyimpan: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (f: FormulaApi) => {
    setSaving(true);
    try {
      await fetchJSON("/api/cashbook-formula", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert",
          formula: { ...f, enabled: !f.enabled },
        }),
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFormula = async (f: FormulaApi) => {
    if (!confirm(`Hapus rumus "${f.name}"?`)) return;
    setSaving(true);
    try {
      await fetchJSON("/api/cashbook-formula", {
        method: "POST",
        body: JSON.stringify({ action: "delete", id: f.id }),
      });
      await refresh();
      if (editingId === f.id) setEditingId(null);
    } catch (e) {
      alert(`Gagal menghapus: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    if (
      !confirm(
        "Yakin ingin mengembalikan semua rumus ke pengaturan bawaan? Perubahan kustom akan hilang."
      )
    )
      return;
    setResetting(true);
    try {
      await fetchJSON("/api/cashbook-formula", {
        method: "POST",
        body: JSON.stringify({ action: "reset" }),
      });
      await refresh();
      setEditingId(null);
    } catch (e) {
      alert(`Gagal reset: ${(e as Error).message}`);
    } finally {
      setResetting(false);
    }
  };

  const handleNewFormula = async () => {
    // Pick a fresh column letter (after the last existing one).
    const usedLetters = new Set(formulas.map((f) => f.column.toUpperCase()));
    const candidates = "PQRSTUVWXYZ".split("");
    const newLetter = candidates.find((c) => !usedLetters.has(c)) ?? "X";
    const newName = prompt(
      "Nama rumus baru?",
      `Rumus ${newLetter}`
    );
    if (!newName) return;
    const newDbColumn = prompt(
      "Kolom DB di tabel keuangan (mis. omzet, kasbon_suri):",
      `kolom_${newLetter.toLowerCase()}`
    );
    if (!newDbColumn) return;
    setSaving(true);
    try {
      const created = await fetchJSON<{ formula: FormulaApi }>(
        "/api/cashbook-formula",
        {
          method: "POST",
          body: JSON.stringify({
            action: "upsert",
            formula: {
              name: newName,
              column: newLetter,
              dbColumn: newDbColumn,
              ast: { type: "literal", value: 0 },
              enabled: true,
              isSystem: false,
              displayOrder: formulas.length * 10 + 10,
            },
          }),
        }
      );
      await refresh();
      setEditingId(created.formula.id);
    } catch (e) {
      alert(`Gagal membuat rumus baru: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Test runner ──────────────────────────────────────────────────────────

  const parseTestRows = useCallback(() => {
    const rows: Array<{ C: string; D: number; E: number; F: string }> = [];
    for (const line of testRows.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\t|,/);
      rows.push({
        C: (parts[0] ?? "").trim(),
        D: Number(parts[1] ?? 0) || 0,
        E: Number(parts[2] ?? 0) || 0,
        F: (parts[3] ?? "").trim(),
      });
    }
    return rows;
  }, [testRows]);

  const runTest = async () => {
    setTestError(null);
    setTestOutputs(null);
    try {
      const body = { rows: parseTestRows() };
      const res = await fetchJSON<{
        outputs: Array<Record<string, number | string | boolean>>;
      }>("/api/evaluate", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setTestOutputs(res.outputs);
    } catch (e) {
      setTestError((e as Error).message);
    }
  };

  return (
    <ModalFormShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-7xl"
      header={
        <div className="bg-gradient-to-r from-indigo-700 to-blue-700 px-6 py-4 border-b border-indigo-900">
          <h3 className="text-xl font-bold text-white">Kalkulasi Keuangan</h3>
          <p className="text-indigo-100 text-sm mt-1">
            Atur rumus perhitungan buku kas (omzet, laba, bagi hasil, kasbon).
            Kelola nama orang di bar Bagi Hasil / Kasbon. Perubahan langsung
            menghitung ulang buku kas.
          </p>
        </div>
      }
      footer={
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {formulas.length} rumus
            {onManageCategories && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={onManageCategories}
                  className="text-blue-700 hover:underline"
                >
                  Kelola kategori transaksi
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={resetting}
              className="px-3 py-1.5 text-xs rounded border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              {resetting ? "Memuat ulang…" : "Kembalikan ke bawaan"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded bg-slate-700 text-white hover:bg-slate-800"
            >
              Tutup
            </button>
          </div>
        </div>
      }
    >
      <div className="flex border-b border-slate-200 bg-white sticky top-0 z-10">
        {(
          [
            { id: "formulas", label: "Rumus" },
            { id: "test", label: "Uji coba" },
          ] as Array<{ id: TabId; label: string }>
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              if (t.id !== "formulas") setEditingId(null);
            }}
            className={`px-4 py-2 text-sm border-b-2 ${
              tab === t.id
                ? "border-blue-600 text-blue-700 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {loadError && (
          <div className="mb-3 px-3 py-2 rounded border border-rose-300 bg-rose-50 text-rose-800 text-sm">
            {loadError}
          </div>
        )}

        {tab === "formulas" && !editingFormula && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">
                Daftar rumus perhitungan
              </h4>
              <button
                type="button"
                onClick={handleNewFormula}
                className="px-3 py-1.5 text-xs rounded border border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100"
              >
                + Tambah rumus
              </button>
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
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {f.name}
                      </td>
                      <td className="px-3 py-2 text-slate-500 text-xs font-mono">
                        {f.dbColumn}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-[28ch]">
                        {astToText(f.ast)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={f.enabled}
                          onChange={() => handleToggleEnabled(f)}
                        />
                      </td>
                      <td className="px-3 py-2 text-right space-x-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(f.id)}
                          className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFormula(f)}
                          className="px-2 py-1 text-xs rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                  {formulas.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-slate-500 text-sm"
                      >
                        Belum ada rumus. Tekan &quot;Kembalikan ke bawaan&quot;
                        untuk memuat default.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "formulas" && editingFormula && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-sm text-slate-500">Mengedit</div>
                <h4 className="text-lg font-semibold text-slate-800">
                  {editingFormula.name}
                </h4>
                <p className="text-xs text-slate-500">
                  Menulis ke kolom DB:{" "}
                  <span className="font-mono">{editingFormula.dbColumn}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-3 py-1.5 text-xs rounded border border-slate-300 hover:bg-slate-100"
              >
                ← Kembali ke daftar
              </button>
            </div>
            <div className="h-[600px] border border-slate-200 rounded overflow-hidden">
              <FormulaEditor
                key={editingFormula.id}
                initialAst={editingFormula.ast}
                partners={partners.map((p) => ({ id: p.id, name: p.name }))}
                outputColumns={outputColumns}
                onSave={handleSaveFormula}
                saving={saving}
              />
            </div>
          </div>
        )}

        {tab === "test" && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700">
              Uji coba rumus
            </h4>
            <p className="text-xs text-slate-500">
              Tempel data uji dengan format:{" "}
              <code>C TAB D TAB E TAB F</code> (atau dipisah koma). Setiap baris
              = satu transaksi.
            </p>
            <textarea
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-mono h-40"
              value={testRows}
              onChange={(e) => setTestRows(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runTest}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Jalankan
              </button>
              {testError && (
                <span className="text-xs text-rose-600">{testError}</span>
              )}
            </div>
            {testOutputs && (
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="text-xs min-w-full">
                  <thead className="bg-slate-100 text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="px-2 py-1 text-left">#</th>
                      {formulas.map((f) => (
                        <th key={f.column} className="px-2 py-1 text-right">
                          {f.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {testOutputs.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1 text-slate-500">{idx + 1}</td>
                        {formulas.map((f) => {
                          const v = row[f.column];
                          return (
                            <td
                              key={f.column}
                              className="px-2 py-1 text-right font-mono"
                            >
                              {typeof v === "number"
                                ? v.toLocaleString("id-ID")
                                : String(v ?? "")}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalFormShell>
  );
}
