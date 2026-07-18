"use client";

import { useState, useEffect } from "react";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import {
  getFinishingOptionsAction as getFinishingOptionsList,
  createFinishingOptionAction as createFinishingOpt,
  updateFinishingOptionAction as updateFinishingOpt,
  deleteFinishingOptionAction as deleteFinishingOpt,
  reorderFinishingOptionsAction as reorderFinishingOptions,
} from "../actions";

export function FinishingOptionsTab() {
  interface FinishingOption {
    id: string;
    nama: string;
    urutan_tampilan: number;
    aktif_status: number;
  }

  const [options, setOptions] = useState<FinishingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNama, setEditingNama] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newOptionName, setNewOptionName] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: "warning" | "danger" | "info";
    onConfirm: () => void;
  }>({ show: false, title: "", message: "", type: "danger", onConfirm: () => {} });
  const closeConfirm = () => setConfirmState((s) => ({ ...s, show: false }));

  useEffect(() => {
    loadOptions();
  }, []);

  const loadOptions = async () => {
    try {
      const data = await getFinishingOptionsList();
      setOptions(data as any);
    } catch (error) {
      console.error("Error loading finishing options:", error);
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const handleAdd = async () => {
    if (!newOptionName.trim()) return;

    try {
      await createFinishingOpt({ nama: newOptionName.trim() });
      showMsg("success", "Opsi finishing berhasil ditambahkan");
      setNewOptionName("");
      setIsAdding(false);
      loadOptions();
    } catch (error: any) {
      showMsg("error", error.message || "Gagal menambahkan opsi");
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editingNama.trim()) return;

    try {
      await updateFinishingOpt(id, { nama: editingNama.trim() });
      showMsg("success", "Opsi finishing berhasil diperbarui");
      setEditingId(null);
      setEditingNama("");
      loadOptions();
    } catch (error: any) {
      showMsg("error", error.message || "Gagal memperbarui opsi");
    }
  };

  const handleDelete = (id: string, nama: string) => {
    setConfirmState({
      show: true,
      title: "Hapus Opsi Finishing",
      message: `Hapus opsi finishing "${nama}"?`,
      type: "danger",
      onConfirm: async () => {
        try {
          await deleteFinishingOpt(id);
          showMsg("success", "Opsi finishing berhasil dihapus");
          loadOptions();
        } catch (error: any) {
          showMsg("error", error.message || "Gagal menghapus opsi");
        }
      },
    });
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newOptions = [...options];
    [newOptions[index - 1], newOptions[index]] = [
      newOptions[index],
      newOptions[index - 1],
    ];
    await updateOrder(newOptions);
  };

  const handleMoveDown = async (index: number) => {
    if (index === options.length - 1) return;
    const newOptions = [...options];
    [newOptions[index], newOptions[index + 1]] = [
      newOptions[index + 1],
      newOptions[index],
    ];
    await updateOrder(newOptions);
  };

  const updateOrder = async (newOptions: FinishingOption[]) => {
    try {
      const updates = newOptions.map((opt, index) => ({
        id: opt.id,
        urutan_tampilan: index,
      }));

      await reorderFinishingOptions(updates);
      setOptions(newOptions);
      showMsg("success", "Urutan berhasil diperbarui");
    } catch {
      showMsg("error", "Gagal memperbarui urutan");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-amber-700 to-amber-900 rounded-xl">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Opsi Finishing</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Kelola pilihan finishing untuk produksi
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsAdding(true)}
          className="px-4 py-2 bg-gradient-to-r from-amber-700 to-amber-900 text-white rounded-lg hover:shadow-lg transition-all font-semibold flex items-center gap-2"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Tambah Opsi
        </button>
      </div>

      {/* Add New Form */}
      {isAdding && (
        <div className="bg-amber-50 dark:bg-slate-800 border-2 border-amber-300 dark:border-amber-800/50 rounded-xl p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={newOptionName}
              onChange={(e) => setNewOptionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                } else if (e.key === "Escape") {
                  setIsAdding(false);
                  setNewOptionName("");
                }
              }}
              placeholder="Nama opsi finishing..."
              className="flex-1 px-4 py-2 border-2 border-amber-300 dark:border-amber-800/50 rounded-lg focus:outline-none focus:border-amber-700 dark:bg-slate-800 dark:text-slate-100"
              autoFocus
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-amber-800 text-white rounded-lg hover:bg-amber-900 font-semibold"
            >
              Simpan
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewOptionName("");
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 font-semibold"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Options List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400">Memuat...</div>
        ) : options.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 rounded-xl">
            Belum ada opsi finishing
          </div>
        ) : (
          options.map((option, index) => (
            <div
              key={option.id}
              className="bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-800 rounded-xl p-4 hover:border-amber-400 transition-all"
            >
              <div className="flex items-center gap-3">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-amber-700 dark:text-amber-300 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
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
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === options.length - 1}
                    className="p-1 text-gray-400 hover:text-amber-700 dark:text-amber-300 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
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
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                </div>

                {/* Option name */}
                {editingId === option.id ? (
                  <input
                    type="text"
                    value={editingNama}
                    onChange={(e) => setEditingNama(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleUpdate(option.id);
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                        setEditingNama("");
                      }
                    }}
                    className="flex-1 px-3 py-2 border-2 border-amber-300 dark:border-amber-800/50 rounded-lg focus:outline-none focus:border-amber-700 dark:bg-slate-800 dark:text-slate-100"
                    autoFocus
                  />
                ) : (
                  <div className="flex-1 font-semibold text-gray-800 dark:text-slate-100">
                    {option.nama}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {editingId === option.id ? (
                    <>
                      <button
                        onClick={() => handleUpdate(option.id)}
                        className="px-3 py-1 bg-green-50 dark:bg-slate-8000 text-white rounded-lg hover:bg-green-600 text-sm font-semibold"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditingNama("");
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 text-sm font-semibold"
                      >
                        Batal
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(option.id);
                          setEditingNama(option.nama);
                        }}
                        className="p-2 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-slate-800 rounded-lg"
                        title="Edit"
                      >
                        <svg
                          className="w-5 h-5"
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
                      </button>
                      <button
                        onClick={() => handleDelete(option.id, option.nama)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:bg-red-950/40 rounded-lg"
                        title="Hapus"
                      >
                        <svg
                          className="w-5 h-5"
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
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Notification Toast */}
      {notice && (
        <div
          className={`fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl ${
            notice.type === "success" ? "bg-green-50 dark:bg-slate-8000" : "bg-red-50 dark:bg-red-950/400"
          } text-white font-semibold z-50`}
        >
          {notice.message}
        </div>
      )}
      <DialogKonfirmasi
        show={confirmState.show}
        title={confirmState.title}
        message={confirmState.message}
        confirmText="Ya, Hapus"
        cancelText="Batal"
        onConfirm={() => { confirmState.onConfirm(); closeConfirm(); }}
        onCancel={closeConfirm}
        type={confirmState.type}
      />
    </div>
  );
}

