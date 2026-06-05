"use client";

import { useState, useEffect } from "react";

export function RollSizesTab() {
  const [rollSizes, setRollSizes] = useState<number[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newSize, setNewSize] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    // Load from localStorage or use defaults
    const stored = localStorage.getItem("rollSizes");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setRollSizes(parsed);
      } catch {
        const defaults = [0.5, 1, 1.5, 2, 2.5, 3];
        setRollSizes(defaults);
        localStorage.setItem("rollSizes", JSON.stringify(defaults));
      }
    } else {
      const defaults = [0.5, 1, 1.5, 2, 2.5, 3];
      setRollSizes(defaults);
      localStorage.setItem("rollSizes", JSON.stringify(defaults));
    }
  }, []);

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const saveToLocalStorage = (sizes: number[]) => {
    const sorted = [...sizes].sort((a, b) => a - b);
    localStorage.setItem("rollSizes", JSON.stringify(sorted));
    setRollSizes(sorted);
  };

  const handleAdd = () => {
    const size = parseFloat(newSize);
    if (isNaN(size) || size <= 0) {
      showMsg("error", "Ukuran harus berupa angka positif");
      return;
    }
    if (rollSizes.includes(size)) {
      showMsg("error", "Ukuran sudah ada");
      return;
    }
    saveToLocalStorage([...rollSizes, size]);
    showMsg("success", "Roll size berhasil ditambahkan");
    setNewSize("");
    setIsAdding(false);
  };

  const handleUpdate = (index: number) => {
    const size = parseFloat(editingValue);
    if (isNaN(size) || size <= 0) {
      showMsg("error", "Ukuran harus berupa angka positif");
      return;
    }
    if (rollSizes.some((s, i) => i !== index && s === size)) {
      showMsg("error", "Ukuran sudah ada");
      return;
    }
    const newSizes = [...rollSizes];
    newSizes[index] = size;
    saveToLocalStorage(newSizes);
    showMsg("success", "Roll size berhasil diperbarui");
    setEditingIndex(null);
    setEditingValue("");
  };

  const handleDelete = (index: number, size: number) => {
    if (!confirm(`Hapus roll size ${size}m?`)) return;
    const newSizes = rollSizes.filter((_, i) => i !== index);
    saveToLocalStorage(newSizes);
    showMsg("success", "Roll size berhasil dihapus");
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newSizes = [...rollSizes];
    [newSizes[index - 1], newSizes[index]] = [
      newSizes[index],
      newSizes[index - 1],
    ];
    saveToLocalStorage(newSizes);
  };

  const handleMoveDown = (index: number) => {
    if (index === rollSizes.length - 1) return;
    const newSizes = [...rollSizes];
    [newSizes[index], newSizes[index + 1]] = [
      newSizes[index + 1],
      newSizes[index],
    ];
    saveToLocalStorage(newSizes);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl">
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
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Ukuran Roll</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Kelola ukuran roll untuk rounding kalkulasi POS
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
          className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
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
          Tambah Ukuran Roll
        </button>
      </div>

      {/* Notice */}
      {notice && (
        <div
          className={`p-4 rounded-xl border-2 ${
            notice.type === "success"
              ? "bg-green-50 dark:bg-green-950/40 border-green-300 dark:border-green-800/50 text-green-800 dark:text-green-200"
              : "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800/50 text-red-800 dark:text-red-200"
          }`}
        >
          {notice.message}
        </div>
      )}

      {/* Add New Form */}
      {isAdding && (
        <div className="bg-blue-50 dark:bg-slate-800 border-2 border-blue-300 dark:border-slate-700 rounded-xl p-4">
          <div className="flex gap-3">
            <input
              type="number"
              step="0.1"
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                } else if (e.key === "Escape") {
                  setIsAdding(false);
                  setNewSize("");
                }
              }}
              placeholder="Ukuran roll (meter)..."
              className="flex-1 px-4 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 dark:bg-slate-800 dark:text-slate-100"
              autoFocus
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
            >
              Simpan
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewSize("");
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-300 font-semibold"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Roll Sizes List */}
      <div className="space-y-2">
        {rollSizes.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 rounded-xl">
            Belum ada roll size
          </div>
        ) : (
          rollSizes.map((size, index) => (
            <div
              key={index}
              className="bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-800 rounded-xl p-4 hover:border-blue-400 transition-all"
            >
              <div className="flex items-center gap-3">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-blue-600 dark:text-blue-300 disabled:opacity-30 disabled:cursor-not-allowed"
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
                    disabled={index === rollSizes.length - 1}
                    className="p-1 text-gray-400 hover:text-blue-600 dark:text-blue-300 disabled:opacity-30 disabled:cursor-not-allowed"
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

                {/* Size value */}
                {editingIndex === index ? (
                  <input
                    type="number"
                    step="0.1"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleUpdate(index);
                      } else if (e.key === "Escape") {
                        setEditingIndex(null);
                        setEditingValue("");
                      }
                    }}
                    className="flex-1 px-3 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 dark:bg-slate-800 dark:text-slate-100"
                    autoFocus
                  />
                ) : (
                  <div className="flex-1 font-semibold text-gray-800 dark:text-slate-100">
                    {size} meter
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {editingIndex === index ? (
                    <>
                      <button
                        onClick={() => handleUpdate(index)}
                        className="px-3 py-1 bg-green-50 dark:bg-slate-8000 text-white rounded-lg hover:bg-green-600 text-sm font-semibold"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => {
                          setEditingIndex(null);
                          setEditingValue("");
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
                          setEditingIndex(index);
                          setEditingValue(size.toString());
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
                        onClick={() => handleDelete(index, size)}
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
    </div>
  );
}

