"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useClickOutside } from "@/hooks/useClickOutside";

interface FinishingItem {
  jenis_finishing: string;
  keterangan?: string;
}

interface FinishingOption {
  id: string;
  nama: string;
  urutan_tampilan: number;
}

interface AddFinishingModalProps {
  onClose: () => void;
  onAdd: (finishing: FinishingItem[]) => void;
  existingFinishing?: FinishingItem[];
  itemName: string;
}

export default function AddFinishingModal({
  onClose,
  onAdd,
  existingFinishing = [],
  itemName,
}: AddFinishingModalProps) {
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);
  const [finishingList, setFinishingList] = useState<FinishingItem[]>(
    existingFinishing.length > 0 ? existingFinishing : []
  );
  const [selectedType, setSelectedType] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [finishingOptions, setFinishingOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Click outside to close
  useClickOutside(modalRef, onClose);

  useEffect(() => {
    loadFinishingOptions();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        // If in add form and has selected type, add finishing
        if (selectedType && document.activeElement?.tagName !== "BUTTON") {
          e.preventDefault();
          handleAddFinishing();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedType, onClose]);

  const loadFinishingOptions = async () => {
    try {
      const { getFinishingOptions } = await import(
        "@/lib/services/finishing-options-service"
      );
      const options = await getFinishingOptions();
      setFinishingOptions(options.map((opt) => opt.nama));
    } catch (error) {
      console.error("Error loading finishing options:", error);
      // Fallback to default options
      setFinishingOptions([
        "Laminating Glossy",
        "Laminating Doff",
        "Cutting",
        "Mounting",
        "Finishing Standar",
        "Jahit Obras",
        "Pasang Ring",
        "Lainnya",
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFinishing = () => {
    if (!selectedType) return;

    const newFinishing: FinishingItem = {
      jenis_finishing: selectedType,
      keterangan: keterangan.trim() || undefined,
    };

    setFinishingList([...finishingList, newFinishing]);
    setSelectedType("");
    setKeterangan("");
  };

  const handleRemoveFinishing = (index: number) => {
    setFinishingList(finishingList.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onAdd(finishingList);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden"
      >
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-amber-700 to-amber-900">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
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
                  d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                />
              </svg>
              Tambah Finishing
            </h3>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
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
          <p className="text-white/90 text-sm mt-2">{itemName}</p>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Add Finishing Form */}
          <div className="space-y-4 mb-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Jenis Finishing
                </label>
                <button
                  type="button"
                  onClick={() =>
                    router.push("/settings?tab=setup&subtab=finishing")
                  }
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                >
                  Kelola
                </button>
              </div>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700 focus:border-amber-700 disabled:opacity-50"
              >
                <option value="">
                  {loading ? "Loading..." : "Pilih Finishing..."}
                </option>
                {finishingOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Keterangan (Opsional)
              </label>
              <input
                type="text"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Contoh: A3, Besar, dll"
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700 focus:border-amber-700"
              />
            </div>

            <button
              onClick={handleAddFinishing}
              disabled={!selectedType}
              className="w-full px-4 py-2 bg-gradient-to-r from-amber-700 to-amber-900 text-white rounded-lg hover:shadow-lg transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
              Tambah Finishing
            </button>
          </div>

          {/* Finishing List */}
          {finishingList.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                Finishing yang ditambahkan:
              </h4>
              <div className="space-y-2">
                {finishingList.map((fin, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-amber-50 px-4 py-3 rounded-lg border border-amber-200"
                  >
                    <div>
                      <div className="font-semibold text-gray-900">
                        {fin.jenis_finishing}
                      </div>
                      {fin.keterangan && (
                        <div className="text-sm text-gray-600">
                          {fin.keterangan}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveFinishing(index)}
                      className="text-red-600 hover:bg-red-100 p-2 rounded-lg transition-colors"
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
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-semibold"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-gradient-to-r from-amber-700 to-amber-900 text-white rounded-lg hover:shadow-lg transition-all font-semibold"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
