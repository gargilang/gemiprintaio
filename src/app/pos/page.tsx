"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  getBillableDimensionsForRoll,
  getRoundedDimensions,
  getStoredRollSizes,
  isRollSizeValidForDimensions,
  suggestCheapestRollSize,
} from "@/lib/roll-size-utils";
import {
  formatPosUnitPrice,
  formatRollCartDetailLine,
  allocateCartLineCharges,
  getCartChargeTotal,
  getRollPrintLength,
  roundUpToThousand,
} from "@/lib/money-rounding";
import POSCart, { type PrintType } from "@/components/POSCart";
import PayReceivableModal from "@/components/PayReceivableModal";
import QuickAddCustomerModal from "@/components/QuickAddCustomerModal";
import SalesHistoryTable from "@/components/SalesHistoryTable";
import ConfirmDialog from "@/components/ConfirmDialog";
import NotificationToast, {
  NotificationToastProps,
} from "@/components/NotificationToast";
import {
  getPOSInitDataAction,
  createSaleAction,
  deleteSaleAction,
  revertSalePaymentAction,
  createCustomerAction,
  getReceivablesAction,
  payReceivableAction,
  getFinishingOptionsAction,
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
  selectedRollSize?: number;
  billedPanjang?: number;
  billedLebar?: number;
  subtotalRaw: number;
  finishing?: FinishingItem[];
}

type POSInitData = {
  customers: Customer[];
  materials: Material[];
  sales: any[];
};

const EMPTY_POS_INIT: POSInitData = {
  customers: [],
  materials: [],
  sales: [],
};

/** Category display order (aligned with default kategori_barang). */
const KATEGORI_ORDER = [
  "Media Cetak",
  "Kertas",
  "Kertas Foto",
  "Merchandise",
  "Substrat UV",
  "Tinta & Consumables",
  "Finishing",
  "Lain-lain",
];

