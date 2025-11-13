"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import POSCart from "@/components/POSCart";
import PayReceivableModal from "@/components/PayReceivableModal";
import QuickAddCustomerModal from "@/components/QuickAddCustomerModal";
import SalesHistoryTable from "@/components/SalesHistoryTable";
import ConfirmDialog from "@/components/ConfirmDialog";
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";

interface User {
  id: string;
  nama_pengguna: string;
  role: string;
}

interface Customer {
  id: string;
  nama: string;
  member_status: number;
  telepon?: string;
}

interface Material {
  id: string;
  nama: string;
  butuh_dimensi_status: number;
  frekuensi_terjual: number;
  kategori_nama?: string;
  unit_prices: UnitPrice[];
}

interface UnitPrice {
  id: string;
  nama_satuan: string;
  faktor_konversi: number;
  harga_jual: number;
  harga_member: number;
  default_status: number;
}

interface FinishingItem {
  jenis_finishing: string;
  keterangan?: string;
}

interface CartItem {
  barang_id: string;
  barang_nama: string;
  harga_satuan_id: string;
  nama_satuan: string;
  faktor_konversi: number;
  harga_satuan: number;
  jumlah: number;
  panjang?: number;
  lebar?: number;
  butuh_dimensi?: boolean;
  useRounding?: boolean;
  subtotal: number;
  finishing?: FinishingItem[];
}

// Helper function to round dimension to nearest roll size
function getRoundedDimensions(
  panjang: number,
  lebar: number,
  useRounding: boolean
): { panjang: number; lebar: number } {
  if (!useRounding) {
    return { panjang, lebar };
  }

  // Get roll sizes from localStorage
  let rollSizes: number[] = [];
  try {
    const stored = localStorage.getItem("rollSizes");
    rollSizes = stored ? JSON.parse(stored) : [0.5, 1, 1.5, 2, 2.5, 3];
  } catch {
    rollSizes = [0.5, 1, 1.5, 2, 2.5, 3];
  }

  // Sort to ensure ascending order
  rollSizes.sort((a, b) => a - b);

  // Determine smaller dimension
  const smallerDim = Math.min(panjang, lebar);
  const largerDim = Math.max(panjang, lebar);

  // Find the nearest roll size (round up)
  let roundedSmaller = smallerDim;
  for (const size of rollSizes) {
    if (size >= smallerDim) {
      roundedSmaller = size;
      break;
    }
  }

  // If smallerDim is larger than the largest roll size, use the largest
  if (
    roundedSmaller === smallerDim &&
    smallerDim > rollSizes[rollSizes.length - 1]
  ) {
    roundedSmaller = rollSizes[rollSizes.length - 1];
  }

  // Return with the same order (panjang, lebar)
  if (panjang < lebar) {
    return { panjang: roundedSmaller, lebar: largerDim };
  } else {
    return { panjang: largerDim, lebar: roundedSmaller };
  }
}

