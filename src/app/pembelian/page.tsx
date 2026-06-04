"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import FormulirPembelian from "@/components/FormulirPembelian";
import TabelPembelian from "@/components/TabelPembelian";
import ModalTambahCepatVendor from "@/components/ModalTambahCepatVendor";
import ModalTambahCepatBarang from "@/components/ModalTambahCepatBarang";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import ToastNotifikasi, {
  NotificationToastProps,
} from "@/components/ToastNotifikasi";
import ModalBayarHutang from "@/components/ModalBayarHutang";
import ModalReturPembelian from "@/components/ModalReturPembelian";
import {
  createVendorAction,
  createMaterialAction,
  createPurchaseAction,
  updatePurchaseAction,
  getInitDataAction,
  getPurchasesAction,
  getMaterialsAction,
  getVendorsAction,
  getCategoriesAction,
  getSubcategoriesAction,
  getUnitsAction,
  voidPurchaseAction,
  createPurchaseReturnAction,
  revertPaymentAction,
  getDebtsAction,
  payDebtAction,
} from "./actions";
import {
  fetchSessionUser,
  getCachedSessionUser,
} from "@/lib/client-session";
import { useCachedData } from "@/lib/use-cached-data";

interface User {
  id: string;
  nama_pengguna: string;
  role: string;
}

type PurchasesInitData = {
  purchases: any[];
  materials: any[];
  vendors: any[];
  categories: any[];
  subcategories: any[];
  units: any[];
};

const EMPTY_INIT_DATA: PurchasesInitData = {
  purchases: [],
  materials: [],
  vendors: [],
  categories: [],
  subcategories: [],
  units: [],
};