export default function POSPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Data — cached via SWR so it shows up instantly on re-visit.
  const {
    data: posInitData,
    isLoading: posInitLoading,
    mutate: mutatePosInit,
  } = useCachedData<POSInitData>("pos-init", async () => {
    const data = await getPOSInitDataAction();
    return {
      customers: (data.customers as Customer[]) || [],
      materials: (data.materials as Material[]) || [],
      sales: (data.sales as any[]) || [],
    };
  });
  const safePos = posInitData ?? EMPTY_POS_INIT;
  const customers = safePos.customers;
  const materials = safePos.materials;
  const sales = safePos.sales;
  const [refreshing, setRefreshing] = useState(false);
  const historyLoading = (posInitLoading && !posInitData) || refreshing;
  const patchPos = useCallback(
    (partial: Partial<POSInitData>) => {
      void mutatePosInit(
        (prev) => ({ ...(prev ?? EMPTY_POS_INIT), ...partial }),
        { revalidate: false }
      );
    },
    [mutatePosInit]
  );
  const setCustomers = useCallback<
    (next: Customer[] | ((prev: Customer[]) => Customer[])) => void
  >(
    (next) => {
      void mutatePosInit(
        (prev) => {
          const base = prev ?? EMPTY_POS_INIT;
          const updated =
            typeof next === "function"
              ? (next as (p: Customer[]) => Customer[])(base.customers)
              : next;
          return { ...base, customers: updated };
        },
        { revalidate: false }
      );
    },
    [mutatePosInit]
  );
  const setMaterials = (m: Material[]) => patchPos({ materials: m });
  const setSales = useCallback<
    (next: any[] | ((prev: any[]) => any[])) => void
  >(
    (next) => {
      void mutatePosInit(
        (prev) => {
          const base = prev ?? EMPTY_POS_INIT;
          const updated =
            typeof next === "function"
              ? (next as (p: any[]) => any[])(base.sales)
              : next;
          return { ...base, sales: updated };
        },
        { revalidate: false }
      );
    },
    [mutatePosInit]
  );

  // Cart & Transaction State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [roundCartPrices, setRoundCartPrices] = useState(true);
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
  const [selectedRollSize, setSelectedRollSize] = useState<number | null>(null);
  const [editingCartIndex, setEditingCartIndex] = useState<number | null>(null);
  const [rollSizes, setRollSizes] = useState<number[]>(() => getStoredRollSizes());
  const [catatan, setCatatan] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [jumlahBayar, setJumlahBayar] = useState("");
  const [prioritas, setPrioritas] = useState<"NORMAL" | "KILAT">("NORMAL");
  const [printType, setPrintType] = useState<PrintType>("thermal");
  // Walk-in faktur info captured when user picks faktur but no customer is selected
  const [walkInFaktur, setWalkInFaktur] = useState<{
    nama: string;
    kota: string;
  } | null>(null);
  const [showWalkInFakturModal, setShowWalkInFakturModal] = useState(false);
  const [walkInFakturInput, setWalkInFakturInput] = useState({
    nama: "",
    kota: "Bekasi",
  });

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
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState("ALL");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(-1);

  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const productFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedSessionUser();
    if (cached) setCurrentUser(cached as User);

    (async () => {
      const user = await fetchSessionUser();
      if (cancelled) return;
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setCurrentUser(user as User);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
    if (
      !selectedMaterial ||
      editingCartIndex !== null ||
      selectedMaterial.unit_prices.length === 0
    ) {
      return;
    }
    const defaultUnit = selectedMaterial.unit_prices.find(
      (u) => u.default_status === 1
    );
    setSelectedUnit(defaultUnit || selectedMaterial.unit_prices[0]);
  }, [selectedMaterial, editingCartIndex]);

  useEffect(() => {
    setRollSizes(getStoredRollSizes());
  }, []);

  const parsedPanjang = parseFloat(panjang);
  const parsedLebar = parseFloat(lebar);
  const hasValidDimensions =
    !isNaN(parsedPanjang) &&
    !isNaN(parsedLebar) &&
    parsedPanjang > 0 &&
    parsedLebar > 0;

  useEffect(() => {
    if (!useRounding || !hasValidDimensions) {
      setSelectedRollSize(null);
      return;
    }
    setSelectedRollSize(
      suggestCheapestRollSize(parsedPanjang, parsedLebar, rollSizes)
    );
  }, [useRounding, hasValidDimensions, parsedPanjang, parsedLebar, rollSizes]);

  const rollBillingPreview = useMemo(() => {
    if (
      !useRounding ||
      !hasValidDimensions ||
      selectedRollSize == null ||
      !selectedUnit
    ) {
      return null;
    }
    const billed = getBillableDimensionsForRoll(
      parsedPanjang,
      parsedLebar,
      selectedRollSize
    );
    if (!billed) return null;
    const area = billed.panjang * billed.lebar;
    const hargaPerSatuan = selectedCustomer?.member_status
      ? selectedUnit.harga_member || selectedUnit.harga_jual
      : selectedUnit.harga_jual;
    const subtotalRaw = billed.area * hargaPerSatuan;
    return {
      panjang: billed.panjang,
      lebar: billed.lebar,
      area: billed.area,
      usesRotation: billed.usesRotation,
      subtotalRaw,
      hargaPerSatuan,
    };
  }, [
    useRounding,
    hasValidDimensions,
    selectedRollSize,
    parsedPanjang,
    parsedLebar,
    selectedUnit,
    selectedCustomer,
  ]);

  const loadAllData = async () => {
    setRefreshing(true);
    try {
      await mutatePosInit();
    } catch (error) {
      console.error("Error loading all data:", error);
      showMsg("error", "Gagal memuat data POS");
    } finally {
      setRefreshing(false);
    }
  };

  const showMsg = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const filteredCustomers = customers.filter((c) =>
    c.nama.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const materialCategories = useMemo(() => {
    const names = new Set<string>();
    for (const m of materials) {
      if (m.kategori_nama) names.add(m.kategori_nama);
    }
    return [...names].sort((a, b) => {
      const ia = KATEGORI_ORDER.indexOf(a);
      const ib = KATEGORI_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, "id");
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    return materials.filter((m) => {
      if (
        materialCategoryFilter !== "ALL" &&
        m.kategori_nama !== materialCategoryFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        m.nama.toLowerCase().includes(q) ||
        m.kategori_nama?.toLowerCase().includes(q) ||
        false
      );
    });
  }, [materials, materialSearch, materialCategoryFilter]);

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

  const resetProductForm = () => {
    setEditingCartIndex(null);
    setSelectedMaterial(null);
    setSelectedUnit(null);
    setMaterialSearch("");
    setQuantity("1");
    setPanjang("");
    setLebar("");
    setUseRounding(false);
    setSelectedRollSize(null);
  };

  const handleCancelEdit = () => {
    resetProductForm();
  };

  const buildCartItemFromForm = (): CartItem | null => {
    if (!selectedMaterial || !selectedUnit) {
      showMsg("error", "Pilih barang dan satuan terlebih dahulu");
      return null;
    }

    let finalQuantity = parseFloat(quantity);
    let originalPanjang: number | undefined;
    let originalLebar: number | undefined;
    let rollUsed: number | undefined;
    let billedPanjang: number | undefined;
    let billedLebar: number | undefined;

    if (selectedMaterial.butuh_dimensi_status === 1) {
      const p = parseFloat(panjang);
      const l = parseFloat(lebar);
      if (isNaN(p) || isNaN(l) || p <= 0 || l <= 0) {
        showMsg("error", "Masukkan panjang dan lebar yang valid");
        return null;
      }

      originalPanjang = p;
      originalLebar = l;

      let billedP = p;
      let billedL = l;

      if (useRounding) {
        if (selectedRollSize == null) {
          showMsg("error", "Pilih ukuran roll yang dipakai");
          return null;
        }
        if (!isRollSizeValidForDimensions(p, l, selectedRollSize)) {
          showMsg(
            "error",
            "Roll terlalu kecil untuk ukuran cut ini (coba roll lebih besar atau putar orientasi)"
          );
          return null;
        }
        const rounded = getRoundedDimensions(p, l, true, selectedRollSize);
        billedP = rounded.panjang;
        billedL = rounded.lebar;
        rollUsed = rounded.rollSize ?? selectedRollSize;
      }

      billedPanjang = billedP;
      billedLebar = billedL;
      finalQuantity = billedP * billedL;
    } else {
      if (isNaN(finalQuantity) || finalQuantity <= 0) {
        showMsg("error", "Masukkan jumlah yang valid");
        return null;
      }
    }

    const hargaPerSatuan = selectedCustomer?.member_status
      ? selectedUnit.harga_member || selectedUnit.harga_jual
      : selectedUnit.harga_jual;

    const subtotalRaw = finalQuantity * hargaPerSatuan;

    return {
      barang_id: selectedMaterial.id,
      barang_nama: selectedMaterial.nama,
      harga_satuan_id: selectedUnit.id,
      nama_satuan: selectedUnit.nama_satuan,
      faktor_konversi: selectedUnit.faktor_konversi,
      harga_satuan: hargaPerSatuan,
      jumlah: finalQuantity,
      subtotalRaw,
      butuh_dimensi: selectedMaterial.butuh_dimensi_status === 1,
      panjang: originalPanjang,
      lebar: originalLebar,
      useRounding: selectedMaterial.butuh_dimensi_status === 1 && useRounding,
      selectedRollSize: rollUsed,
      billedPanjang: useRounding ? billedPanjang : undefined,
      billedLebar: useRounding ? billedLebar : undefined,
    };
  };

  const handleMaterialGridClick = (material: Material) => {
    if (selectedMaterial?.id === material.id) {
      resetProductForm();
      return;
    }

    setEditingCartIndex(null);
    setSelectedMaterial(material);
    setPanjang("");
    setLebar("");
    setQuantity("1");
    setUseRounding(material.butuh_dimensi_status === 1);
    setSelectedRollSize(null);

    const defaultUnit = material.unit_prices.find(
      (u) => u.default_status === 1
    );
    if (defaultUnit) {
      setSelectedUnit(defaultUnit);
    } else if (material.unit_prices.length > 0) {
      setSelectedUnit(material.unit_prices[0]);
    }
  };

  const handleEditCartItem = (index: number) => {
    const item = cart[index];
    if (!item) return;

    const material = materials.find((m) => m.id === item.barang_id);
    if (!material) {
      showMsg("error", "Barang tidak ditemukan di katalog");
      return;
    }

    const unit =
      material.unit_prices.find((u) => u.id === item.harga_satuan_id) ??
      material.unit_prices.find((u) => u.default_status === 1) ??
      material.unit_prices[0] ??
      null;

    setEditingCartIndex(index);
    setSelectedMaterial(material);
    setSelectedUnit(unit);
    setMaterialSearch(material.nama);

    if (item.butuh_dimensi && item.panjang != null && item.lebar != null) {
      setPanjang(String(item.panjang));
      setLebar(String(item.lebar));
      setUseRounding(item.useRounding ?? false);
      setSelectedRollSize(
        item.useRounding ? (item.selectedRollSize ?? null) : null
      );
      setQuantity("1");
    } else {
      setPanjang("");
      setLebar("");
      setUseRounding(false);
      setSelectedRollSize(null);
      setQuantity(String(item.jumlah));
    }

    requestAnimationFrame(() => {
      productFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  };

  const handleAddToCart = () => {
    const newItem = buildCartItemFromForm();
    if (!newItem) return;

    if (editingCartIndex !== null) {
      setCart((prev) => {
        const next = [...prev];
        next[editingCartIndex] = {
          ...newItem,
          finishing: prev[editingCartIndex]?.finishing,
        };
        return next;
      });
    } else {
      setCart((prev) => [...prev, newItem]);
    }

    resetProductForm();
  };

  const handleRemoveFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
    if (editingCartIndex === index) {
      resetProductForm();
    } else if (editingCartIndex !== null && index < editingCartIndex) {
      setEditingCartIndex(editingCartIndex - 1);
    }
  };

  const handleEditFinishing = (index: number, finishing: FinishingItem[]) => {
    const newCart = [...cart];
    newCart[index] = { ...newCart[index], finishing };
    setCart(newCart);
  };

  const handleDeleteSale = async (saleId: string) => {
    try {
      await deleteSaleAction(saleId);
      showMsg("success", "Transaksi berhasil dihapus");
      await loadAllData();
    } catch (error: any) {
      console.error("Error deleting sale:", error);
      showMsg(
        "error",
        error.message || "Terjadi kesalahan saat menghapus transaksi"
      );
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
          const paymentsDeleted = await revertSalePaymentAction({
            sale_id: sale.id,
          });

          showMsg(
            "success",
            `Status berhasil dikembalikan ke PIUTANG (${paymentsDeleted} pembayaran dihapus)`
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

    // If user wants to print faktur but is a walk-in (no customer selected) and
    // hasn't filled the walk-in info yet, prompt for "Kepada Yth" + "Kota" first.
    const wantsFaktur = printType === "faktur" || printType === "both";
    if (wantsFaktur && !selectedCustomer && !walkInFaktur) {
      setWalkInFakturInput({ nama: "", kota: "Bekasi" });
      setShowWalkInFakturModal(true);
      return;
    }

    const total = getCartChargeTotal(cart, roundCartPrices);
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
    setRefreshing(true);
    try {
      const lineCharges = allocateCartLineCharges(cart, roundCartPrices);
      const saleItems = cart.map((item, index) => ({
        barang_id: item.barang_id,
        harga_satuan_id: item.harga_satuan_id,
        jumlah: item.jumlah,
        nama_satuan: item.nama_satuan,
        faktor_konversi: item.faktor_konversi,
        harga_satuan:
          item.jumlah > 0
            ? lineCharges[index] / item.jumlah
            : item.harga_satuan,
        subtotal: lineCharges[index],
        panjang: item.panjang,
        lebar: item.lebar,
        finishing: item.finishing,
      }));

      const result = await createSaleAction({
        pelanggan_id: selectedCustomer?.id,
        pelanggan_nama_snapshot:
          !selectedCustomer && walkInFaktur?.nama
            ? walkInFaktur.nama
            : undefined,
        pelanggan_kota: walkInFaktur?.kota || undefined,
        items: saleItems,
        total_jumlah: total,
        jumlah_dibayar: paymentMethod === "NET30" ? 0 : bayar,
        jumlah_kembalian: kembalian,
        metode_pembayaran: paymentMethod as
          | "CASH"
          | "TRANSFER"
          | "QRIS"
          | "DEBIT"
          | "DOWN_PAYMENT"
          | "NET30",
        catatan: catatan.trim() || undefined,
        kasir_id: currentUser?.id,
        prioritas: prioritas,
      });

      showMsg(
        "success",
        `Transaksi berhasil! Invoice: ${result.nomor_invoice} | SPK: ${result.spk_number}`
      );

      // Print receipt and/or faktur based on user's choice
      if (printType !== "none") {
        const tanggalIso = new Date().toISOString();

        const buildThermalData = () => ({
          nomor_invoice: result.nomor_invoice,
          tanggal: tanggalIso,
          pelanggan_nama:
            selectedCustomer?.nama || walkInFaktur?.nama || undefined,
          pelanggan_telepon: selectedCustomer?.telepon,
          kasir_nama: currentUser?.nama_pengguna || "Kasir",
          items: cart.map((item, index) => ({
            nama: item.barang_nama,
            jumlah: item.jumlah,
            satuan: item.nama_satuan,
            harga:
              item.jumlah > 0
                ? lineCharges[index] / item.jumlah
                : item.harga_satuan,
            subtotal: lineCharges[index],
            dimensi:
              item.butuh_dimensi && item.panjang && item.lebar
                ? item.useRounding &&
                  item.selectedRollSize != null &&
                  item.billedPanjang != null &&
                  item.billedLebar != null
                  ? formatRollCartDetailLine(item)
                  : `${item.panjang.toFixed(2)} × ${item.lebar.toFixed(2)} m = ${item.jumlah.toFixed(2)} m²`
                : undefined,
          })),
          total: total,
          jumlah_bayar: bayar,
          kembalian: kembalian,
          metode_pembayaran: paymentMethod,
          catatan: catatan.trim() || undefined,
        });

        const buildFakturData = async () => {
          const { formatUkuran } = await import("@/lib/faktur-print");
          const sisa = Math.max(
            0,
            total - (paymentMethod === "NET30" ? 0 : bayar)
          );
          return {
            nomor_invoice: result.nomor_invoice,
            tanggal: tanggalIso,
            pelanggan_nama:
              selectedCustomer?.nama || walkInFaktur?.nama || "",
            kota: walkInFaktur?.kota || "Bekasi",
            items: cart.map((item, index) => ({
              nama: item.barang_nama,
              ukuran:
                item.butuh_dimensi && item.panjang && item.lebar
                  ? item.useRounding &&
                    item.billedPanjang != null &&
                    item.billedLebar != null
                    ? formatUkuran(item.billedPanjang, item.billedLebar)
                    : formatUkuran(item.panjang, item.lebar)
                  : "",
              qty: item.jumlah,
              satuan: item.nama_satuan,
              harga:
                item.jumlah > 0
                  ? lineCharges[index] / item.jumlah
                  : item.harga_satuan,
              jumlah: lineCharges[index],
            })),
            total,
            bayar: paymentMethod === "NET30" ? 0 : bayar,
            sisa,
            catatan: catatan.trim() || undefined,
          };
        };

        try {
          if (printType === "thermal" || printType === "both") {
            const { printThermalInvoice } = await import(
              "@/lib/thermal-print"
            );
            const printed = printThermalInvoice(buildThermalData());
            if (!printed) {
              showMsg(
                "error",
                "Transaksi tersimpan, tetapi struk tidak bisa dibuka. Izinkan pop-up untuk situs ini."
              );
            }
          }
          if (printType === "faktur" || printType === "both") {
            const { printFaktur } = await import("@/lib/faktur-print");
            const fakturData = await buildFakturData();
            const printed = printFaktur(fakturData);
            if (!printed) {
              showMsg(
                "error",
                "Transaksi tersimpan, tetapi faktur tidak bisa dibuka. Izinkan pop-up untuk situs ini."
              );
            }
          }
        } catch (printError) {
          console.error("Error printing invoice:", printError);
          showMsg(
            "error",
            "Transaksi tersimpan, tetapi gagal menyiapkan dokumen untuk dicetak."
          );
        }
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
      setSelectedRollSize(null);
      setRoundCartPrices(true);
      setWalkInFaktur(null);

      // Reload data
      await loadAllData();
    } catch (error: any) {
      console.error("Error processing checkout:", error);
      showMsg("error", "Terjadi kesalahan saat memproses transaksi");
    } finally {
      setRefreshing(false);
    }
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
          <div className="lg:col-span-2 space-y-4">
            {/* Customer Selection */}
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl shadow-lg p-4 sm:p-5 border border-[#00afef]/30">
              <div className="flex items-center gap-3">
                <h3 className="shrink-0 text-base font-bold text-gray-800 flex items-center gap-2 whitespace-nowrap">
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

                <div className="relative flex-1 min-w-0" ref={customerDropdownRef}>
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
                  className="w-full pl-4 pr-36 py-2 text-sm border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef]"
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] text-white rounded-md text-sm font-semibold hover:from-[#0d9488] hover:to-[#0891b2] transition-all shadow-md"
                >
                  + Pelanggan Baru
                </button>
                </div>
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
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl shadow-lg p-4 sm:p-5 border border-[#00afef]/30">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="shrink-0 text-base font-bold text-gray-800 flex items-center gap-2 whitespace-nowrap">
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

                <div className="relative flex-1 min-w-0">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
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
                    className="w-full pl-9 pr-8 py-2 text-sm border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef]"
                  />
                  {materialSearch && (
                    <button
                      type="button"
                      onClick={() => setMaterialSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="shrink-0 text-xs text-gray-500 bg-cyan-50 px-3 py-1 rounded-full whitespace-nowrap">
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

              <div className="space-y-3">
                {/* Quick category filter — horizontal scroll when many categories */}
                {materialCategories.length > 0 && (
                  <div
                    className="overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#00afef]/40"
                    role="group"
                    aria-label="Filter kategori barang"
                  >
                    <div className="flex flex-nowrap gap-2 w-max">
                    <button
                      type="button"
                      onClick={() => setMaterialCategoryFilter("ALL")}
                      className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                        materialCategoryFilter === "ALL"
                          ? "border-[#00afef] bg-[#00afef] text-white shadow-sm"
                          : "border-gray-200 bg-white text-gray-700 hover:border-[#00afef]/50 hover:bg-cyan-50/80"
                      }`}
                    >
                      Semua
                    </button>
                    {materialCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setMaterialCategoryFilter(cat)}
                        className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                          materialCategoryFilter === cat
                            ? "border-[#00afef] bg-[#00afef] text-white shadow-sm"
                            : "border-gray-200 bg-white text-gray-700 hover:border-[#00afef]/50 hover:bg-cyan-50/80"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                    </div>
                  </div>
                )}

                {/* Material grid — limited height; shrinks when item selected so edit form stays visible */}
                <div
                  className={`overflow-y-auto border-2 border-[#00afef]/30 rounded-lg p-2 transition-[max-height] duration-200 ${
                    selectedMaterial ? "max-h-[160px]" : "max-h-[240px]"
                  }`}
                >
                  <div className="grid grid-cols-2 gap-2">
                    {filteredMaterials.map((material) => (
                      <button
                        key={material.id}
                        type="button"
                        title="Klik untuk memilih barang; klik lagi pada barang yang sama untuk membatalkan pilihan"
                        onClick={() => handleMaterialGridClick(material)}
                        className={`cursor-pointer p-3 rounded-lg border-2 transition-all text-left select-none ${
                          selectedMaterial?.id === material.id
                            ? "border-[#00afef] bg-cyan-50 shadow-md scale-[1.02] ring-2 ring-[#00afef]/30"
                            : "border-gray-200 hover:border-[#00afef]/50 hover:bg-cyan-50/50 hover:shadow-sm active:scale-[0.98]"
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
                      <p className="text-sm">
                        Coba ubah pencarian atau pilih kategori lain
                      </p>
                    </div>
                  )}
                </div>

                {selectedMaterial && (
                  <div
                    ref={productFormRef}
                    className={`p-3 bg-white rounded-lg border-2 shadow-sm ${
                      editingCartIndex !== null
                        ? "border-amber-400 ring-2 ring-amber-200/60"
                        : "border-[#00afef]/30"
                    }`}
                  >
                    {editingCartIndex !== null && (
                      <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-amber-200">
                        <p className="text-xs font-semibold text-amber-800">
                          Mengedit item keranjang
                        </p>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-0.5 rounded hover:bg-gray-100"
                        >
                          Batal
                        </button>
                      </div>
                    )}
                    <div className="font-bold text-gray-800 text-sm mb-3">
                      {selectedMaterial.nama}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
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

                            {/* Roll billing — show when both dimensions have values */}
                            {panjang && lebar && (
                              <div className="space-y-2">
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
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: quantity, roll, add button */}
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

                        {selectedMaterial.butuh_dimensi_status === 1 &&
                          useRounding &&
                          hasValidDimensions && (
                            <div className="space-y-1.5">
                              <label className="block text-xs font-semibold text-gray-600">
                                Roll yang dipakai
                              </label>
                              <select
                                value={selectedRollSize ?? ""}
                                onChange={(e) =>
                                  setSelectedRollSize(parseFloat(e.target.value))
                                }
                                className="w-full px-3 py-2 text-sm border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef] bg-white"
                              >
                                {rollSizes
                                  .filter((size) =>
                                    isRollSizeValidForDimensions(
                                      parsedPanjang,
                                      parsedLebar,
                                      size
                                    )
                                  )
                                  .map((size) => {
                                    const billed = getBillableDimensionsForRoll(
                                      parsedPanjang,
                                      parsedLebar,
                                      size
                                    );
                                    if (!billed) return null;
                                    const area = billed.area;
                                    const harga = selectedCustomer?.member_status
                                      ? selectedUnit?.harga_member ||
                                        selectedUnit?.harga_jual ||
                                        0
                                      : selectedUnit?.harga_jual || 0;
                                    const subRaw = area * harga;
                                    const printLen = getRollPrintLength(
                                      billed.panjang,
                                      billed.lebar,
                                      size
                                    );
                                    return (
                                      <option key={size} value={size}>
                                        {size} m
                                        {billed.usesRotation ? " ↻" : ""}
                                        {" — "}
                                        {printLen.toFixed(2)} × Roll{" "}
                                        {size.toFixed(2)} m = {area.toFixed(2)}{" "}
                                        m² @ Rp {formatPosUnitPrice(harga)} · Rp{" "}
                                        {subRaw.toLocaleString("id-ID")}
                                      </option>
                                    );
                                  })}
                              </select>
                              {rollBillingPreview && selectedRollSize != null && (
                                <p className="text-xs text-gray-500 leading-snug">
                                  Tagih:{" "}
                                  <span className="font-semibold text-[#00afef]">
                                    Rp{" "}
                                    {roundUpToThousand(
                                      rollBillingPreview.subtotalRaw
                                    ).toLocaleString("id-ID")}
                                  </span>
                                </p>
                              )}
                            </div>
                          )}

                        <button
                          onClick={handleAddToCart}
                          className={`w-full py-2.5 text-white rounded-lg font-bold transition-all shadow-md text-sm ${
                            editingCartIndex !== null
                              ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"
                              : "bg-gradient-to-r from-[#00afef] to-[#0088cc] hover:from-[#0099dd] hover:to-[#0077bb]"
                          }`}
                        >
                          {editingCartIndex !== null
                            ? "Simpan perubahan"
                            : "Tambah ke Keranjang"}
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
              roundCartPrices={roundCartPrices}
              onRoundCartPricesChange={setRoundCartPrices}
              paymentMethod={paymentMethod}
              jumlahBayar={jumlahBayar}
              catatan={catatan}
              prioritas={prioritas}
              printType={printType}
              onRemoveItem={handleRemoveFromCart}
              editingCartIndex={editingCartIndex}
              onEditItem={handleEditCartItem}
              onPaymentMethodChange={setPaymentMethod}
              onJumlahBayarChange={setJumlahBayar}
              onCatatanChange={setCatatan}
              onPrioritasChange={setPrioritas}
              onPrintTypeChange={setPrintType}
              onCheckout={handleCheckout}
              onEditFinishing={handleEditFinishing}
              onGetFinishingOptions={getFinishingOptionsAction}
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
            loading={historyLoading}
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
        onCreateCustomer={createCustomerAction}
      />

      <PayReceivableModal
        isOpen={showReceivableModal}
        onClose={() => setShowReceivableModal(false)}
        onSuccess={() => {
          showMsg("success", "Pembayaran piutang berhasil!");
          loadAllData();
        }}
        currentUserId={currentUser?.id || null}
        onGetReceivables={getReceivablesAction}
        onPayReceivable={payReceivableAction}
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

      {showWalkInFakturModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-[#00afef] to-[#2266ff] px-5 py-4">
              <h3 className="text-white font-bold text-lg">
                Info untuk Faktur
              </h3>
              <p className="text-white/90 text-xs mt-0.5">
                Pelanggan tidak dipilih. Isi data berikut untuk dicetak di
                faktur.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Kepada Yth.
                </label>
                <input
                  type="text"
                  value={walkInFakturInput.nama}
                  onChange={(e) =>
                    setWalkInFakturInput((prev) => ({
                      ...prev,
                      nama: e.target.value,
                    }))
                  }
                  placeholder="Nama / nama perusahaan"
                  className="w-full px-3 py-2 bg-white text-black border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Kota
                </label>
                <input
                  type="text"
                  value={walkInFakturInput.kota}
                  onChange={(e) =>
                    setWalkInFakturInput((prev) => ({
                      ...prev,
                      kota: e.target.value,
                    }))
                  }
                  placeholder="Bekasi"
                  className="w-full px-3 py-2 bg-white text-black border-2 border-gray-300 rounded-lg focus:outline-none focus:border-[#00afef]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWalkInFakturModal(false)}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWalkInFaktur({
                      nama: walkInFakturInput.nama.trim(),
                      kota: walkInFakturInput.kota.trim() || "Bekasi",
                    });
                    setShowWalkInFakturModal(false);
                    // re-trigger checkout now that the info is captured
                    setTimeout(() => handleCheckout(), 0);
                  }}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#00afef] to-[#2266ff] text-white font-bold hover:from-[#0099dd] hover:to-[#1955ee]"
                >
                  Lanjut Bayar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <NotificationToast type={notice.type} message={notice.message} />
      )}
    </>
  );
}
