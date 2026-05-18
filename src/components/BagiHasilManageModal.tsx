"use client";

import { useEffect, useMemo, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import {
  PROFIT_FORMULA_LABELS,
  PROFIT_SHARE_SLOTS,
  type ProfitFormula,
  findAvailableProfitShareSlot,
  findOrphanProfitShareSlot,
  slotForSourceColumn,
} from "@/lib/profit-share-config";

type Participant = {
  id: string;
  display_name: string;
  role_type: string;
  profit_formula?: ProfitFormula | null;
  share_divisor?: number | null;
};

type MetricMapping = {
  id?: string;
  metric_group: string;
  source_column: string;
  participant_id?: string | null;
};

type PartnerRow = {
  participantId: string;
  name: string;
  slotLabel: string;
  formula: ProfitFormula;
  shareDivisor: number;
};

export default function BagiHasilManageModal({
  open,
  onClose,
  participants,
  metricMappings,
  saving,
  onSubmit,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  participants: Participant[];
  metricMappings: MetricMapping[];
  saving: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  canEdit: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [newFormula, setNewFormula] =
    useState<ProfitFormula>("third_minus_kasbon");
  const [newDivisor, setNewDivisor] = useState(3);
  const [edits, setEdits] = useState<
    Record<string, { formula: ProfitFormula; shareDivisor: number }>
  >({});

  const partnerRows: PartnerRow[] = useMemo(() => {
    const rows: PartnerRow[] = [];
    for (const m of metricMappings) {
      if (m.metric_group !== "profit_share") continue;
      const slot = slotForSourceColumn(m.source_column);
      if (!slot) continue;
      const p = m.participant_id
        ? participants.find((x) => x.id === m.participant_id)
        : undefined;
      if (!p || p.role_type !== "profit_share") continue;
      rows.push({
        participantId: p.id,
        name: p.display_name,
        slotLabel: slot.label,
        formula:
          (p.profit_formula as ProfitFormula) || slot.defaultFormula,
        shareDivisor:
          p.share_divisor && p.share_divisor > 0 ? p.share_divisor : 3,
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [metricMappings, participants]);

  const availableSlot = useMemo(
    () =>
      findAvailableProfitShareSlot(metricMappings) ??
      findOrphanProfitShareSlot(metricMappings),
    [metricMappings]
  );

  const orphanedSlots = useMemo(() => {
    const used = new Set(
      metricMappings
        .filter((m) => m.metric_group === "profit_share")
        .map((m) => m.source_column)
    );
    return PROFIT_SHARE_SLOTS.filter((s) => !used.has(s.sourceColumn));
  }, [metricMappings]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, { formula: ProfitFormula; shareDivisor: number }> =
      {};
    for (const row of partnerRows) {
      next[row.participantId] = {
        formula: row.formula,
        shareDivisor: row.shareDivisor,
      };
    }
    setEdits(next);
    setNewName("");
    setNewFormula(availableSlot?.defaultFormula ?? "third_minus_kasbon");
    setNewDivisor(3);
  }, [open, partnerRows, availableSlot?.defaultFormula]);

  const savePartner = async (participantId: string) => {
    const edit = edits[participantId];
    if (!edit) return;
    await onSubmit({
      action: "update_profit_share_partner",
      id: participantId,
      profit_formula: edit.formula,
      share_divisor: edit.shareDivisor,
    });
  };

  const addPartner = async () => {
    const name = newName.trim();
    if (!name) return;
    await onSubmit({
      action: "setup_bagi_hasil_partner",
      display_name: name,
      profit_formula: newFormula,
      share_divisor: newDivisor,
      source_column: availableSlot?.sourceColumn,
    });
  };

  const removePartner = async (participantId: string) => {
    await onSubmit({
      action: "remove_bagi_hasil_partner",
      participant_id: participantId,
    });
  };

  return (
    <ModalFormShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      header={
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Kelola bagi hasil</h2>
            <p className="text-amber-100 text-xs mt-0.5">
              Tambah mitra, atur rumus, lalu hitung ulang buku kas
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/90 hover:text-white p-1 rounded-lg"
            aria-label="Tutup"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      }
      footer={
        <div className="bg-gray-50 px-6 py-4 flex justify-end border-t border-gray-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-100 bg-white"
          >
            Tutup
          </button>
        </div>
      }
    >
      <div className="p-6 space-y-5">
        <p className="text-sm text-gray-600 leading-relaxed">
          Maksimal <strong>3 mitra bagi hasil</strong> per perusahaan. Setelah
          mengubah daftar atau rumus pembagian, buku kas dihitung ulang
          otomatis.
        </p>

        {partnerRows.length === 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Belum ada mitra bagi hasil aktif. Tambahkan nama mitra di form di
            bawah.
          </p>
        ) : (
          <ul className="space-y-3">
            {partnerRows.map((row) => {
              const edit = edits[row.participantId] ?? {
                formula: row.formula,
                shareDivisor: row.shareDivisor,
              };
              return (
                <li
                  key={row.participantId}
                  className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{row.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {row.slotLabel}
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => removePartner(row.participantId)}
                        className="text-red-600 text-sm hover:text-red-800 shrink-0"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                  {canEdit ? (
                    <>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-semibold text-gray-600">
                            Cara hitung
                          </label>
                          <select
                            value={edit.formula}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [row.participantId]: {
                                  ...edit,
                                  formula: e.target.value as ProfitFormula,
                                },
                              }))
                            }
                            className="w-full mt-1 px-2 py-1.5 border rounded-lg text-sm"
                          >
                            {(
                              Object.keys(
                                PROFIT_FORMULA_LABELS
                              ) as ProfitFormula[]
                            ).map((key) => (
                              <option key={key} value={key}>
                                {PROFIT_FORMULA_LABELS[key]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-600">
                            Pembagi (3 = sepertiga)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={edit.shareDivisor}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [row.participantId]: {
                                  ...edit,
                                  shareDivisor: Math.max(
                                    1,
                                    Number(e.target.value) || 3
                                  ),
                                },
                              }))
                            }
                            className="w-full mt-1 px-2 py-1.5 border rounded-lg text-sm"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => savePartner(row.participantId)}
                        className="text-sm px-3 py-1.5 bg-slate-700 text-white rounded-lg disabled:opacity-50"
                      >
                        Simpan & hitung ulang
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-gray-600">
                      {PROFIT_FORMULA_LABELS[row.formula]} · pembagi{" "}
                      {row.shareDivisor}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {orphanedSlots.length > 0 && (
          <p className="text-xs text-gray-500">
            Slot tersedia: {orphanedSlots.map((s) => s.label).join(", ")}
          </p>
        )}

        {canEdit && availableSlot && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <p className="font-semibold text-gray-800 text-sm">Tambah mitra</p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nama mitra atau pemilik"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <div className="grid sm:grid-cols-2 gap-2">
              <select
                value={newFormula}
                onChange={(e) =>
                  setNewFormula(e.target.value as ProfitFormula)
                }
                className="w-full px-2 py-1.5 border rounded-lg text-sm"
              >
                {(
                  Object.keys(PROFIT_FORMULA_LABELS) as ProfitFormula[]
                ).map((key) => (
                  <option key={key} value={key}>
                    {PROFIT_FORMULA_LABELS[key]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={12}
                value={newDivisor}
                onChange={(e) =>
                  setNewDivisor(Math.max(1, Number(e.target.value) || 3))
                }
                className="w-full px-2 py-1.5 border rounded-lg text-sm"
                aria-label="Pembagi"
              />
            </div>
            <p className="text-xs text-gray-500">
              Akan memakai slot: {availableSlot.label}
            </p>
            <button
              type="button"
              disabled={saving || !newName.trim()}
              onClick={addPartner}
              className="w-full px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              Tambah mitra & hitung ulang
            </button>
          </div>
        )}

        {canEdit && !availableSlot && partnerRows.length >= 3 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Semua slot terpakai. Hapus mitra yang tidak dipakai untuk menambah
            nama lain.
          </p>
        )}
      </div>
    </ModalFormShell>
  );
}