export default function PurchasesPage() {
  const router = useRouter();
  const initialUser =
    typeof window !== "undefined"
      ? (getCachedSessionUser() as User | null)
      : null;
  const [currentUser, setCurrentUser] = useState<User | null>(initialUser);

  const {
    data: initData,
    isLoading: initLoading,
    mutate: mutateInit,
  } = useCachedData<PurchasesInitData>("purchases-init", async () => {
    const data = await getInitDataAction();
    return {
      purchases: data.purchases || [],
      materials: data.materials || [],
      vendors: data.vendors || [],
      categories: data.categories || [],
      subcategories: data.subcategories || [],
      units: data.units || [],
    };
  });
  const safeInit = initData ?? EMPTY_INIT_DATA;
  const purchases = safeInit.purchases;
  const materials = safeInit.materials;
  const vendors = safeInit.vendors;
  const categories = safeInit.categories;
  const subcategories = safeInit.subcategories;
  const units = safeInit.units;
  const loading = currentUser === null && initLoading;

  const patchInit = useCallback(
    (partial: Partial<PurchasesInitData>) => {
      void mutateInit(
        (prev) => ({
          ...(prev ?? EMPTY_INIT_DATA),
          ...partial,
        }),
        { revalidate: false }
      );
    },
    [mutateInit]
  );
  const setPurchases = useCallback<
    (next: any[] | ((prev: any[]) => any[])) => void
  >(
    (next) => {
      void mutateInit(
        (prev) => {
          const base = prev ?? EMPTY_INIT_DATA;
          const nextPurchases =
            typeof next === "function"
              ? (next as (p: any[]) => any[])(base.purchases)
              : next;
          return { ...base, purchases: nextPurchases };
        },
        { revalidate: false }
      );
    },
    [mutateInit]
  );
  const setMaterials = (m: any[]) => patchInit({ materials: m });
  const setVendors = (v: any[]) => patchInit({ vendors: v });
  const setCategories = (c: any[]) => patchInit({ categories: c });
  const setSubcategories = (s: any[]) => patchInit({ subcategories: s });
  const setUnits = (u: any[]) => patchInit({ units: u });
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showPayDebtModal, setShowPayDebtModal] = useState(false);
  const [returPurchase, setReturPurchase] = useState<any>(null);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: "warning" | "danger" | "info" | "purchases";
    onConfirm: () => void;
  } | null>(null);

  const formSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await fetchSessionUser();
      if (cancelled) return;
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setCurrentUser({
        id: user.id,
        nama_pengguna: user.nama_pengguna,
        role: user.role,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Handle ESC key to close modals and cancel edit
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingPurchase) {
          setEditingPurchase(null);
        } else if (confirmDialog?.show) {
          setConfirmDialog(null);
        }
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [editingPurchase, confirmDialog]);

  const loadAllData = async () => {
    try {
      await mutateInit();
    } catch (error) {
      console.error("Error loading all data:", error);
    }
  };

  // Keep individual loaders for refresh after operations
  const loadPurchases = async () => {
    try {
      const purchases = await getPurchasesAction();
      setPurchases(purchases || []);
    } catch (error) {
      console.error("Error loading purchases:", error);
    }
  };

  const loadMaterials = async () => {
    try {
      const list = await getMaterialsAction();
      setMaterials(list || []);
    } catch (error) {
      console.error("Error loading materials:", error);
    }
  };

  const loadVendors = async () => {
    try {
      const list = await getVendorsAction();
      setVendors(list || []);
    } catch (error) {
      console.error("Error loading vendors:", error);
    }
  };

  const loadCategories = async () => {
    try {
      const list = await getCategoriesAction();
      setCategories(list || []);
    } catch (error) {
      console.error("Error loading categories:", error);
    }
  };

  const loadSubcategories = async () => {
    try {
      const list = await getSubcategoriesAction();
      setSubcategories(list || []);
    } catch (error) {
      console.error("Error loading subcategories:", error);
    }
  };

  const loadUnits = async () => {
    try {
      const list = await getUnitsAction();
      setUnits(list || []);
    } catch (error) {
      console.error("Error loading units:", error);
    }
  };

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const handleFormSuccess = async (message: string, updatedPurchase?: any) => {
    showMsg("success", message);

    // If editing and we have updated data, update local state
    if (editingPurchase && updatedPurchase) {
      setPurchases((prev: any[]) =>
        prev.map((p) =>
          p.id === updatedPurchase.id ? { ...p, ...updatedPurchase } : p
        )
      );
    } else {
      // For new purchases, reload the list
      await loadPurchases();
    }

    setEditingPurchase(null);

    // Scroll to table after successful add
    if (formSectionRef.current) {
      const tableSection = document.getElementById("purchases-table");
      if (tableSection) {
        tableSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  const handleEdit = (purchase: any) => {
    setEditingPurchase(purchase);

    // Scroll to form
    if (formSectionRef.current) {
      formSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingPurchase(null);
  };

  const handleDelete = (purchase: any) => {
    setConfirmDialog({
      show: true,
      title: "Batalkan Pembelian",
      message: `Yakin ingin membatalkan pembelian "${
        purchase.nomor_faktur
      }"?\n\nVendor: ${
        purchase.vendor_name || "Tanpa Vendor"
      }\nTotal: Rp ${purchase.total_harga.toLocaleString(
        "id-ID"
      )}\n\nTindakan ini akan:\n- Menyimpan dokumen sebagai VOID, bukan menghapus permanen\n- Membuat jurnal pembalik stok dan menandai kas/buku besar sebagai VOID\n- Ditolak jika stok dari pembelian ini sudah terpakai atau tagihan sudah dilunasi\n\nJika ditolak, gunakan Retur/Adjustment atau batalkan transaksi penjualan terkait dulu.`,
      confirmText: "Ya, Batalkan",
      cancelText: "Batal",
      type: "danger",
      onConfirm: async () => {
        try {
          await voidPurchaseAction(
            purchase.id,
            "Pembelian dibatalkan dari Daftar Pembelian"
          );
          await loadPurchases();
          showMsg("success", "Pembelian berhasil dibatalkan.");
        } catch (error: any) {
          console.error("Error deleting purchase:", error);
          showMsg("error", error.message || "Gagal membatalkan pembelian");
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleRevert = (purchase: any) => {
    setConfirmDialog({
      show: true,
      title: "Kembalikan ke Status TAGIHAN",
      message: `Yakin ingin mengembalikan pembelian "${
        purchase.nomor_faktur
      }" ke status TAGIHAN?\n\nVendor: ${
        purchase.vendor_name || "Tanpa Vendor"
      }\nTotal: Rp ${purchase.total_harga.toLocaleString(
        "id-ID"
      )}\n\nTindakan ini akan:\n- Mengubah status pembelian menjadi TAGIHAN\n- Menghapus semua catatan pembayaran tagihan\n- Menghapus catatan keuangan pembayaran\n- Menghitung ulang saldo dan laporan keuangan\n\nGunakan fitur ini jika salah memilih tagihan yang dibayar.`,
      confirmText: "Ya, Kembalikan ke TAGIHAN",
      cancelText: "Batal",
      type: "purchases",
      onConfirm: async () => {
        try {
          await revertPaymentAction(purchase.id);

          // Reload purchases to get updated status
          await loadPurchases();

          showMsg(
            "success",
            "Pembelian berhasil dikembalikan ke status TAGIHAN!"
          );
        } catch (error: any) {
          console.error("Error reverting purchase:", error);
          showMsg(
            "error",
            error.message || "Gagal mengembalikan status pembelian"
          );
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleVendorAdded = async () => {
    showMsg("success", "Vendor berhasil ditambahkan!");
    await loadVendors();
  };

  const handleMaterialAdded = async () => {
    showMsg("success", "Barang berhasil ditambahkan!");
    await loadMaterials();
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        {/* Form Section */}
        <div ref={formSectionRef} className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100 mb-1">
              {editingPurchase ? "Edit Pembelian" : "Tambah Pembelian Baru"}
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {editingPurchase
                ? "Update data pembelian yang sudah ada"
                : "Input data pembelian barang dari vendor atau warung"}
            </p>
          </div>

          <FormulirPembelian
            key={editingPurchase ? editingPurchase.id : "new-purchase"}
            editData={editingPurchase}
            onSuccess={handleFormSuccess}
            onCancel={editingPurchase ? handleCancelEdit : undefined}
            materials={materials}
            vendors={vendors}
            onQuickAddVendor={() => setShowVendorModal(true)}
            onQuickAddMaterial={() => setShowMaterialModal(true)}
            showNotification={(type, message) => setNotice({ type, message })}
            onCreatePurchase={createPurchaseAction}
            onUpdatePurchase={updatePurchaseAction}
          />
        </div>

        {/* Table Section */}
        <div id="purchases-table" className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100 mb-1">
                Daftar Pembelian
              </h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Riwayat semua transaksi pembelian bahan
              </p>
            </div>
            <button
              onClick={() => setShowPayDebtModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg font-semibold hover:from-indigo-600 hover:to-purple-600 transition-all shadow-md hover:shadow-lg"
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
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              Bayar Tagihan
            </button>
          </div>

          <TabelPembelian
            purchases={purchases}
            loading={loading && purchases.length === 0}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onRevert={handleRevert}
            onRetur={(purchase) => setReturPurchase(purchase)}
          />
        </div>
      </div>

      {/* Quick Add Modals */}
      <ModalTambahCepatVendor
        show={showVendorModal}
        onClose={() => setShowVendorModal(false)}
        onSuccess={handleVendorAdded}
        showNotification={(type, message) => setNotice({ type, message })}
        onCreateVendor={createVendorAction}
      />

      <ModalTambahCepatBarang
        show={showMaterialModal}
        onClose={() => setShowMaterialModal(false)}
        onSuccess={handleMaterialAdded}
        categories={categories}
        subcategories={subcategories}
        units={units}
        showNotification={(type, message) => setNotice({ type, message })}
        onCreateMaterial={createMaterialAction}
      />

      {/* Pay Debt Modal */}
      <ModalBayarHutang
        isOpen={showPayDebtModal}
        onClose={() => setShowPayDebtModal(false)}        onSuccess={() => {
          showMsg("success", "Pembayaran tagihan berhasil dicatat!");
          loadPurchases();
        }}
        currentUserId={currentUser?.id || null}
        onGetDebts={getDebtsAction}
        onPayDebt={payDebtAction}
      />

      {/* Retur Vendor Modal */}
      <ModalReturPembelian
        open={!!returPurchase}
        purchase={
          returPurchase
            ? {
                id: returPurchase.id,
                nomor_faktur: returPurchase.nomor_faktur,
                nomor_pembelian: returPurchase.nomor_pembelian,
                items: (returPurchase.items || []).map((it: any) => ({
                  id: it.id,
                  barang_id: it.barang_id,
                  nama_barang: it.nama_barang || it.barang_id,
                  jumlah: Number(it.jumlah || 0),
                  nama_satuan: it.nama_satuan || "",
                  faktor_konversi: Number(it.faktor_konversi || 1),
                  harga_satuan: Number(it.harga_satuan || 0),
                })),
              }
            : null
        }
        onClose={() => setReturPurchase(null)}
        onSubmit={async ({ reason, items }) => {
          await createPurchaseReturnAction({
            purchase_id: returPurchase!.id,
            reason,
            actor_id: currentUser?.id || null,
            items,
          });
          showMsg("success", "Retur ke vendor berhasil dicatat");
          loadPurchases();
        }}
      />

      {/* Confirm Dialog */}
      {confirmDialog && (
        <DialogKonfirmasi
          show={confirmDialog.show}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          cancelText={confirmDialog.cancelText}
          type={confirmDialog.type}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Notification Toast */}
      {notice && (
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}
    </>
  );
}
