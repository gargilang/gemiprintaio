"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import MainShell from "@/components/MainShell";
import PurchaseForm from "@/components/PurchaseForm";
import PurchaseTable from "@/components/PurchaseTable";
import QuickAddVendorModal from "@/components/QuickAddVendorModal";
import QuickAddMaterialModal from "@/components/QuickAddMaterialModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";

interface User {
  id: string;
  username: string;
  role: string;
}

export default function PurchasesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: "warning" | "danger" | "info";
    onConfirm: () => void;
  } | null>(null);

  const formSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();
  }, []);

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

  const checkAuth = () => {
    const userSession = localStorage.getItem("user");
    if (!userSession) {
      router.push("/auth/login");
      return;
    }
    const user = JSON.parse(userSession);
    setCurrentUser(user);
    loadAllData();
  };

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      loadPurchases(),
      loadMaterials(),
      loadVendors(),
      loadCategories(),
      loadSubcategories(),
      loadUnits(),
    ]);
    setLoading(false);
  };

  const loadPurchases = async () => {
    try {
      const res = await fetch("/api/purchases");
      const data = await res.json();
      if (res.ok) {
        setPurchases(data.purchases || []);
      }
    } catch (error) {
      console.error("Error loading purchases:", error);
    }
  };

  const loadMaterials = async () => {
    try {
      const res = await fetch("/api/materials");
      const data = await res.json();
      if (res.ok) {
        setMaterials(data.barang || []);
      }
    } catch (error) {
      console.error("Error loading materials:", error);
    }
  };

  const loadVendors = async () => {
    try {
      const res = await fetch("/api/vendors");
      const data = await res.json();
      if (res.ok) {
        setVendors(data.vendor || []);
      }
    } catch (error) {
      console.error("Error loading vendors:", error);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await fetch("/api/master/categories");
      const data = await res.json();
      if (res.ok) {
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error("Error loading categories:", error);
    }
  };

  const loadSubcategories = async () => {
    try {
      const res = await fetch("/api/master/subcategories");
      const data = await res.json();
      if (res.ok) {
        setSubcategories(data.subcategories || []);
      }
    } catch (error) {
      console.error("Error loading subcategories:", error);
    }
  };

  const loadUnits = async () => {
    try {
      const res = await fetch("/api/master/units");
      const data = await res.json();
      if (res.ok) {
        setUnits(data.units || []);
      }
    } catch (error) {
      console.error("Error loading units:", error);
    }
  };

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const handleFormSuccess = async (message: string) => {
    showMsg("success", message);
    await loadPurchases();
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
      title: "Hapus Pembelian",
      message: `Yakin ingin menghapus pembelian "${
        purchase.nomor_faktur
      }"?\n\nVendor: ${
        purchase.vendor_name || "Tanpa Vendor"
      }\nTotal: Rp ${purchase.total_harga.toLocaleString(
        "id-ID"
      )}\n\nTindakan ini akan:\n- Mengurangi stok barang yang telah ditambahkan\n- Menghapus catatan keuangan terkait\n\nData tidak dapat dikembalikan!`,
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
      type: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/purchases/${purchase.id}`, {
            method: "DELETE",
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Gagal menghapus pembelian");
          }

          showMsg("success", "Pembelian berhasil dihapus!");
          await loadPurchases();
        } catch (error: any) {
          console.error("Error deleting purchase:", error);
          showMsg("error", error.message || "Gagal menghapus pembelian");
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
      <MainShell>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </MainShell>
    );
  }

  return (
    <MainShell>
      <div className="space-y-8">
        {/* Form Section */}
        <div ref={formSectionRef} className="bg-white rounded-xl shadow-lg p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">
              {editingPurchase ? "Edit Pembelian" : "Tambah Pembelian Baru"}
            </h2>
            <p className="text-sm text-gray-500">
              {editingPurchase
                ? "Update data pembelian yang sudah ada"
                : "Input data pembelian barang dari vendor atau warung"}
            </p>
          </div>

          <PurchaseForm
            editData={editingPurchase}
            onSuccess={handleFormSuccess}
            onCancel={editingPurchase ? handleCancelEdit : undefined}
            materials={materials}
            vendors={vendors}
            onQuickAddVendor={() => setShowVendorModal(true)}
            onQuickAddMaterial={() => setShowMaterialModal(true)}
            showNotification={(type, message) => setNotice({ type, message })}
          />
        </div>

        {/* Table Section */}
        <div id="purchases-table" className="bg-white rounded-xl shadow-lg p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">
              Daftar Pembelian
            </h2>
            <p className="text-sm text-gray-500">
              Riwayat semua transaksi pembelian bahan
            </p>
          </div>

          <PurchaseTable
            purchases={purchases}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* Quick Add Modals */}
      <QuickAddVendorModal
        show={showVendorModal}
        onClose={() => setShowVendorModal(false)}
        onSuccess={handleVendorAdded}
        showNotification={(type, message) => setNotice({ type, message })}
      />

      <QuickAddMaterialModal
        show={showMaterialModal}
        onClose={() => setShowMaterialModal(false)}
        onSuccess={handleMaterialAdded}
        categories={categories}
        subcategories={subcategories}
        units={units}
        showNotification={(type, message) => setNotice({ type, message })}
      />

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
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
        <NotificationToast type={notice.type} message={notice.message} />
      )}
    </MainShell>
  );
}
