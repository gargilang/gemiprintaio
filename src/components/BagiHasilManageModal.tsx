"use client";

import { useEffect, useMemo, useState } from "react";
import ModalFormShell from "@/components/ModalFormShell";
import {
  PROFIT_SHARE_SLOTS,
  PARTICIPANT_ROLE_LABELS,
  slotForSourceColumn,
} from "@/lib/profit-share-config";

type Participant = {
  id: string;
  display_name: string;
  role_type: string;
  participant_role?: string | null;
  share_percent?: number | null;
};

type MetricMapping = {
  id?: string;
  metric_group: string;
  source_column: string;
  participant_id?: string | null;
};

type DraftRow = {
  participantId: string;
  name: string;
  role: string;
  percent: number;
};

const ROLES = ["PEMILIK", "MANAGER", "INVESTOR"] as const;

function roundTo2(n: number) {
  return Math.round(n * 100) / 100;
}

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
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<string>("PEMILIK");
  const [percentError, setPercentError] = useState<string | null>(null);

  // Build active partner rows from metric mappings
  const partnerRows: DraftRow[] = useMemo(() => {
    const rows: DraftRow[] = [];
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
        role: p.participant_role ?? "PEMILIK",
        percent: p.share_percent != null ? Number(p.share_percent) : 100,
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [metricMappings, participants]);

  const canAddMore = useMemo(() => {
    if (partnerRows.length >= PROFIT_SHARE_SLOTS.length) return false;
    const activeIds = new Set(participants.map((p) => p.id));
    for (const slot of PROFIT_SHARE_SLOTS) {
      const mapping = metricMappings.find(
        (m) => m.metric_group === "profit_share" && m.source_column === slot.sourceColumn
      );
      // Slot is available if: no mapping, OR mapping has no participant_id,
      // OR mapping references a participant not in the active list
      if (!mapping || !mapping.participant_id || !activeIds.has(mapping.participant_id)) {
        return true;
      }
    }
    return false;
  }, [metricMappings, participants, partnerRows.length]);

  // Sync drafts when modal opens or partner data changes
  useEffect(() => {
    if (!open) return;
    setDrafts(partnerRows);
    setShowAddForm(false);
    setNewName("");
    setNewRole("PEMILIK");
    setPercentError(null);
  // partnerRows identity changes when data reloads; using JSON key to detect real changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, partnerRows.map((r) => `${r.participantId}:${r.percent}:${r.role}`).join("|")]);

  const totalPercent = drafts.reduce((s, d) => s + (d.percent || 0), 0);
  const isPercentValid = Math.abs(totalPercent - 100) < 0.1 || drafts.length === 0;

  const updateDraft = (id: string, field: "percent" | "role", value: number | string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.participantId === id ? { ...d, [field]: value } : d
      )
    );
    setPercentError(null);
  };

  const autoDistribute = () => {
    if (drafts.length === 0) return;
    const equal = roundTo2(100 / drafts.length);
    const first = roundTo2(100 - equal * (drafts.length - 1));
    setDrafts((prev) =>
      prev.map((d, i) => ({ ...d, percent: i === 0 ? first : equal }))
    );
    setPercentError(null);
  };

  const savePercents = async () => {
    if (!isPercentValid) {
      setPercentError(`Total persentase harus 100%. Sekarang: ${roundTo2(totalPercent)}%`);
      return;
    }
    await onSubmit({
      action: "update_bagi_hasil_percents",
      percents: drafts.map((d) => ({
        participant_id: d.participantId,
        share_percent: d.percent,
        participant_role: d.role,
      })),
    });
  };

  const addPartner = async () => {
    const name = newName.trim();
    if (!name) return;
    await onSubmit({
      action: "setup_bagi_hasil_partner",
      display_name: name,
      participant_role: newRole,
    });
    setShowAddForm(false);
    setNewName("");
    setNewRole("PEMILIK");
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
      maxWidthClass="max-w-xl"
      header={
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Kelola Bagi Hasil</h2>
            <p className="text-amber-100 text-xs mt-0.5">
              Atur peserta dan persentase pembagian laba bersih
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/90 hover:text-white p-1 rounded-lg"
            aria-label="Tutup"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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

        {/* Participants list */}
        {drafts.length === 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-3">
            Belum ada peserta bagi hasil. Tambahkan orang pertama di bawah.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_140px_80px_32px] gap-2 px-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span>Nama</span>
              <span>Peran</span>
              <span className="text-right">Bagian</span>
              <span />
            </div>

            {drafts.map((d) => (
              <div
                key={d.participantId}
                className="grid grid-cols-[1fr_140px_80px_32px] gap-2 items-center rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2.5"
              >
                <span className="font-semibold text-gray-900 text-sm truncate">
                  {d.name}
                </span>

                {canEdit ? (
                  <select
                    value={d.role}
                    onChange={(e) => updateDraft(d.participantId, "role", e.target.value)}
                    className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {PARTICIPANT_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-gray-600">
                    {PARTICIPANT_ROLE_LABELS[d.role] ?? d.role}
                  </span>
                )}

                {canEdit ? (
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={d.percent}
                      onChange={(e) =>
                        updateDraft(
                          d.participantId,
                          "percent",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full text-right text-sm px-2 py-1 border border-gray-200 rounded-lg"
                    />
                    <span className="text-xs text-gray-500 shrink-0">%</span>
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-right text-amber-700">
                    {d.percent}%
                  </span>
                )}

                {canEdit ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => removePartner(d.participantId)}
                    className="text-red-400 hover:text-red-600 disabled:opacity-50 flex items-center justify-center"
                    title="Hapus"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : <span />}
              </div>
            ))}

            {/* Total row */}
            <div className="flex items-center justify-between pt-1 px-1">
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={autoDistribute}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Rata otomatis
                  </button>
                )}
                {percentError && (
                  <span className="text-xs text-red-600">{percentError}</span>
                )}
              </div>
              <span
                className={`text-sm font-bold tabular-nums ${
                  isPercentValid ? "text-emerald-700" : "text-red-600"
                }`}
              >
                Total: {roundTo2(totalPercent)}%
              </span>
            </div>

            {canEdit && (
              <button
                type="button"
                disabled={saving || !isPercentValid}
                onClick={savePercents}
                className="w-full py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {saving ? "Menyimpan..." : "Simpan & Hitung Ulang"}
              </button>
            )}
          </div>
        )}

        {/* Add new partner */}
        {canEdit && canAddMore && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            {!showAddForm ? (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="w-full py-2 border-2 border-dashed border-amber-300 text-amber-700 rounded-lg text-sm font-semibold hover:bg-amber-50 transition-colors"
              >
                + Tambah Orang
              </button>
            ) : (
              <>
                <p className="font-semibold text-gray-800 text-sm">Tambah orang baru</p>
                <p className="text-xs text-gray-500">
                  Persentase akan dibagi rata otomatis. Bisa diubah setelah ditambah.
                </p>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPartner()}
                  placeholder="Nama..."
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  autoFocus
                />
                <div>
                  <label className="text-xs font-semibold text-gray-600">Peran</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {PARTICIPANT_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving || !newName.trim()}
                    onClick={addPartner}
                    className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? "Menambahkan..." : "Tambah"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setNewName(""); }}
                    className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm"
                  >
                    Batal
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {canEdit && !canAddMore && partnerRows.length >= PROFIT_SHARE_SLOTS.length && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Kapasitas penuh ({PROFIT_SHARE_SLOTS.length} orang). Hapus salah satu untuk menambah yang baru.
          </p>
        )}

        <p className="text-xs text-gray-400">
          Bagi hasil dihitung dari <strong>laba bersih</strong> sesuai persentase masing-masing. Perubahan akan menghitung ulang seluruh buku kas secara otomatis.
        </p>
      </div>
    </ModalFormShell>
  );
}