export default function POSPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sales, setSales] = useState<any[]>([]);

  // Cart & Transaction State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(
    null
  );
  const [selectedUnit, setSelectedUnit] = useState<UnitPrice | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [panjang, setPanjang] = useState("");
  const [lebar, setLebar] = useState("");
  const [useRounding, setUseRounding] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [jumlahBayar, setJumlahBayar] = useState("");
  const [prioritas, setPrioritas] = useState<"NORMAL" | "KILAT">("NORMAL");

  // Modals
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showReceivableModal, setShowReceivableModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);

  // Search states
  const [customerSearch, setCustomerSearch] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(-1);

  const customerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node)
      ) {
        setShowCustomerDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedMaterial && selectedMaterial.unit_prices.length > 0) {
      const defaultUnit = selectedMaterial.unit_prices.find(
        (u) => u.default_status === 1
      );
      setSelectedUnit(defaultUnit || selectedMaterial.unit_prices[0]);
    }
  }, [selectedMaterial]);

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
    try {
      const res = await fetch("/api/pos/init-data");
      const data = await res.json();

      if (res.ok) {
        setCustomers(data.customers || []);
        setMaterials(data.materials || []);
        setSales(data.sales || []);
      } else {
        console.error("Error loading data:", data.error);
      }
    } catch (error) {
      console.error("Error loading all data:", error);
    }
    setLoading(false);
  };

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const filteredCustomers = customers.filter((c) =>
    c.nama.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const filteredMaterials = materials.filter((m) =>
    m.nama.toLowerCase().includes(materialSearch.toLowerCase())
  );

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.nama);
    setShowCustomerDropdown(false);
    setSelectedCustomerIndex(-1);
  };

  const handleCustomerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showCustomerDropdown || filteredCustomers.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedCustomerIndex((prev) =>
          prev < filteredCustomers.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedCustomerIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedCustomerIndex >= 0) {
          handleSelectCustomer(filteredCustomers[selectedCustomerIndex]);
        }
        break;
      case "Escape":
        setShowCustomerDropdown(false);
        setSelectedCustomerIndex(-1);
        break;
    }
  };

  const handleSelectMaterial = (material: Material) => {
    setSelectedMaterial(material);
    setMaterialSearch(material.nama);
    setPanjang("");
    setLebar("");
    setQuantity("1");

    // Auto-select default unit if available
    const defaultUnit = material.unit_prices.find(
      (u) => u.default_status === 1
    );
    if (defaultUnit) {
      setSelectedUnit(defaultUnit);
    } else if (material.unit_prices.length > 0) {
      setSelectedUnit(material.unit_prices[0]);
    }
  };

  const handleAddToCart = () => {
    if (!selectedMaterial || !selectedUnit) {
      showMsg("error", "Pilih barang dan satuan terlebih dahulu");
      return;
    }

    let finalQuantity = parseFloat(quantity);
    let originalPanjang: number | undefined;
    let originalLebar: number | undefined;

    if (selectedMaterial.butuh_dimensi_status === 1) {
      const p = parseFloat(panjang);
      const l = parseFloat(lebar);
      if (isNaN(p) || isNaN(l) || p <= 0 || l <= 0) {
        showMsg("error", "Masukkan panjang dan lebar yang valid");
        return;
      }

      // Store original dimensions
      originalPanjang = p;
      originalLebar = l;

      // Apply rounding if enabled
      const { panjang: roundedP, lebar: roundedL } = getRoundedDimensions(
        p,
        l,
        useRounding
      );

      // Calculate quantity using rounded dimensions for pricing
      finalQuantity = roundedP * roundedL;
    } else {
      if (isNaN(finalQuantity) || finalQuantity <= 0) {
        showMsg("error", "Masukkan jumlah yang valid");
        return;
      }
    }

    const hargaPerSatuan = selectedCustomer?.member_status
      ? selectedUnit.harga_member || selectedUnit.harga_jual
      : selectedUnit.harga_jual;

    const subtotal = finalQuantity * hargaPerSatuan;

    const newItem: CartItem = {
      barang_id: selectedMaterial.id,
      barang_nama: selectedMaterial.nama,
      harga_satuan_id: selectedUnit.id,
      nama_satuan: selectedUnit.nama_satuan,
      faktor_konversi: selectedUnit.faktor_konversi,
      harga_satuan: hargaPerSatuan,
      jumlah: finalQuantity,
      subtotal,
      butuh_dimensi: selectedMaterial.butuh_dimensi_status === 1,
      panjang: originalPanjang,
      lebar: originalLebar,
      useRounding: selectedMaterial.butuh_dimensi_status === 1 && useRounding,
    };

    setCart([...cart, newItem]);

    // Reset form
    setSelectedMaterial(null);
    setSelectedUnit(null);
    setMaterialSearch("");
    setQuantity("1");
    setPanjang("");
    setLebar("");
    setUseRounding(false);
  };

  const handleRemoveFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const handleEditFinishing = (index: number, finishing: FinishingItem[]) => {
    const newCart = [...cart];
    newCart[index] = { ...newCart[index], finishing };
    setCart(newCart);
  };

  const handleDeleteSale = async (saleId: string) => {
    try {
      const res = await fetch(`/api/pos/sales/${saleId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal menghapus transaksi" }));
        showMsg("error", data.error || "Gagal menghapus transaksi");
        return;
      }

      const data = await res.json().catch(() => ({ success: true }));

      if (data.success || res.ok) {
        showMsg("success", "Transaksi berhasil dihapus");
        await loadAllData();
      }
    } catch (error) {
      console.error("Error deleting sale:", error);
      showMsg("error", "Terjadi kesalahan saat menghapus transaksi");
    }
  };

  const handleRevertSale = (sale: any) => {
    const currentStatus =
      sale.status_pembayaran === "LUNAS"
        ? "LUNAS (sudah dibayar penuh)"
        : sale.status_pembayaran === "SEBAGIAN"
        ? "SEBAGIAN (masih ada sisa tagihan)"
        : sale.status_pembayaran;

    setConfirmDialog({
      show: true,
      title: "Batalkan Pembayaran Piutang",
      message: `Apakah Anda yakin ingin membatalkan pembayaran piutang untuk transaksi ${
        sale.nomor_invoice
      }?\n\nPelanggan: ${
        sale.pelanggan_nama || "Walk-in"
      }\nTotal Transaksi: Rp ${sale.total_jumlah.toLocaleString(
        "id-ID"
      )}\nStatus Sekarang: ${currentStatus}\n${
        sale.sisa_piutang > 0
          ? `Sisa Tagihan: Rp ${sale.sisa_piutang.toLocaleString("id-ID")}\n`
          : ""
      }\nTindakan ini akan:\n✗ Menghapus SEMUA catatan pembayaran piutang (termasuk pembayaran pertama/parsial)\n✗ Mengembalikan tagihan ke jumlah awal penuh\n✗ Menghapus catatan keuangan dari semua pembayaran\n✗ Menghitung ulang saldo dan laporan\n\n⚠️ PERINGATAN: Fitur ini menghapus SEMUA riwayat pembayaran!\n⚠️ Gunakan hanya jika salah memilih tagihan yang dibayar!\n\nSetelah revert, kasir harus membayar ulang dengan benar dari awal.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch("/api/pos/sales/revert-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sale_id: sale.id,
              dibuat_oleh: currentUser?.id || null,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(
              data.error || "Gagal mengembalikan status penjualan"
            );
          }

          showMsg(
            "success",
            data.message || "Status berhasil dikembalikan ke PIUTANG"
          );
          await loadAllData();
        } catch (error: any) {
          console.error("Error reverting sale:", error);
          showMsg(
            "error",
            error.message || "Gagal mengembalikan status penjualan"
          );
        }
      },
    });
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      showMsg("error", "Keranjang kosong");
      return;
    }

    const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
    const bayar = parseFloat(jumlahBayar) || 0;

    // Validation for payment methods that require full payment
    if (paymentMethod === "NET30") {
      // NET30 doesn't require payment now
    } else if (bayar === 0) {
      showMsg("error", "Masukkan jumlah pembayaran");
      return;
    }

    const kembalian = Math.max(0, bayar - total);
    const kurang = Math.max(0, total - bayar);

    let confirmMsg = `Total: Rp ${total.toLocaleString("id-ID")}\n`;
    confirmMsg += `Metode: ${paymentMethod}\n`;

    if (paymentMethod === "NET30") {
      confirmMsg += `Seluruh tagihan akan menjadi piutang.\n`;
    } else if (bayar > 0) {
      confirmMsg += `Dibayar: Rp ${bayar.toLocaleString("id-ID")}\n`;
      if (kembalian > 0) {
        confirmMsg += `Kembalian: Rp ${kembalian.toLocaleString("id-ID")}\n`;
      } else if (kurang > 0) {
        confirmMsg += `Kurang: Rp ${kurang.toLocaleString("id-ID")}\n`;
      }
    }

    confirmMsg += `\nProses transaksi ini?`;

    setConfirmDialog({
      show: true,
      title: "Konfirmasi Transaksi",
      message: confirmMsg,
      onConfirm: async () => {
        setConfirmDialog(null);
        await processCheckout(total, bayar, kembalian);
      },
    });
  };

  const processCheckout = async (
    total: number,
    bayar: number,
    kembalian: number
  ) => {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pelanggan_id: selectedCustomer?.id || null,
          items: cart,
          total_jumlah: total,
          jumlah_dibayar: paymentMethod === "NET30" ? 0 : bayar,
          jumlah_kembalian: kembalian,
          metode_pembayaran: paymentMethod,
          catatan: catatan.trim() || null,
          kasir_id: currentUser?.id,
          prioritas: prioritas,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        showMsg(
          "success",
          `Transaksi berhasil! Invoice: ${data.sale.nomor_invoice} | SPK: ${data.spk_number}`
        );

        // Print thermal invoice
        try {
          const { printThermalInvoice } = await import("@/lib/thermal-print");

          printThermalInvoice({
            nomor_invoice: data.sale.nomor_invoice,
            tanggal: data.sale.dibuat_pada,
            pelanggan_nama: data.sale.pelanggan_nama,
            pelanggan_telepon: selectedCustomer?.telepon,
            kasir_nama: currentUser?.nama_pengguna || "Kasir",
            items: cart.map((item) => ({
              nama: item.barang_nama,
              jumlah: item.jumlah,
              satuan: item.nama_satuan,
              harga: item.harga_satuan,
              subtotal: item.subtotal,
              dimensi:
                item.panjang && item.lebar
                  ? `${item.panjang} x ${item.lebar} cm`
                  : undefined,
            })),
            total: total,
            jumlah_bayar: bayar,
            kembalian: kembalian,
            metode_pembayaran: paymentMethod,
            catatan: catatan.trim() || undefined,
          });
        } catch (printError) {
          console.error("Error printing invoice:", printError);
        }

        // Reset form
        setCart([]);
        setSelectedCustomer(null);
        setCustomerSearch("");
        setCatatan("");
        setPaymentMethod("CASH");
        setJumlahBayar("");
        setPrioritas("NORMAL");
        setUseRounding(false);

        // Reload data
        await loadAllData();
      } else {
        showMsg("error", data.error || "Gagal memproses transaksi");
      }
    } catch (error: any) {
      console.error("Error processing checkout:", error);
      showMsg("error", "Terjadi kesalahan saat memproses transaksi");
    }
    setLoading(false);
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00afef]"></div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* POS Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Product Selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Selection */}
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl shadow-lg p-6 border border-[#00afef]/30">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-[#00afef]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                Pelanggan
              </h3>

              <div className="relative" ref={customerDropdownRef}>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setShowCustomerDropdown(true);
                    setSelectedCustomerIndex(-1);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onKeyDown={handleCustomerKeyDown}
                  placeholder="Cari atau Walk-in Customer..."
                  className="w-full px-4 py-3 border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef]"
                />

                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute z-10 w-full mt-2 bg-white border-2 border-[#00afef]/30 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {filteredCustomers.map((customer, index) => (
                      <div
                        key={customer.id}
                        onClick={() => handleSelectCustomer(customer)}
                        className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${
                          index === selectedCustomerIndex
                            ? "bg-[#00afef] text-white"
                            : "hover:bg-cyan-50"
                        }`}
                      >
                        <div
                          className={`font-semibold ${
                            index === selectedCustomerIndex
                              ? "text-white"
                              : "text-gray-800"
                          }`}
                        >
                          {customer.nama}
                        </div>
                        {customer.member_status === 1 && (
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              index === selectedCustomerIndex
                                ? "bg-white text-[#00afef]"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            MEMBER
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setShowCustomerModal(true)}
                  className="absolute right-2 top-2 px-3 py-1.5 bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] text-white rounded-md text-sm font-semibold hover:from-[#0d9488] hover:to-[#0891b2] transition-all shadow-md"
                >
                  + Pelanggan Baru
                </button>
              </div>

              {selectedCustomer && (
                <div className="mt-3 p-3 bg-white rounded-lg border-2 border-[#00afef]/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-gray-800">
                        {selectedCustomer.nama}
                      </div>
                      {selectedCustomer.telepon && (
                        <div className="text-sm text-gray-600">
                          {selectedCustomer.telepon}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCustomer(null);
                        setCustomerSearch("");
                      }}
                      className="text-red-500 hover:text-red-700"
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Material Selection */}
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl shadow-lg p-6 border border-[#00afef]/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-[#00afef]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                  Pilih Barang
                </h3>
                <div className="text-xs text-gray-500 bg-cyan-50 px-3 py-1 rounded-full">
                  <svg
                    className="w-3 h-3 inline mr-1"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Populer
                </div>
              </div>

              <div className="space-y-4">
                {/* Search Filter */}
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    value={materialSearch}
                    onChange={(e) => setMaterialSearch(e.target.value)}
                    placeholder="Filter barang..."
                    className="w-full pl-10 pr-4 py-3 border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef]"
                  />
                  {materialSearch && (
                    <button
                      onClick={() => setMaterialSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Material Grid */}
                <div className="max-h-[400px] overflow-y-auto border-2 border-[#00afef]/30 rounded-lg p-2">
                  <div className="grid grid-cols-2 gap-2">
                    {filteredMaterials.map((material) => (
                      <button
                        key={material.id}
                        onClick={() => handleSelectMaterial(material)}
                        className={`p-3 rounded-lg border-2 transition-all text-left ${
                          selectedMaterial?.id === material.id
                            ? "border-[#00afef] bg-cyan-50 shadow-md scale-105"
                            : "border-gray-200 hover:border-[#00afef]/50 hover:bg-cyan-50/50"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div
                            className={`font-bold text-sm truncate ${
                              selectedMaterial?.id === material.id
                                ? "text-[#00afef]"
                                : "text-gray-800"
                            }`}
                          >
                            {material.nama}
                          </div>
                          {material.kategori_nama && (
                            <div className="text-xs text-gray-500 mt-0.5 truncate">
                              {material.kategori_nama}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  {filteredMaterials.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <svg
                        className="w-12 h-12 mx-auto mb-2 opacity-50"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p className="font-semibold">Tidak ada barang</p>
                      <p className="text-sm">Coba ubah kata kunci pencarian</p>
                    </div>
                  )}
                </div>

                {selectedMaterial && (
                  <div className="p-4 bg-white rounded-lg border-2 border-[#00afef]/30 shadow-sm">
                    <div className="font-bold text-gray-800 mb-4">
                      {selectedMaterial.nama}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Left: Material Details & Unit */}
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                            Satuan & Harga
                          </label>
                          <select
                            value={selectedUnit?.id || ""}
                            onChange={(e) => {
                              const unit = selectedMaterial.unit_prices.find(
                                (u) => u.id === e.target.value
                              );
                              setSelectedUnit(unit || null);
                            }}
                            className="w-full px-3 py-2 text-sm border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef]"
                          >
                            {selectedMaterial.unit_prices.map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                {unit.nama_satuan} - Rp{" "}
                                {(selectedCustomer?.member_status
                                  ? unit.harga_member || unit.harga_jual
                                  : unit.harga_jual
                                ).toLocaleString("id-ID")}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Dimensions for materials that need it */}
                        {selectedMaterial.butuh_dimensi_status === 1 && (
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                              Dimensi (m)
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={panjang}
                                  onChange={(e) => setPanjang(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAddToCart();
                                    }
                                  }}
                                  className="w-full px-3 py-2 text-sm border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef]"
                                  placeholder="Panjang"
                                />
                              </div>
                              <div>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={lebar}
                                  onChange={(e) => setLebar(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAddToCart();
                                    }
                                  }}
                                  className="w-full px-3 py-2 text-sm border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef]"
                                  placeholder="Lebar"
                                />
                              </div>
                            </div>

                            {/* Rounding Checkbox - show only when both dimensions have values */}
                            {panjang && lebar && (
                              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={useRounding}
                                  onChange={(e) =>
                                    setUseRounding(e.target.checked)
                                  }
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="font-medium">
                                  Gunakan Pembulatan Ukuran Roll
                                </span>
                              </label>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: Quantity Controls */}
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                            Jumlah
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const current = parseFloat(quantity) || 0;
                                if (current > 0.01) {
                                  setQuantity((current - 1).toString());
                                }
                              }}
                              className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg border-2 border-gray-300 text-gray-700 font-bold transition-colors"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              step={
                                selectedMaterial.butuh_dimensi_status === 1
                                  ? "0.01"
                                  : "1"
                              }
                              value={quantity}
                              onChange={(e) => setQuantity(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddToCart();
                                }
                              }}
                              className="flex-1 px-3 py-2 text-sm text-center border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef] font-semibold"
                              placeholder="1"
                            />
                            <button
                              onClick={() => {
                                const current = parseFloat(quantity) || 0;
                                setQuantity((current + 1).toString());
                              }}
                              className="w-10 h-10 flex items-center justify-center bg-[#00afef] hover:bg-[#0099dd] rounded-lg border-2 border-[#00afef] text-white font-bold transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <button
                          onClick={handleAddToCart}
                          className="w-full py-2.5 bg-gradient-to-r from-[#00afef] to-[#0088cc] text-white rounded-lg font-bold hover:from-[#0099dd] hover:to-[#0077bb] transition-all shadow-md text-sm"
                        >
                          Tambah ke Keranjang
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Cart */}
          <div className="lg:col-span-1">
            <POSCart
              cart={cart}
              paymentMethod={paymentMethod}
              jumlahBayar={jumlahBayar}
              catatan={catatan}
              prioritas={prioritas}
              onRemoveItem={handleRemoveFromCart}
              onPaymentMethodChange={setPaymentMethod}
              onJumlahBayarChange={setJumlahBayar}
              onCatatanChange={setCatatan}
              onPrioritasChange={setPrioritas}
              onCheckout={handleCheckout}
              onEditFinishing={handleEditFinishing}
            />
          </div>
        </div>

        {/* Sales History */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-1">
                Riwayat Penjualan
              </h2>
              <p className="text-sm text-gray-500">
                Riwayat semua transaksi penjualan
              </p>
            </div>
            <button
              onClick={() => setShowReceivableModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white rounded-lg font-semibold hover:from-[#0099dd] hover:to-[#1955ee] transition-all shadow-md hover:shadow-lg"
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
              Terima Piutang
            </button>
          </div>
          <SalesHistoryTable
            sales={sales}
            loading={loading}
            onDelete={handleDeleteSale}
            onRevert={handleRevertSale}
          />
        </div>
      </div>

      {/* Modals */}
      <QuickAddCustomerModal
        show={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        onSuccess={() => {
          showMsg("success", "Pelanggan berhasil ditambahkan!");
          loadAllData();
        }}
        showNotification={showMsg}
      />

      <PayReceivableModal
        isOpen={showReceivableModal}
        onClose={() => setShowReceivableModal(false)}
        onSuccess={() => {
          showMsg("success", "Pembayaran piutang berhasil!");
          loadAllData();
        }}
        currentUserId={currentUser?.id || null}
      />

      {confirmDialog && (
        <ConfirmDialog
          show={confirmDialog.show}
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
          type="pos"
        />
      )}

      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}
    </>
  );
}
