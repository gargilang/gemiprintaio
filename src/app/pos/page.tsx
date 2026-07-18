"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  getNestedRollBilling,
  getRoundedDimensions,
  getStoredRollSizes,
  suggestCheapestRollSize,
} from "@/lib/roll-size-utils";
import {
  formatPosUnitPrice,
  formatRollCartDetailLine,
  allocateCartLineCharges,
  getCartChargeTotal,
  roundUpToThousand,
} from "@/lib/money-rounding";
import BarRingkasKeranjang from "@/components/pos/BarRingkasKeranjang";
import DropdownFinishing from "@/components/pos/DropdownFinishing";
import OverlayKeranjang, { type PrintType } from "@/components/pos/OverlayKeranjang";
import ModalBayarPiutang from "@/components/ModalBayarPiutang";
import ModalTambahCepatPelanggan from "@/components/ModalTambahCepatPelanggan";

import ModalEditHarga from "@/components/ModalEditHarga";
import ModalTambahItemLainnya, {
  type TambahItemLainnyaValue,
} from "./ModalTambahItemLainnya";
import ModalRincianInternalMaklon from "./ModalRincianInternalMaklon";
import ModalParkirKeranjang from "./ModalParkirKeranjang";
import PpnFakturModal, {
  type PpnFakturData,
} from "@/components/PpnFakturModal";
import TabelRiwayatPenjualan from "@/components/TabelRiwayatPenjualan";
import DialogKonfirmasi from "@/components/DialogKonfirmasi";
import ModalFakturUmum from "./ModalFakturUmum";
import ToastNotifikasi, {
  NotificationToastProps,
} from "@/components/ToastNotifikasi";
import {
  getPOSInitDataAction,
  getPopularItemsAction,
  createSaleAction,
  voidSaleAction,
  revertSalePaymentAction,
  createPelangganAction,
  getReceivablesAction,
  payReceivableAction,
  getFinishingOptionsAction,
} from "./actions";
import {
  parkCartAction,
  listParkedCartsAction,
  loadParkedCartAction,
  deleteParkedCartAction,
  markFinalAction,
  jadikanPenawaranAction,
} from "./keranjang-tersimpan-actions";
import type { ParkedCart } from "@/lib/services/keranjang-tersimpan-service";
import type { QuotationItemInput } from "@/lib/services/quotation-service";
import {
  createKatalogMaklonAction,
  getKategoriBarangAction,
} from "@/app/katalog-maklon/actions";
import { fetchSessionUser, getCachedSessionUser } from "@/lib/client-session";
import { useCachedData, useInvalidate } from "@/lib/use-cached-data";
import {
  ID_BARANG_PLACEHOLDER_MAKLON,
  ID_HARGA_PLACEHOLDER_MAKLON,
} from "@/lib/barang-placeholder";
import { getReferensiUnitPrice } from "@/lib/barang-unit-utils";
import {
  formatDimensiBarisThermal,
  mapPenjualanItemKeFaktur,
  qtySatuanCetakPenjualan,
} from "@/lib/dokumen-item-display";
import {
  type User,
  type Customer,
  type Material,
  type UnitPrice,
  type FinishingItem,
  type CartItem,
  type BiayaTambahanItem,
  type SubkontraktorOption,
  type POSInitData,
  type ProdukJualFlat,
  EMPTY_POS_INIT,
  KATEGORI_ORDER,
} from "./pos-types";

/** Kumpulkan baris biaya tambahan valid dari semua item keranjang. */
function getCartBiayaTambahanRows(cart: CartItem[]): BiayaTambahanItem[] {
  return cart.flatMap((item) =>
    (item.biaya_tambahan || []).filter((b) => b.label.trim() && b.nominal > 0),
  );
}

function getCartBiayaTambahanTotal(cart: CartItem[]): number {
  return getCartBiayaTambahanRows(cart).reduce((sum, b) => sum + b.nominal, 0);
}

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
      subkontraktor:
        (data.subkontraktor as SubkontraktorOption[] | undefined) || [],
      katalogMaklon: data.katalogMaklon ?? [],
    };
  });
  const safePos = posInitData ?? EMPTY_POS_INIT;
  const customers = safePos.customers ?? [];

  // Status PKP toko — menentukan apakah tombol Faktur Pajak (PPN) boleh muncul.
  // Penjual non-PKP secara aturan tidak boleh menerbitkan faktur pajak, jadi
  // tombolnya disembunyikan sampai toko diaktifkan PKP di Pengaturan → PPN.
  const { data: statusPkpData } = useCachedData<number>(
    "pos-status-pkp",
    async () => {
      const { getShopSettingsAction } =
        await import("@/app/pengaturan/actions");
      const s = await getShopSettingsAction();
      return Number(s?.status_pkp) === 1 ? 1 : 0;
    },
  );
  const tokoPkp = statusPkpData === 1;

  const invalidate = useInvalidate();

  const { data: shopSettingsData } = useCachedData(
    "pos-shop-settings",
    async () => {
      const { getShopSettingsAction } =
        await import("@/app/pengaturan/actions");
      const s = await getShopSettingsAction();
      return {
        nama_toko: s.nama_toko,
        slogan: s.slogan,
        alamat: s.alamat,
        telepon: s.telepon,
        email: s.email,
        website: s.website,
        bank_nama: s.bank_nama,
        bank_nomor: s.bank_nomor,
        bank_atas_nama: s.bank_atas_nama,
        catatan_faktur: s.catatan_faktur,
        npwp: s.npwp,
        alamat_npwp: s.alamat_npwp,
      };
    },
  );
  const shopSettings = shopSettingsData ?? undefined;

  // Stabilkan referensi array yang dipakai di useMemo (hindari dep berubah tiap render).
  const materials = useMemo(() => safePos.materials ?? [], [safePos.materials]);
  const sales = safePos.sales ?? [];
  // Cache localStorage versi pre-maklon bisa hydrate posInitData tanpa field
  // subkontraktor — fallback ke array kosong sampai SWR re-fetch.
  const subkontraktor = useMemo(
    () => safePos.subkontraktor ?? [],
    [safePos.subkontraktor],
  );
  const katalogMaklon = useMemo(
    () => safePos.katalogMaklon ?? [],
    [safePos.katalogMaklon],
  );
  // C5: data popularitas item (auto-compute 30 hari + manual override).
  // Fallback null aman — sortPopuler OFF bawaan, sort tidak diaktifkan.
  const { data: popularData } = useCachedData<{
    barangUnitPriceIds: Set<string>;
    katalogMaklonIds: Set<string>;
  } | null>("pos-populer-v1", getPopularItemsAction);

  const { data: kategoriBarangData } = useCachedData(
    "kategori-barang",
    getKategoriBarangAction,
  );
  const kategoriBarangOptions = useMemo(
    () => kategoriBarangData ?? [],
    [kategoriBarangData],
  );
  const [refreshing, setRefreshing] = useState(false);
  const historyLoading = (posInitLoading && !posInitData) || refreshing;
  const patchPos = useCallback(
    (partial: Partial<POSInitData>) => {
      void mutatePosInit(
        (prev) => ({ ...(prev ?? EMPTY_POS_INIT), ...partial }),
        { revalidate: false },
      );
    },
    [mutatePosInit],
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
        { revalidate: false },
      );
    },
    [mutatePosInit],
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
        { revalidate: false },
      );
    },
    [mutatePosInit],
  );

  // Cart & Transaction State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [roundCartPrices, setRoundCartPrices] = useState(true);
  const [selectedPelanggan, setSelectedPelanggan] = useState<Customer | null>(
    null,
  );
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(
    null,
  );
  const [selectedUnit, setSelectedUnit] = useState<UnitPrice | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [panjang, setPanjang] = useState("");
  const [lebar, setLebar] = useState("");
  const [useRounding, setUseRounding] = useState(false);
  const [selectedRollSize, setSelectedRollSize] = useState<number | null>(null);
  const [editingCartIndex, setEditingCartIndex] = useState<number | null>(null);
  const [showOverlayKeranjang, setShowOverlayKeranjang] = useState(false);
  const [rollSizes, setRollSizes] = useState<number[]>(() =>
    getStoredRollSizes(),
  );
  const [catatan, setCatatan] = useState("");
  // State finishing dan harga override untuk barang yang sedang dipilih di form
  const [formFinishing, setFormFinishing] = useState<FinishingItem[]>([]);
  const [finishingOptions, setFinishingOptions] = useState<string[]>([]);
  const [formCatatanItem, setFormCatatanItem] = useState("");
  const [formHargaSatuan, setFormHargaSatuan] = useState<number | null>(null);
  const [showFormHargaModal, setShowFormHargaModal] = useState(false);
  const [formBiayaTambahan, setFormBiayaTambahan] = useState<
    BiayaTambahanItem[]
  >([]);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [jumlahBayar, setJumlahBayar] = useState("");
  const [prioritas, setPrioritas] = useState<"NORMAL" | "KILAT">("NORMAL");
  const [printType, setPrintType] = useState<PrintType>("thermal");
  // Info faktur pelanggan umum yang ditangkap saat pengguna pilih faktur tapi belum memilih pelanggan
  const [fakturUmum, setFakturUmum] = useState<{
    nama: string;
    kota: string;
  } | null>(null);
  const [showFakturUmumModal, setShowFakturUmumModal] = useState(false);
  const [fakturUmumInput, setFakturUmumInput] = useState({
    nama: "",
    kota: "Bekasi",
  });

  // Modals
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showReceivableModal, setShowReceivableModal] = useState(false);
  const [showTambahItemLainnya, setShowTambahItemLainnya] = useState(false);
  const [editingRincianInternalIndex, setEditingRincianInternalIndex] =
    useState<number | null>(null);
  const [showParkirModal, setShowParkirModal] = useState(false);
  const [parkedCarts, setParkedCarts] = useState<ParkedCart[]>([]);
  const [loadedParkedId, setLoadedParkedId] = useState<string | null>(null);
  const [showPpnModal, setShowPpnModal] = useState(false);
  // PPN data untuk transaksi yang sedang disusun. Null = tidak kena PPN.
  const [ppnFaktur, setPpnFaktur] = useState<PpnFakturData | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [notice, setNotice] = useState<NotificationToastProps | null>(null);

  // Search states
  const [pencarianPelanggan, setPencarianPelanggan] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState("ALL");
  // C5: toggle sort Populer (bukan filter — item populer didorong ke depan).
  const [sortPopuler, setSortPopuler] = useState(false);
  const [showDropdownPelanggan, setShowDropdownPelanggan] = useState(false);
  const [indexPelangganTerpilih, setIndexPelangganTerpilih] = useState(-1);

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
        setShowDropdownPelanggan(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    // Default: roll dengan total area terkecil (termurah) dengan
    // memperhitungkan nesting jumlah lembar. Fallback ke rumus lama bila tak
    // ada roll yang cukup untuk jumlah ini.
    const pieceCount = Math.max(1, Math.round(parseFloat(quantity) || 1));
    let bestRoll: number | null = null;
    let bestArea = Infinity;
    for (const size of rollSizes) {
      const nest = getNestedRollBilling(
        parsedPanjang,
        parsedLebar,
        pieceCount,
        size,
      );
      if (nest && nest.totalAreaRoll < bestArea) {
        bestArea = nest.totalAreaRoll;
        bestRoll = size;
      }
    }
    setSelectedRollSize(
      bestRoll ??
        suggestCheapestRollSize(parsedPanjang, parsedLebar, rollSizes),
    );
  }, [
    useRounding,
    hasValidDimensions,
    parsedPanjang,
    parsedLebar,
    rollSizes,
    quantity,
  ]);

  // Muat opsi finishing sekali saat mount — tidak bergantung pada selectedMaterial
  // agar Katalog Extra yang dibuka pertama dalam sesi pun mendapat opsi yang benar.
  useEffect(() => {
    getFinishingOptionsAction()
      .then((opts) => setFinishingOptions(opts.map((o) => o.nama)))
      .catch(() => {});
  }, []);  

  const rollBillingPreview = useMemo(() => {
    if (
      !useRounding ||
      !hasValidDimensions ||
      selectedRollSize == null ||
      !selectedUnit
    ) {
      return null;
    }
    const pieceCount = Math.max(1, Math.round(parseFloat(quantity) || 1));
    // Billing nesting-aware: memperhitungkan berapa lembar muat berdampingan di
    // lebar roll (matematika disembunyikan dari kasir; harga saja yang tampil).
    const nest = getNestedRollBilling(
      parsedPanjang,
      parsedLebar,
      pieceCount,
      selectedRollSize,
    );
    if (!nest) return null;
    const hargaPerSatuan = selectedPelanggan?.member_status
      ? selectedUnit.harga_member || selectedUnit.harga_jual
      : selectedUnit.harga_jual;
    const subtotalRaw = nest.totalAreaRoll * hargaPerSatuan;
    return {
      nest,
      panjang: nest.totalPanjangRoll,
      lebar: selectedRollSize,
      area: nest.totalAreaRoll,
      usesRotation: nest.usesRotation,
      subtotalRaw,
      hargaPerSatuan,
      pieceCount,
    };
  }, [
    useRounding,
    hasValidDimensions,
    selectedRollSize,
    parsedPanjang,
    parsedLebar,
    selectedUnit,
    selectedPelanggan,
    quantity,
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

  const filteredPelanggan = customers.filter((c) =>
    c.nama.toLowerCase().includes(pencarianPelanggan.toLowerCase()),
  );

  /** Total akhir keranjang (subtotal item + biaya tambahan), untuk bar ringkas. */
  const cartTotal = useMemo(() => {
    const charges = allocateCartLineCharges(cart, roundCartPrices);
    const subtotalItems = charges.reduce((s, n) => s + n, 0);
    const biaya = cart.reduce(
      (s, it) =>
        s +
        (it.biaya_tambahan || [])
          .filter((b) => b.label.trim() && b.nominal > 0)
          .reduce((a, b) => a + b.nominal, 0),
      0,
    );
    return subtotalItems + biaya;
  }, [cart, roundCartPrices]);

  const materialCategories = useMemo(() => {
    const names = new Set<string>();
    for (const m of materials) {
      if (m.id === ID_BARANG_PLACEHOLDER_MAKLON) continue;
      if (m.kategori_nama) names.add(m.kategori_nama);
    }
    // C6: sertakan kategori dari katalog maklon. Item yang baru dibuat dari
    // modal POS belum punya hasil join `kategori_nama`, jadi pakai fallback
    // legacy `kategori` agar kategori langsung muncul tanpa muat ulang.
    for (const k of katalogMaklon) {
      const namaKategori = k.kategori_nama ?? k.kategori;
      if (namaKategori) names.add(namaKategori);
    }
    return [...names].sort((a, b) => {
      const ia = KATEGORI_ORDER.indexOf(a);
      const ib = KATEGORI_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, "id");
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [materials, katalogMaklon]);

  // Flatten semua unit_prices menjadi daftar Produk Jual — selalu tampil di POS
  // terlepas dari muncul_di_pos_status barang induk. Placeholder maklon dilewati.
  const produkJualList = useMemo<ProdukJualFlat[]>(() => {
    const result: ProdukJualFlat[] = [];
    for (const m of materials) {
      if (m.id === ID_BARANG_PLACEHOLDER_MAKLON) continue;
      for (const up of m.unit_prices) {
        result.push({
          id: up.id,
          nama: up.nama_produk_jual?.trim() || up.nama_satuan,
          nama_satuan: up.nama_satuan,
          nama_produk_jual: up.nama_produk_jual ?? null,
          harga_jual: up.harga_jual,
          harga_member: up.harga_member,
          faktor_konversi: up.faktor_konversi,
          barang_id: m.id,
          barang_nama: m.nama,
          butuh_dimensi_status: m.butuh_dimensi_status,
          kategori_nama: m.kategori_nama ?? null,
          frekuensi_terjual: m.frekuensi_terjual,
          sumber: "BARANG",
        });
      }
    }
    for (const k of katalogMaklon) {
      result.push({
        id: `katalog-${k.id}`,
        nama: k.nama_produk,
        nama_satuan: k.nama_satuan,
        nama_produk_jual: k.nama_produk,
        harga_jual: k.harga_jual_default,
        harga_member: k.harga_jual_default,
        faktor_konversi: 1,
        butuh_dimensi_status: k.butuh_dimensi_status,
        kategori_nama: k.kategori_nama ?? k.kategori ?? null, // join kategori_id (C6), fallback legacy
        sumber: "KATALOG_MAKLON",
        katalog_maklon_id: k.id,
        biaya_subkontrak_default: k.biaya_subkontrak_default,
        vendor_subkontrak_id_default: k.vendor_subkontrak_id_default,
        metode_bayar_vendor_default: k.metode_bayar_vendor_default,
      });
    }
    return result;
  }, [materials, katalogMaklon]);

  const filteredProdukJual = useMemo<ProdukJualFlat[]>(() => {
    const q = materialSearch.trim().toLowerCase();
    const filtered = produkJualList.filter((p) => {
      if (
        materialCategoryFilter !== "ALL" &&
        p.kategori_nama !== materialCategoryFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        p.nama.toLowerCase().includes(q) ||
        (p.barang_nama?.toLowerCase().includes(q) ?? false) ||
        p.nama_satuan.toLowerCase().includes(q)
      );
    });
    // C5: sort Populer — stable sort, item populer didorong ke depan tanpa
    // mengubah urutan relatif item non-populer.
    if (!sortPopuler || !popularData) return filtered;
    const isPopular = (p: ProdukJualFlat): boolean => {
      if (p.sumber === "KATALOG_MAKLON")
        return (
          Boolean(p.katalog_maklon_id) &&
          popularData.katalogMaklonIds.has(p.katalog_maklon_id!)
        );
      return popularData.barangUnitPriceIds.has(p.id);
    };
    return [...filtered].sort(
      (a, b) => Number(isPopular(b)) - Number(isPopular(a)),
    );
  }, [
    produkJualList,
    materialSearch,
    materialCategoryFilter,
    sortPopuler,
    popularData,
  ]);

  const handlePilihPelanggan = (customer: Customer) => {
    setSelectedPelanggan(customer);
    setPencarianPelanggan(customer.nama);
    setShowDropdownPelanggan(false);
    setIndexPelangganTerpilih(-1);
  };

  const handlePelangganKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdownPelanggan || filteredPelanggan.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setIndexPelangganTerpilih((prev) =>
          prev < filteredPelanggan.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setIndexPelangganTerpilih((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (indexPelangganTerpilih >= 0) {
          handlePilihPelanggan(filteredPelanggan[indexPelangganTerpilih]);
        }
        break;
      case "Escape":
        setShowDropdownPelanggan(false);
        setIndexPelangganTerpilih(-1);
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
    setFormFinishing([]);
    setFormHargaSatuan(null);
    setFormBiayaTambahan([]);
    setFormCatatanItem("");
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
    let jumlahRoll: number | undefined;
    let originalPanjang: number | undefined;
    let originalLebar: number | undefined;
    let rollUsed: number | undefined;
    let billedPanjang: number | undefined;
    let billedLebar: number | undefined;
    let rollItemsPerRow: number | undefined;
    let rollRows: number | undefined;
    let rollPanjangTotal: number | undefined;

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

      jumlahRoll = Math.max(1, Math.round(finalQuantity) || 1);
      if (isNaN(finalQuantity) || finalQuantity <= 0) {
        showMsg("error", "Masukkan jumlah yang valid");
        return null;
      }

      if (useRounding) {
        if (selectedRollSize == null) {
          showMsg("error", "Pilih ukuran roll yang dipakai");
          return null;
        }
        // Billing nesting-aware: hitung berapa lembar muat berdampingan di lebar
        // roll, lalu total m² roll terpakai (harga adil, tidak overcharge saat
        // hemat, tetap ditagih saat sisa terbuang). Matematika disembunyikan
        // dari kasir — hanya total m² yang ditagihkan.
        const nest = getNestedRollBilling(p, l, jumlahRoll, selectedRollSize);
        if (!nest) {
          showMsg(
            "error",
            "Roll terlalu kecil untuk ukuran ini (coba roll lebih besar)",
          );
          return null;
        }
        // Dimensi tampilan tetap dari rumus roll-aligned lama (per lembar).
        const rounded = getRoundedDimensions(p, l, true, selectedRollSize);
        billedP = rounded.panjang;
        billedL = rounded.lebar;
        rollUsed = rounded.rollSize ?? selectedRollSize;
        rollItemsPerRow = nest.itemsPerRow;
        rollRows = nest.rows;
        rollPanjangTotal = nest.totalPanjangRoll;
        billedPanjang = billedP;
        billedLebar = billedL;
        finalQuantity = nest.totalAreaRoll; // m² total ditagih (nesting)
      } else {
        billedPanjang = billedP;
        billedLebar = billedL;
        finalQuantity = billedP * billedL * jumlahRoll;
      }
    } else {
      if (isNaN(finalQuantity) || finalQuantity <= 0) {
        showMsg("error", "Masukkan jumlah yang valid");
        return null;
      }
    }

    // Harga katalog (dipakai sebagai originalHargaSatuan dan acuan reset)
    const hargaKatalog = selectedPelanggan?.member_status
      ? selectedUnit.harga_member || selectedUnit.harga_jual
      : selectedUnit.harga_jual;

    // Pakai override harga dari form jika ada, kalau tidak pakai harga katalog
    const hargaPerSatuan = formHargaSatuan ?? hargaKatalog;

    const subtotalRaw = finalQuantity * hargaPerSatuan;
    const validFormBiayaTambahan = formBiayaTambahan
      .filter((b) => b.label.trim() && b.nominal > 0)
      .map((b) => ({
        label: b.label.trim(),
        nominal: b.nominal,
        modal: Math.min(Math.max(Number(b.modal) || 0, 0), b.nominal),
      }));

    // Branch Katalog Extra: tetap CartItem MAKLON untuk alur vendor/biaya
    // subkontrak, tetapi finishing dari form tetap ikut disimpan.
    if (selectedMaterial._isKatalogMaklon) {
      // Isi detail subkontrak dari template katalog extra bila lengkap
      // (vendor + biaya > 0) supaya item tidak masuk pending. Bisa direview /
      // diubah lewat Rincian Internal sebelum bayar. Template kosong tetap
      // pending sebagai safeguard (HPP belum ditentukan).
      const vendorDefault = selectedMaterial._vendorSubkontrakIdDefault;
      const biayaDefault = selectedMaterial._biayaSubkontrakDefault;
      const metodeDefault = selectedMaterial._metodeBayarVendorDefault;
      const templateLengkap =
        !!vendorDefault && !!biayaDefault && Number(biayaDefault) > 0;
      return {
        barang_id: ID_BARANG_PLACEHOLDER_MAKLON,
        barang_nama: selectedMaterial.nama,
        nama_produk_jual:
          selectedUnit?.nama_produk_jual ?? selectedMaterial.nama,
        harga_satuan_id: ID_HARGA_PLACEHOLDER_MAKLON,
        nama_satuan: selectedUnit!.nama_satuan,
        faktor_konversi: 1,
        harga_satuan: hargaPerSatuan,
        jumlah: finalQuantity,
        subtotalRaw,
        originalHargaSatuan: hargaKatalog,
        finishing: formFinishing.length > 0 ? [...formFinishing] : undefined,
        biaya_tambahan:
          validFormBiayaTambahan.length > 0
            ? validFormBiayaTambahan
            : undefined,
        catatan_item: formCatatanItem.trim() || undefined,
        tipe_item: "MAKLON",
        katalog_maklon_id: selectedMaterial._katalogMaklonId,
        deskripsi_pekerjaan: selectedMaterial.nama,
        // Maklon berdimensi: bawa panjang/lebar/jumlah_roll supaya kartu
        // keranjang & struk menampilkan "N × L × P m = qty m² @ Rp harga".
        // Tanpa pembulatan roll (versi sederhana).
        butuh_dimensi: selectedMaterial.butuh_dimensi_status === 1,
        panjang: originalPanjang,
        lebar: originalLebar,
        jumlah_roll: jumlahRoll,
        ...(templateLengkap
          ? {
              vendor_subkontrak_id: vendorDefault ?? undefined,
              biaya_subkontrak: Number(biayaDefault),
              metode_bayar_vendor: metodeDefault ?? "CASH",
            }
          : {}),
      };
    }

    return {
      barang_id: selectedMaterial.id,
      barang_nama: selectedMaterial.nama,
      nama_produk_jual: selectedUnit.nama_produk_jual ?? null,
      harga_satuan_id: selectedUnit.id,
      nama_satuan: selectedUnit.nama_satuan,
      faktor_konversi: selectedUnit.faktor_konversi,
      harga_satuan: hargaPerSatuan,
      jumlah: finalQuantity,
      jumlah_roll: jumlahRoll,
      subtotalRaw,
      // originalHargaSatuan selalu harga katalog (bukan override) supaya badge
      // "Harga Ubah" dan fungsi Reset di modal bisa bekerja dengan benar
      originalHargaSatuan: hargaKatalog,
      finishing: formFinishing.length > 0 ? [...formFinishing] : undefined,
      biaya_tambahan:
        validFormBiayaTambahan.length > 0 ? validFormBiayaTambahan : undefined,
      catatan_item: formCatatanItem.trim() || undefined,
      butuh_dimensi: selectedMaterial.butuh_dimensi_status === 1,
      panjang: originalPanjang,
      lebar: originalLebar,
      useRounding: selectedMaterial.butuh_dimensi_status === 1 && useRounding,
      selectedRollSize: rollUsed,
      billedPanjang: useRounding ? billedPanjang : undefined,
      billedLebar: useRounding ? billedLebar : undefined,
      roll_items_per_row: useRounding ? rollItemsPerRow : undefined,
      roll_rows: useRounding ? rollRows : undefined,
      roll_panjang_total_m: useRounding ? rollPanjangTotal : undefined,
    };
  };

  const handleProdukJualClick = useCallback(
    (produk: ProdukJualFlat) => {
      if (produk.sumber === "KATALOG_MAKLON") {
        // Set virtual material + unit supaya form Pilih Barang muncul.
        // Vendor/biaya/metode default dari template dibawa ke selectedMaterial,
        // lalu diisi ke keranjang oleh buildCartItem bila template lengkap;
        // bisa diubah via Rincian Internal setelah masuk keranjang.
        setSelectedMaterial({
          id: ID_BARANG_PLACEHOLDER_MAKLON,
          nama: produk.barang_nama ?? produk.nama,
          butuh_dimensi_status: produk.butuh_dimensi_status ?? 0,
          frekuensi_terjual: 0,
          _isKatalogMaklon: true,
          _katalogMaklonId: produk.katalog_maklon_id,
          _vendorSubkontrakIdDefault: produk.vendor_subkontrak_id_default ?? null,
          _biayaSubkontrakDefault: produk.biaya_subkontrak_default ?? null,
          _metodeBayarVendorDefault: produk.metode_bayar_vendor_default ?? null,
          unit_prices: [],
        });
        setSelectedUnit({
          id: ID_HARGA_PLACEHOLDER_MAKLON,
          nama_satuan: produk.nama_satuan,
          nama_produk_jual: produk.nama_produk_jual ?? null,
          faktor_konversi: 1,
          harga_jual: produk.harga_jual,
          harga_member: produk.harga_member ?? produk.harga_jual,
          default_status: 1,
        });
        setPanjang("");
        setLebar("");
        setQuantity("1");
        setUseRounding(false);
        setSelectedRollSize(null);
        setFormFinishing([]);
        setFormHargaSatuan(null);
        setFormBiayaTambahan([]);
        setFormCatatanItem("");
        setEditingCartIndex(null);
        return;
      }

      const material = materials.find((m) => m.id === produk.barang_id);
      if (!material) return;
      const unit = material.unit_prices.find((u) => u.id === produk.id);
      if (!unit) return;

      // Klik produk yang sama saat bukan mode edit → batalkan pilihan
      if (
        selectedMaterial?.id === material.id &&
        selectedUnit?.id === unit.id &&
        editingCartIndex === null
      ) {
        setSelectedMaterial(null);
        setSelectedUnit(null);
        return;
      }

      setEditingCartIndex(null);
      setSelectedMaterial(material);
      setSelectedUnit(unit);
      setPanjang("");
      setLebar("");
      setQuantity("1");
      setUseRounding(material.butuh_dimensi_status === 1);
      setSelectedRollSize(null);
      setFormFinishing([]);
      setFormHargaSatuan(null);
      setFormBiayaTambahan([]);
      setFormCatatanItem("");
    },
    [materials, selectedMaterial, selectedUnit, editingCartIndex],
  );

  const handleEditCartItem = (index: number) => {
    const item = cart[index];
    if (!item) return;

    // Maklon ad-hoc (belum masuk katalog) tetap lewat modal rincian internal
    // untuk vendor/biaya.
    if (item.tipe_item === "MAKLON" && !item.katalog_maklon_id) {
      setEditingRincianInternalIndex(index);
      return;
    }
    // Katalog extra (C3): edit qty/harga/biaya tambahan lewat form Pilih Barang.
    // Detail subkontrak (vendor/biaya/metode) diisi otomatis dari template dan
    // dipertahankan saat edit; masih bisa diubah lewat Rincian Internal.
    if (item.tipe_item === "MAKLON" && item.katalog_maklon_id) {
      const km = katalogMaklon.find((k) => k.id === item.katalog_maklon_id);
      setSelectedMaterial({
        id: ID_BARANG_PLACEHOLDER_MAKLON,
        nama: item.barang_nama,
        butuh_dimensi_status: 0,
        frekuensi_terjual: 0,
        _isKatalogMaklon: true,
        _katalogMaklonId: item.katalog_maklon_id,
        // Pertahankan detail subkontrak yang sudah ada di baris keranjang
        // (dari template atau Rincian Internal) supaya tidak hilang saat
        // qty/harga diedit lewat form; fallback ke default template.
        _vendorSubkontrakIdDefault:
          item.vendor_subkontrak_id ?? km?.vendor_subkontrak_id_default ?? null,
        _biayaSubkontrakDefault:
          item.biaya_subkontrak ?? km?.biaya_subkontrak_default ?? null,
        _metodeBayarVendorDefault:
          item.metode_bayar_vendor ?? km?.metode_bayar_vendor_default ?? null,
        unit_prices: [],
      });
      setSelectedUnit({
        id: ID_HARGA_PLACEHOLDER_MAKLON,
        nama_satuan: item.nama_satuan,
        nama_produk_jual: km?.nama_produk ?? null,
        faktor_konversi: 1,
        harga_jual: km?.harga_jual_default ?? item.harga_satuan,
        harga_member: km?.harga_jual_default ?? item.harga_satuan,
        default_status: 1,
      });
      setEditingCartIndex(index);
      setMaterialSearch("");
      setPanjang("");
      setLebar("");
      setQuantity(String(item.jumlah));
      setUseRounding(false);
      setSelectedRollSize(null);
      setFormFinishing(item.finishing ? [...item.finishing] : []);
      setFormBiayaTambahan(
        item.biaya_tambahan ? item.biaya_tambahan.map((b) => ({ ...b })) : [],
      );
      setFormCatatanItem(item.catatan_item || "");
      if (
        item.originalHargaSatuan != null &&
        Math.abs(item.harga_satuan - item.originalHargaSatuan) > 0.01
      ) {
        setFormHargaSatuan(item.harga_satuan);
      } else {
        setFormHargaSatuan(null);
      }
      return;
    }

    const material = materials.find((m) => m.id === item.barang_id);
    if (!material) {
      showMsg("error", "Barang tidak ditemukan di katalog");
      return;
    }

    const unit =
      material.unit_prices.find((u) => u.id === item.harga_satuan_id) ??
      getReferensiUnitPrice(material.unit_prices) ??
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
        item.useRounding ? (item.selectedRollSize ?? null) : null,
      );
      const perPieceArea =
        item.useRounding &&
        item.billedPanjang != null &&
        item.billedLebar != null
          ? item.billedPanjang * item.billedLebar
          : item.panjang * item.lebar;
      const pieces =
        item.jumlah_roll ??
        (perPieceArea > 0
          ? Math.max(1, Math.round(item.jumlah / perPieceArea))
          : 1);
      setQuantity(String(pieces));
    } else {
      setPanjang("");
      setLebar("");
      setUseRounding(false);
      setSelectedRollSize(null);
      setQuantity(String(item.jumlah));
    }

    // Pulihkan finishing, catatan, dan harga override dari item yang sedang diedit
    setFormFinishing(item.finishing ? [...item.finishing] : []);
    setFormBiayaTambahan(
      item.biaya_tambahan ? item.biaya_tambahan.map((b) => ({ ...b })) : [],
    );
    setFormCatatanItem(item.catatan_item || "");
    if (
      item.originalHargaSatuan != null &&
      Math.abs(item.harga_satuan - item.originalHargaSatuan) > 0.01
    ) {
      setFormHargaSatuan(item.harga_satuan);
    } else {
      setFormHargaSatuan(null);
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
        // finishing dan harga sudah di-set dari form, tidak perlu preserve dari cart lama
        next[editingCartIndex] = newItem;
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

  const handleSaveTambahItemLainnya = async (v: TambahItemLainnyaValue) => {
    // 1. Simpan ke katalog_maklon supaya item muncul di halaman Katalog Extra
    //    untuk pelengkapan vendor/HPP belakangan. Vendor=null/biaya=null =
    //    item "pending" (safeguard C2/Task 4 menangani saat checkout).
    try {
      const created = await createKatalogMaklonAction({
        nama_produk: v.barang_nama,
        nama_satuan: v.nama_satuan,
        harga_jual_default: v.harga_satuan,
        biaya_subkontrak_default: v.biaya_subkontrak ?? 0,
        vendor_subkontrak_id_default: v.vendor_subkontrak_id ?? null,
        metode_bayar_vendor_default: v.metode_bayar_vendor ?? "CASH",
        kategori: v.kategori ?? null,
        kategori_id: v.kategori_id ?? null,
        populer_status: 0,
        butuh_dimensi_status: v.butuh_dimensi_status ?? 0,
        is_aktif: 1,
        urutan: 0,
      });
      const createdKatalog = created as NonNullable<
        POSInitData["katalogMaklon"]
      >[number];
      const katalogUntukCache = {
        ...createdKatalog,
        kategori_nama: createdKatalog.kategori_nama ?? v.kategori ?? null,
      };
      if (createdKatalog.id) {
        void mutatePosInit(
          (prev) => {
            const base = prev ?? EMPTY_POS_INIT;
            const current = base.katalogMaklon ?? [];
            return {
              ...base,
              katalogMaklon: [katalogUntukCache, ...current],
            };
          },
          { revalidate: false },
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showMsg("error", `Gagal simpan ke katalog: ${msg}`);
      return; // jangan tambah ke cart bila gagal simpan katalog
    }

    setShowTambahItemLainnya(false);
    showMsg("success", "Item berhasil ditambahkan ke Pilih Barang");
    // Bust cache katalog supaya item muncul di halaman Katalog Extra.
    invalidate("katalog-maklon");
  };

  const handleSaveRincianInternal = (index: number, v: Partial<CartItem>) => {
    setCart((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...v } : it)),
    );
    setEditingRincianInternalIndex(null);
  };

  const defaultParkLabel = useMemo(() => {
    const nama =
      selectedPelanggan?.nama ||
      pencarianPelanggan.trim() ||
      fakturUmum?.nama ||
      "Pelanggan Umum";
    const jam = new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${nama} · ${cart.length} item · ${jam}`;
  }, [selectedPelanggan, pencarianPelanggan, fakturUmum, cart.length]);

  const refreshParked = useCallback(async () => {
    try {
      setParkedCarts(await listParkedCartsAction());
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useEffect(() => {
    void refreshParked();
  }, [refreshParked]);

  const handlePark = async (label: string) => {
    await parkCartAction({
      label,
      pelanggan_id: selectedPelanggan?.id || null,
      pelanggan_nama_snapshot:
        selectedPelanggan?.nama ||
        pencarianPelanggan.trim() ||
        fakturUmum?.nama ||
        null,
      pelanggan_kota: fakturUmum?.kota || null,
      prioritas,
      ppn_snapshot: ppnFaktur ?? null,
      cart_snapshot: cart,
    });
    setCart([]);
    setFakturUmum(null);
    setPpnFaktur(null);
    setPencarianPelanggan("");
    setSelectedPelanggan(null);
    setLoadedParkedId(null);
    setShowParkirModal(false);
    await refreshParked();
    showMsg("success", "Keranjang disimpan");
  };

  const handleLoadParked = async (id: string) => {
    if (
      cart.length > 0 &&
      !window.confirm(
        "Ganti keranjang saat ini? Keranjang yang belum diparkir akan hilang.",
      )
    ) {
      return;
    }
    const p = await loadParkedCartAction(id);
    if (!p) return;
    setCart(p.cart_snapshot as CartItem[]);
    // Restore pelanggan: jika ada pelanggan_id, cari dari daftar customers;
    // jika hanya nama teks (pelanggan umum), restore ke fakturUmum.
    if (p.pelanggan_id) {
      const found = customers.find((c) => c.id === p.pelanggan_id) ?? null;
      setSelectedPelanggan(found);
      setPencarianPelanggan(found?.nama || p.pelanggan_nama_snapshot || "");
      setFakturUmum(null);
    } else if (p.pelanggan_nama_snapshot) {
      setSelectedPelanggan(null);
      setPencarianPelanggan(p.pelanggan_nama_snapshot);
      setFakturUmum({
        nama: p.pelanggan_nama_snapshot,
        kota: p.pelanggan_kota || "Bekasi",
      });
    } else {
      setSelectedPelanggan(null);
      setPencarianPelanggan("");
      setFakturUmum(null);
    }
    setPrioritas(p.prioritas);
    setPpnFaktur((p.ppn_snapshot as PpnFakturData | null) ?? null);
    setLoadedParkedId(id);
    showMsg("success", `Keranjang "${p.label}" dimuat`);
  };

  const toQuotationItemInput = (item: CartItem): QuotationItemInput => ({
    barang_id: item.barang_id,
    harga_satuan_id: item.harga_satuan_id || null,
    jumlah: item.jumlah,
    nama_satuan: item.nama_satuan,
    faktor_konversi: item.faktor_konversi || 1,
    harga_satuan: item.harga_satuan,
    subtotal: item.subtotalRaw,
    panjang: item.panjang ?? null,
    lebar: item.lebar ?? null,
    tipe_item: (item.tipe_item as "BARANG" | "JASA" | "MAKLON") || "BARANG",
    vendor_subkontrak_id: item.vendor_subkontrak_id || null,
    biaya_subkontrak: item.biaya_subkontrak ?? null,
    metode_bayar_vendor:
      (item.metode_bayar_vendor as "CASH" | "NET30" | "TRANSFER") || null,
    deskripsi_pekerjaan: item.deskripsi_pekerjaan || null,
  });

  const handleJadikanPenawaran = async (id: string) => {
    const p = await loadParkedCartAction(id);
    if (!p) return;
    const items = (p.cart_snapshot as CartItem[]).map(toQuotationItemInput);
    const r = await jadikanPenawaranAction(id, items, {
      pelanggan_id: p.pelanggan_id,
      pelanggan_nama_snapshot: p.pelanggan_nama_snapshot,
      pelanggan_kota: p.pelanggan_kota,
      kena_ppn: p.ppn_snapshot ? true : undefined,
    });
    showMsg(
      "success",
      `Jadikan penawaran ${r.nomor_penawaran}. Lihat di halaman Penawaran.`,
    );
    await refreshParked();
  };

  const handleDeleteParked = async (id: string) => {
    if (!window.confirm("Hapus keranjang tersimpan ini?")) return;
    await deleteParkedCartAction(id);
    await refreshParked();
  };

  const handleDeleteSale = async (saleId: string) => {
    try {
      await voidSaleAction(saleId, "Penjualan dibatalkan dari Riwayat POS");
      showMsg("success", "Transaksi berhasil dibatalkan");
      await loadAllData();
    } catch (error: any) {
      console.error("Error deleting sale:", error);
      showMsg(
        "error",
        error.message || "Terjadi kesalahan saat membatalkan transaksi",
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
        sale.nomor_faktur
      }?\n\nPelanggan: ${
        sale.pelanggan_nama || "Pelanggan Umum"
      }\nTotal Transaksi: Rp ${sale.total_jumlah.toLocaleString(
        "id-ID",
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
            `Status berhasil dikembalikan ke PIUTANG (${paymentsDeleted} pembayaran dihapus)`,
          );
          await loadAllData();
        } catch (error: any) {
          console.error("Error reverting sale:", error);
          showMsg(
            "error",
            error.message || "Gagal mengembalikan status penjualan",
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

    // Jika pengguna mengetik nama di kotak pencarian tapi tidak memilih dari dropdown,
    // anggap sebagai nama pelanggan umum dan simpan otomatis — tidak perlu modal.
    const typedName = pencarianPelanggan.trim();
    if (!selectedPelanggan && typedName && !fakturUmum) {
      setFakturUmum({ nama: typedName, kota: "Bekasi" });
    }

    // Jika pengguna mau cetak faktur tapi pelanggan umum (belum dipilih) dan
    // belum mengisi kota, minta kota saja.
    const wantsFaktur = printType === "faktur" || printType === "both";
    const resolvedFakturUmum =
      fakturUmum ?? (typedName ? { nama: typedName, kota: "Bekasi" } : null);
    if (wantsFaktur && !selectedPelanggan && !resolvedFakturUmum) {
      setFakturUmumInput({ nama: "", kota: "Bekasi" });
      setShowFakturUmumModal(true);
      return;
    }

    const subtotalItems = getCartChargeTotal(cart, roundCartPrices);
    const biayaTambahanTotal = getCartBiayaTambahanTotal(cart);
    const total = subtotalItems + biayaTambahanTotal;
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
    kembalian: number,
  ) => {
    setRefreshing(true);
    try {
      const lineCharges = allocateCartLineCharges(cart, roundCartPrices);
      const checkoutBiayaTambahan = getCartBiayaTambahanRows(cart).map((b) => ({
        label: b.label.trim(),
        nominal: b.nominal,
        modal: Math.min(Math.max(Number(b.modal) || 0, 0), b.nominal),
      }));
      const saleItems = cart.map((item, index) => ({
        barang_id: item.barang_id,
        harga_satuan_id: item.harga_satuan_id,
        jumlah: item.jumlah,
        jumlah_roll: item.jumlah_roll,
        nama_satuan: item.nama_satuan,
        nama_produk_jual: item.nama_produk_jual ?? null,
        faktor_konversi: item.faktor_konversi,
        harga_satuan:
          item.jumlah > 0
            ? lineCharges[index] / item.jumlah
            : item.harga_satuan,
        subtotal: lineCharges[index],
        panjang: item.panjang,
        lebar: item.lebar,
        billed_panjang: item.billedPanjang,
        billed_lebar: item.billedLebar,
        recommended_roll_width_m: item.selectedRollSize,
        selectedRollSize: item.selectedRollSize,
        roll_items_per_row: item.roll_items_per_row ?? null,
        roll_rows: item.roll_rows ?? null,
        roll_panjang_total_m: item.roll_panjang_total_m ?? null,
        finishing: item.finishing,
        tipe_item: item.tipe_item || "BARANG",
        vendor_subkontrak_id: item.vendor_subkontrak_id || null,
        biaya_subkontrak: item.biaya_subkontrak ?? null,
        metode_bayar_vendor: item.metode_bayar_vendor ?? null,
        deskripsi_pekerjaan: item.deskripsi_pekerjaan ?? null,
        katalog_maklon_id: item.katalog_maklon_id ?? null,
        biaya_tambahan: (item.biaya_tambahan || [])
          .filter((b) => b.label.trim() && b.nominal > 0)
          .map((b) => ({
            label: b.label.trim(),
            nominal: b.nominal,
            modal: Math.min(Math.max(Number(b.modal) || 0, 0), b.nominal),
          })),
        catatan_item: item.catatan_item?.trim() || undefined,
      }));

      const result = await createSaleAction({
        pelanggan_id: selectedPelanggan?.id,
        pelanggan_nama_snapshot: !selectedPelanggan
          ? fakturUmum?.nama || pencarianPelanggan.trim() || undefined
          : undefined,
        pelanggan_kota: fakturUmum?.kota || undefined,
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
        biaya_tambahan: checkoutBiayaTambahan,
        ...(ppnFaktur
          ? {
              kena_ppn: true,
              ppn_persen: ppnFaktur.ppn_persen,
              ppn_metode: ppnFaktur.ppn_metode,
              nsfp_kode_transaksi: ppnFaktur.nsfp_kode_transaksi,
              nsfp_tahun: ppnFaktur.nsfp_tahun,
              nsfp_nomor_seri: ppnFaktur.nsfp_nomor_seri.padStart(8, "0"),
              tanggal_faktur_pajak: ppnFaktur.tanggal_faktur_pajak,
              pelanggan_npwp_snapshot:
                ppnFaktur.pelanggan_npwp_snapshot || undefined,
              pelanggan_alamat_npwp_snapshot:
                ppnFaktur.pelanggan_alamat_npwp_snapshot || undefined,
              pelanggan_nama_npwp_snapshot:
                ppnFaktur.pelanggan_nama_npwp_snapshot || undefined,
            }
          : {}),
      });

      showMsg(
        "success",
        `Transaksi berhasil! Faktur: ${result.nomor_faktur} | SPK: ${result.spk_number}`,
      );

      // Print receipt and/or faktur based on user's choice
      if (printType !== "none") {
        const tanggalIso = new Date().toISOString();
        let shopSettings:
          | {
              nama_toko?: string | null;
              slogan?: string | null;
              alamat?: string | null;
              telepon?: string | null;
              email?: string | null;
              website?: string | null;
              bank_nama?: string | null;
              bank_nomor?: string | null;
              bank_atas_nama?: string | null;
              catatan_faktur?: string | null;
              catatan_struk?: string | null;
              npwp?: string | null;
              alamat_npwp?: string | null;
            }
          | undefined;

        try {
          const { getShopSettingsAction } =
            await import("@/app/pengaturan/actions");
          const settings = await getShopSettingsAction();
          shopSettings = {
            nama_toko: settings.nama_toko,
            slogan: settings.slogan,
            alamat: settings.alamat,
            telepon: settings.telepon,
            email: settings.email,
            website: settings.website,
            bank_nama: settings.bank_nama,
            bank_nomor: settings.bank_nomor,
            bank_atas_nama: settings.bank_atas_nama,
            catatan_faktur: settings.catatan_faktur,
            catatan_struk: settings.catatan_struk,
            npwp: settings.npwp,
            alamat_npwp: settings.alamat_npwp,
          };
        } catch (err) {
          console.warn("Data usaha tidak bisa dimuat untuk print:", err);
        }

        const buildThermalData = () => ({
          nomor_faktur: result.nomor_faktur,
          tanggal: tanggalIso,
          shop: shopSettings,
          pelanggan_nama:
            selectedPelanggan?.nama ||
            fakturUmum?.nama ||
            pencarianPelanggan.trim() ||
            undefined,
          pelanggan_telepon: selectedPelanggan?.telepon,
          kasir_nama: currentUser?.nama_pengguna || "Kasir",
          items: cart.map((item, index) => {
            const lineTotal = lineCharges[index];
            const cetakInput = {
              jumlah: item.jumlah,
              nama_satuan: item.nama_satuan,
              panjang: item.panjang,
              lebar: item.lebar,
              billed_panjang: item.billedPanjang,
              billed_lebar: item.billedLebar,
              jumlah_roll: item.jumlah_roll,
            };
            const { qty, satuan } = qtySatuanCetakPenjualan(cetakInput);
            return {
              nama:
                item.tipe_item === "MAKLON" && item.deskripsi_pekerjaan
                  ? item.deskripsi_pekerjaan
                  : item.nama_produk_jual?.trim() || item.barang_nama,
              jumlah: qty,
              satuan,
              harga: qty > 0 ? lineTotal / qty : item.harga_satuan,
              subtotal: lineTotal,
              dimensi:
                item.butuh_dimensi && item.panjang && item.lebar
                  ? item.useRounding &&
                    item.selectedRollSize != null &&
                    item.billedPanjang != null &&
                    item.billedLebar != null
                    ? formatRollCartDetailLine(item)
                    : formatDimensiBarisThermal(cetakInput)
                  : undefined,
              biaya_tambahan: (item.biaya_tambahan || [])
                .filter((b) => b.label.trim() && b.nominal > 0)
                .map((b) => ({ label: b.label.trim(), nominal: b.nominal })),
              catatan_item: item.catatan_item?.trim() || undefined,
            };
          }),
          total: total,
          jumlah_bayar: bayar,
          kembalian: kembalian,
          metode_pembayaran: paymentMethod,
          catatan: catatan.trim() || undefined,
        });

        const buildFakturData = async () => {
          const { formatNsfpString, formatNpwp } =
            await import("@/lib/ppn-helpers");
          const sisa = Math.max(
            0,
            total - (paymentMethod === "NET30" ? 0 : bayar),
          );

          const shop = shopSettings
            ? {
                ...shopSettings,
                npwp: shopSettings.npwp ? formatNpwp(shopSettings.npwp) : null,
              }
            : undefined;

          // Hitung DPP per faktur dari data yang sudah di-set di RPC.
          // Untuk safety di client side, hitung ulang dari ppnFaktur input.
          const ppn = ppnFaktur
            ? (() => {
                const { hitungPpn } =
                  require("@/lib/ppn-helpers") as typeof import("@/lib/ppn-helpers");
                const breakdown = hitungPpn(
                  total,
                  ppnFaktur.ppn_persen,
                  ppnFaktur.ppn_metode,
                );
                return {
                  nsfp: formatNsfpString(
                    ppnFaktur.nsfp_kode_transaksi,
                    ppnFaktur.nsfp_tahun,
                    ppnFaktur.nsfp_nomor_seri.padStart(8, "0"),
                  ),
                  kode_transaksi: ppnFaktur.nsfp_kode_transaksi,
                  dpp_total: breakdown.dpp,
                  persen: ppnFaktur.ppn_persen,
                  ppn_total: breakdown.ppn,
                  pelanggan_npwp: ppnFaktur.pelanggan_npwp_snapshot
                    ? formatNpwp(ppnFaktur.pelanggan_npwp_snapshot)
                    : null,
                  pelanggan_alamat_npwp:
                    ppnFaktur.pelanggan_alamat_npwp_snapshot || null,
                  pelanggan_nama_npwp:
                    ppnFaktur.pelanggan_nama_npwp_snapshot || null,
                };
              })()
            : undefined;

          return {
            nomor_faktur: result.nomor_faktur,
            tanggal: tanggalIso,
            pelanggan_nama:
              selectedPelanggan?.nama ||
              fakturUmum?.nama ||
              pencarianPelanggan.trim() ||
              "",
            pelanggan_detail: [
              selectedPelanggan?.kontak_person
                ? `Kontak: ${selectedPelanggan.kontak_person}`
                : "",
              selectedPelanggan?.telepon
                ? `Telp: ${selectedPelanggan.telepon}`
                : "",
              selectedPelanggan?.email
                ? `Email: ${selectedPelanggan.email}`
                : "",
              selectedPelanggan?.alamat || "",
            ].filter(Boolean),
            kota: fakturUmum?.kota || "Bekasi",
            items: cart.map((item, index) => {
              const lineTotal = lineCharges[index];
              return mapPenjualanItemKeFaktur({
                barang_nama: item.barang_nama,
                nama_produk_jual: item.nama_produk_jual,
                tipe_item: item.tipe_item,
                deskripsi_pekerjaan: item.deskripsi_pekerjaan,
                jumlah: item.jumlah,
                nama_satuan: item.nama_satuan,
                panjang: item.panjang,
                lebar: item.lebar,
                billed_panjang: item.billedPanjang,
                billed_lebar: item.billedLebar,
                jumlah_roll: item.jumlah_roll,
                harga_satuan: item.harga_satuan,
                subtotal: lineTotal,
                biaya_tambahan: (item.biaya_tambahan || [])
                  .filter((b) => b.label.trim() && b.nominal > 0)
                  .map((b) => ({ label: b.label.trim(), nominal: b.nominal })),
                catatan_item: item.catatan_item?.trim() || undefined,
              });
            }),
            total,
            bayar: paymentMethod === "NET30" ? 0 : bayar,
            sisa,
            catatan: catatan.trim() || undefined,
            ppn,
            shop,
          };
        };

        try {
          if (printType === "thermal" || printType === "both") {
            const { printThermalInvoice } = await import("@/lib/thermal-print");
            const printed = await printThermalInvoice(buildThermalData());
            if (!printed) {
              showMsg(
                "error",
                "Transaksi tersimpan, tetapi struk tidak bisa dibuka. Izinkan pop-up untuk situs ini.",
              );
            }
          }
          if (printType === "faktur" || printType === "both") {
            const { printFaktur } = await import("@/lib/faktur-print");
            const fakturData = await buildFakturData();
            const printed = await printFaktur(fakturData);
            if (!printed) {
              showMsg(
                "error",
                "Transaksi tersimpan, tetapi faktur tidak bisa dibuka. Izinkan pop-up untuk situs ini.",
              );
            }
          }
        } catch (printError) {
          console.error("Error mencetak faktur:", printError);
          showMsg(
            "error",
            "Transaksi tersimpan, tetapi gagal menyiapkan dokumen untuk dicetak.",
          );
        }
      }

      // Reset form + tutup overlay keranjang
      setShowOverlayKeranjang(false);
      setCart([]);
      setSelectedPelanggan(null);
      setPencarianPelanggan("");
      setCatatan("");
      setPaymentMethod("CASH");
      setJumlahBayar("");
      setPrioritas("NORMAL");
      setUseRounding(false);
      setSelectedRollSize(null);
      setPpnFaktur(null);
      setRoundCartPrices(true);
      setFakturUmum(null);

      if (loadedParkedId) {
        await markFinalAction(loadedParkedId);
        setLoadedParkedId(null);
        await refreshParked();
      }

      // Reload data
      await loadAllData();
    } catch (error: any) {
      console.error("Error processing checkout:", error);
      showMsg(
        "error",
        error?.message || "Terjadi kesalahan saat memproses transaksi",
      );
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
        {/* Area kerja lebar penuh: Pelanggan + Pilih Barang + Bar Ringkas Keranjang */}
        <div className="space-y-4 pb-20">
          <div className="space-y-4">
            {/* Customer Selection */}
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-slate-800 dark:to-slate-900 rounded-xl shadow-lg p-4 sm:p-5 border border-[#00afef]/30">
              <div className="flex items-center gap-2">
                {/* Ikon pelanggan */}
                <svg
                  className="w-5 h-5 text-[#00afef] shrink-0"
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

                {/* Input pencarian — tersembunyi saat pelanggan sudah terpilih */}
                {!selectedPelanggan && (
                  <div
                    className="relative flex-1 min-w-0"
                    ref={customerDropdownRef}
                  >
                    <input
                      type="text"
                      value={pencarianPelanggan}
                      onChange={(e) => {
                        setPencarianPelanggan(e.target.value);
                        setShowDropdownPelanggan(true);
                        setIndexPelangganTerpilih(-1);
                      }}
                      onFocus={() => setShowDropdownPelanggan(true)}
                      onKeyDown={handlePelangganKeyDown}
                      placeholder="Cari pelanggan atau ketik nama pelanggan umum..."
                      className="w-full pl-4 pr-36 py-2 text-base border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
                    />

                    {showDropdownPelanggan && filteredPelanggan.length > 0 && (
                      <div className="absolute z-10 w-full mt-2 bg-white dark:bg-slate-900 border-2 border-[#00afef]/30 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                        {filteredPelanggan.map((customer, index) => (
                          <div
                            key={customer.id}
                            onClick={() => handlePilihPelanggan(customer)}
                            className={`px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-slate-800 last:border-0 transition-colors ${
                              index === indexPelangganTerpilih
                                ? "bg-[#00afef] text-white"
                                : "hover:bg-slate-50 dark:hover:bg-white/5"
                            }`}
                          >
                            <div
                              className={`font-semibold ${
                                index === indexPelangganTerpilih
                                  ? "text-white"
                                  : "text-gray-800 dark:text-slate-100"
                              }`}
                            >
                              {customer.nama}
                            </div>
                            {customer.member_status === 1 && (
                              <span
                                className={`text-sm px-2 py-1 rounded ${
                                  index === indexPelangganTerpilih
                                    ? "bg-white dark:bg-slate-900 text-[#00afef]"
                                    : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
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
                )}

                {/* Chip pelanggan terpilih — tampil inline menggantikan input */}
                {selectedPelanggan && (
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 rounded-lg border-2 border-[#00afef]/50">
                    <div className="min-w-0">
                      <span className="font-bold text-gray-800 dark:text-slate-100 truncate">
                        {selectedPelanggan.nama}
                      </span>
                      {selectedPelanggan.telepon && (
                        <span className="ml-2 text-sm text-gray-500 dark:text-slate-400">
                          {selectedPelanggan.telepon}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedPelanggan(null);
                        setPencarianPelanggan("");
                      }}
                      className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
                      aria-label="Hapus pilihan pelanggan"
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
                  </div>
                )}
              </div>
            </div>

            {/* Material Selection */}
            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-slate-800 dark:to-slate-900 rounded-xl shadow-lg p-4 sm:p-5 border border-[#00afef]/30">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="shrink-0 text-base font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2 whitespace-nowrap">
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
                    className="w-full pl-9 pr-8 py-2 text-base border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
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

                <button
                  type="button"
                  onClick={() => setShowTambahItemLainnya(true)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-lg text-sm font-bold hover:from-violet-700 hover:to-purple-800 transition-all shadow-sm"
                  title="Tambah item khusus tanpa katalog"
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Tambah Item Lainnya
                </button>

                <button
                  type="button"
                  onClick={() => setSortPopuler((v) => !v)}
                  aria-pressed={sortPopuler}
                  title="Urutkan item populer ke depan"
                  className={`shrink-0 inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full whitespace-nowrap transition-colors ${
                    sortPopuler
                      ? "bg-cyan-500 text-white"
                      : "text-gray-500 dark:text-slate-400 bg-cyan-50 dark:bg-slate-800 hover:bg-cyan-100 dark:hover:bg-slate-700"
                  }`}
                >
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Populer {sortPopuler ? "ON" : "OFF"}
                </button>
              </div>

              <div className="space-y-3">
                {/* Filter kategori cepat — horizontal scroll saat banyak kategori */}
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
                        className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition-all ${
                          materialCategoryFilter === "ALL"
                            ? "border-[#00afef] bg-[#00afef] text-white shadow-sm"
                            : "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:border-[#00afef]/50 hover:bg-slate-50 dark:hover:bg-white/5"
                        }`}
                      >
                        Semua
                      </button>
                      {materialCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setMaterialCategoryFilter(cat)}
                          className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition-all ${
                            materialCategoryFilter === cat
                              ? "border-[#00afef] bg-[#00afef] text-white shadow-sm"
                              : "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:border-[#00afef]/50 hover:bg-slate-50 dark:hover:bg-white/5"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dua kolom: grid produk (kiri) + form edit (kanan) */}
                <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4">
                  {/* Kiri: Grid produk — tinggi tetap, tidak menyusut saat produk dipilih */}
                  <div>
                <div
                  className="overflow-y-auto border-2 border-[#00afef]/30 rounded-lg p-2 max-h-[calc(100vh-380px)] min-h-[240px]"
                >
                  <div className="grid grid-cols-2 gap-2">
                    {filteredProdukJual.map((produk) => (
                      <button
                        key={produk.id}
                        type="button"
                        title="Klik untuk memilih produk; klik lagi untuk membatalkan pilihan"
                        onClick={() => handleProdukJualClick(produk)}
                        className={`cursor-pointer p-3 rounded-lg border-2 transition-all text-left select-none ${
                          selectedMaterial?.id === produk.barang_id &&
                          selectedUnit?.id === produk.id
                            ? "border-[#00afef] bg-cyan-50 dark:bg-slate-800 shadow-md scale-[1.02] ring-2 ring-[#00afef]/30"
                            : "border-gray-200 dark:border-slate-700 hover:border-[#00afef]/50 hover:bg-slate-50 dark:hover:bg-white/5 dark:hover:bg-slate-700/50 hover:shadow-sm active:scale-[0.98]"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div
                            className={`font-bold text-base truncate ${
                              selectedMaterial?.id === produk.barang_id &&
                              selectedUnit?.id === produk.id
                                ? "text-[#00afef]"
                                : "text-gray-800 dark:text-slate-100"
                            }`}
                          >
                            {produk.nama}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-slate-400 mt-0.5 truncate">
                            {produk.barang_nama}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {filteredProdukJual.length === 0 && (
                    <div className="text-center py-8 text-gray-500 dark:text-slate-400">
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
                      <p className="font-semibold">Tidak ada produk jual</p>
                      <p className="text-sm">
                        Coba ubah pencarian atau pilih kategori lain
                      </p>
                    </div>
                  )}
                </div>

                  </div>{/* /kiri grid produk */}

                  {/* Kanan: form edit barang terpilih atau empty state */}
                  <div>
                {selectedMaterial ? (
                  <div
                    ref={productFormRef}
                    className={`p-3 bg-white dark:bg-slate-900 rounded-lg border-2 shadow-sm ${
                      editingCartIndex !== null
                        ? "border-amber-400 ring-2 ring-amber-200/60"
                        : "border-[#00afef]/30"
                    }`}
                  >
                    {editingCartIndex !== null && (
                      <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-amber-200 dark:border-amber-800/50">
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                          Mengedit item keranjang
                        </p>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="text-sm font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-800 px-2 py-0.5 rounded hover:bg-gray-100"
                        >
                          Batal
                        </button>
                      </div>
                    )}
                    <div className="font-bold text-gray-800 dark:text-slate-100 text-base mb-3">
                      {selectedMaterial.nama}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Left: Material Details & Unit */}
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
                            Satuan & Harga
                          </label>
                          {selectedMaterial._isKatalogMaklon ? (
                            <div className="px-3 py-2 text-sm text-gray-700 dark:text-slate-200 border-2 border-[#00afef]/30 rounded-lg bg-gray-50 dark:bg-slate-800">
                              {selectedUnit?.nama_satuan} - Rp{" "}
                              {(selectedPelanggan?.member_status
                                ? selectedUnit?.harga_member ||
                                  selectedUnit?.harga_jual
                                : selectedUnit?.harga_jual
                              )?.toLocaleString("id-ID")}
                            </div>
                          ) : (
                            <select
                              value={selectedUnit?.id || ""}
                              onChange={(e) => {
                                const unit = selectedMaterial.unit_prices.find(
                                  (u) => u.id === e.target.value,
                                );
                                setSelectedUnit(unit || null);
                              }}
                              className="w-full px-3 py-2 text-base border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
                            >
                              {selectedMaterial.unit_prices.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.nama_satuan} - Rp{" "}
                                  {(selectedPelanggan?.member_status
                                    ? unit.harga_member || unit.harga_jual
                                    : unit.harga_jual
                                  ).toLocaleString("id-ID")}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Dimensi untuk barang/maklon yang butuh luas. */}
                        {selectedMaterial.butuh_dimensi_status === 1 && (
                            <div className="space-y-2">
                              <label className="block text-sm font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
                                Ukuran (Lebar × Panjang, m)
                              </label>
                              <div className="grid grid-cols-2 gap-2">
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
                                    className="w-full px-3 py-2 text-base border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
                                    placeholder="Lebar"
                                  />
                                </div>
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
                                    className="w-full px-3 py-2 text-base border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef] dark:bg-slate-800 dark:text-slate-100"
                                    placeholder="Panjang"
                                  />
                                </div>
                              </div>

                              {/* Pembulatan ukuran roll — hanya barang cetak,
                                  bukan maklon (maklon: luas sederhana). */}
                              {!selectedMaterial._isKatalogMaklon &&
                                panjang &&
                                lebar && (
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={useRounding}
                                      onChange={(e) =>
                                        setUseRounding(e.target.checked)
                                      }
                                      className="w-4 h-4 text-blue-600 dark:text-blue-300 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <span className="font-medium">
                                      Gunakan Pembulatan Ukuran Roll
                                    </span>
                                  </label>
                                </div>
                              )}
                            </div>
                          )}

                        {/* Finishing (dropdown popover), ubah harga, biaya tambahan */}
                        <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                          <div className="grid grid-cols-2 gap-1.5">
                            <DropdownFinishing
                              options={finishingOptions}
                              selected={formFinishing}
                              onChange={setFormFinishing}
                            />
                            <button
                              type="button"
                              onClick={() => setShowFormHargaModal(true)}
                              className={`w-full py-1.5 rounded-lg text-sm font-semibold transition-all border-2 flex items-center justify-center gap-1 ${
                                formHargaSatuan !== null
                                  ? "border-[#2266ff] bg-blue-50 dark:bg-blue-900/30 text-[#2266ff] dark:text-blue-300"
                                  : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 hover:border-[#2266ff]/50"
                              }`}
                            >
                              <svg
                                className="w-3 h-3 shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                />
                              </svg>
                              {formHargaSatuan !== null ? "Harga Ubah" : "Ubah Harga"}
                            </button>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                                Biaya Tambahan
                                {formBiayaTambahan.length > 0 && (
                                  <span className="ml-1 text-[#00afef]">
                                    ({formBiayaTambahan.length})
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setFormBiayaTambahan([
                                    ...formBiayaTambahan,
                                    { label: "", nominal: 0, modal: 0 },
                                  ])
                                }
                                className="text-xs font-semibold px-1.5 py-0.5 rounded bg-[#00afef]/10 hover:bg-[#00afef]/20 text-[#00afef] transition-colors"
                              >
                                + Tambah
                              </button>
                            </div>
                            {formBiayaTambahan.length === 0 ? (
                              <p className="text-xs text-gray-400 dark:text-slate-500">
                                Ongkir, biaya pasang, dll (opsional)
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {formBiayaTambahan.map((biaya, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-1"
                                  >
                                    <input
                                      type="text"
                                      value={biaya.label}
                                      onChange={(e) => {
                                        const next = [...formBiayaTambahan];
                                        next[idx] = {
                                          ...next[idx],
                                          label: e.target.value,
                                        };
                                        setFormBiayaTambahan(next);
                                      }}
                                      placeholder="Ongkir, pasang, dll"
                                      className="flex-1 min-w-0 px-2 py-1 text-xs bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-300 dark:border-slate-600 rounded focus:outline-none focus:border-[#00afef]"
                                    />
                                    <input
                                      type="number"
                                      step="1000"
                                      min="0"
                                      value={biaya.nominal || ""}
                                      onChange={(e) => {
                                        const next = [...formBiayaTambahan];
                                        next[idx] = {
                                          ...next[idx],
                                          nominal:
                                            parseFloat(e.target.value) || 0,
                                        };
                                        setFormBiayaTambahan(next);
                                      }}
                                       placeholder="0"
                                       className="w-20 px-1.5 py-1 text-xs text-right bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-300 dark:border-slate-600 rounded focus:outline-none focus:border-[#00afef] font-semibold"
                                     />
                                     <input
                                       type="number"
                                       step="1000"
                                       min="0"
                                       value={biaya.modal || ""}
                                       onChange={(e) => {
                                         const next = [...formBiayaTambahan];
                                         next[idx] = {
                                           ...next[idx],
                                           modal:
                                             parseFloat(e.target.value) || 0,
                                         };
                                         setFormBiayaTambahan(next);
                                       }}
                                       placeholder="Modal"
                                       title="Modal / biaya pihak ketiga (opsional). Porsi ini jadi pengeluaran, sisanya omzet."
                                       className="w-20 px-1.5 py-1 text-xs text-right bg-amber-50 dark:bg-amber-950/20 text-gray-900 dark:text-slate-100 border border-amber-300 dark:border-amber-800 rounded focus:outline-none focus:border-amber-500 font-semibold"
                                     />
                                     <button
                                       type="button"
                                       onClick={() =>
                                         setFormBiayaTambahan(
                                           formBiayaTambahan.filter(
                                             (_, i) => i !== idx,
                                           ),
                                         )
                                       }
                                       className="p-0.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                       aria-label="Hapus biaya"
                                     >
                                      <svg
                                        className="w-3.5 h-3.5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M6 18L18 6M6 6l12 12"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: quantity, roll, add button */}
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
                            {selectedMaterial.butuh_dimensi_status === 1
                              ? "Jumlah lembar"
                              : "Jumlah"}
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const current = parseFloat(quantity) || 0;
                                if (current > 0.01) {
                                  setQuantity((current - 1).toString());
                                }
                              }}
                              className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg border-2 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 font-bold transition-colors"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              step="1"
                              value={quantity}
                              onChange={(e) => setQuantity(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddToCart();
                                }
                              }}
                              className="flex-1 px-3 py-2 text-base text-center border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef] font-semibold dark:bg-slate-800 dark:text-slate-100"
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
                              <label className="block text-sm font-semibold text-gray-600 dark:text-slate-300">
                                Roll yang dipakai
                              </label>
                              <select
                                value={selectedRollSize ?? ""}
                                onChange={(e) =>
                                  setSelectedRollSize(
                                    parseFloat(e.target.value),
                                  )
                                }
                                className="w-full px-3 py-2 text-base border-2 border-[#00afef]/30 rounded-lg focus:outline-none focus:border-[#00afef] bg-white dark:bg-slate-900"
                              >
                                {rollSizes
                                  .map((size) => {
                                    // Harga nesting-aware per roll (jumlah lembar
                                    // diperhitungkan). Matematika disembunyikan;
                                    // kasir hanya melihat total m² + harga.
                                    const pieceCount = Math.max(
                                      1,
                                      Math.round(parseFloat(quantity) || 1),
                                    );
                                    const nest = getNestedRollBilling(
                                      parsedPanjang,
                                      parsedLebar,
                                      pieceCount,
                                      size,
                                    );
                                    if (!nest) return null;
                                    const area = nest.totalAreaRoll;
                                    const harga =
                                      selectedPelanggan?.member_status
                                        ? selectedUnit?.harga_member ||
                                          selectedUnit?.harga_jual ||
                                          0
                                        : selectedUnit?.harga_jual || 0;
                                    const subRaw = area * harga;
                                    return (
                                      <option key={size} value={size}>
                                        {size} m{" — "}
                                        {nest.totalPanjangRoll.toFixed(2)} × Roll{" "}
                                        {size.toFixed(2)} m = {area.toFixed(2)}{" "}
                                        m² @ Rp {formatPosUnitPrice(harga)} · Rp{" "}
                                        {subRaw.toLocaleString("id-ID")}
                                      </option>
                                    );
                                  })}
                              </select>
                              {rollBillingPreview &&
                                selectedRollSize != null && (
                                  <p className="text-sm text-gray-500 dark:text-slate-400 leading-snug">
                                    Tagih:{" "}
                                    <span className="font-semibold text-[#00afef]">
                                      Rp{" "}
                                      {roundUpToThousand(
                                        rollBillingPreview.subtotalRaw,
                                      ).toLocaleString("id-ID")}
                                    </span>
                                  </p>
                                )}
                            </div>
                          )}

                        {/* Catatan item — label kustom untuk identifikasi pengambilan barang */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400 shrink-0">
                            Catatan
                          </span>
                          <input
                            type="text"
                            value={formCatatanItem}
                            onChange={(e) => setFormCatatanItem(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddToCart();
                              }
                            }}
                            placeholder='mis. "Banner Pecel Lele"'
                            className="flex-1 min-w-0 px-2 py-1 text-xs bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-300 dark:border-slate-600 rounded focus:outline-none focus:border-[#00afef]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleAddToCart}
                          className={`w-full py-3 text-white rounded-lg font-bold transition-all shadow-md text-base ${
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
                ) : (
                  /* Empty state saat belum ada produk dipilih */
                  <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-lg p-6 text-gray-400 dark:text-slate-500">
                    <svg
                      className="w-10 h-10 mb-2 opacity-50"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                      />
                    </svg>
                    <p className="font-semibold">Pilih barang di kiri</p>
                    <p className="text-sm mt-1">
                      Detail &amp; harga akan muncul di sini
                    </p>
                  </div>
                )}
                  </div>{/* /kanan form edit */}
                </div>{/* /grid dua kolom */}
              </div>
            </div>
          </div>

          {/* Bar ringkas keranjang — sticky di bawah area kerja */}
          <BarRingkasKeranjang
            itemCount={cart.length}
            total={cartTotal}
            onOpenOverlay={() => setShowOverlayKeranjang(true)}
            onParkClick={() => setShowParkirModal(true)}
            parkedCarts={parkedCarts}
            onLoadParked={handleLoadParked}
            onJadikanPenawaran={handleJadikanPenawaran}
            onDeleteParked={handleDeleteParked}
          />
        </div>

        {/* Sales History */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100 mb-1">
                Riwayat Penjualan
              </h2>
              <p className="text-base text-gray-500 dark:text-slate-400">
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
          <TabelRiwayatPenjualan
            sales={sales}
            loading={historyLoading}
            onDelete={handleDeleteSale}
            onRevert={handleRevertSale}
          />
        </div>
      </div>

      {/* Modals */}
      <ModalTambahCepatPelanggan
        show={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        onSuccess={() => {
          showMsg("success", "Pelanggan berhasil ditambahkan!");
          loadAllData();
        }}
        showNotification={showMsg}
        onCreateCustomer={createPelangganAction}
      />

      {/* Overlay keranjang penuh (detail item + pembayaran) */}
      <OverlayKeranjang
        open={showOverlayKeranjang}
        onClose={() => setShowOverlayKeranjang(false)}
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
        onEditItem={(index) => {
          handleEditCartItem(index);
          setShowOverlayKeranjang(false);
        }}
        onPaymentMethodChange={setPaymentMethod}
        onJumlahBayarChange={setJumlahBayar}
        onCatatanChange={setCatatan}
        onPrioritasChange={setPrioritas}
        onPrintTypeChange={setPrintType}
        onCheckout={handleCheckout}
        customerName={
          selectedPelanggan?.nama || pencarianPelanggan.trim() || undefined
        }
        shopSettings={shopSettings}
        onEditRincianInternal={(index) => {
          setEditingRincianInternalIndex(index);
          setShowOverlayKeranjang(false);
        }}
        onParkClick={() => {
          setShowParkirModal(true);
          setShowOverlayKeranjang(false);
        }}
        parkedCarts={parkedCarts}
        onLoadParked={(id) => {
          handleLoadParked(id);
          setShowOverlayKeranjang(false);
        }}
        onJadikanPenawaran={(id) => {
          handleJadikanPenawaran(id);
          setShowOverlayKeranjang(false);
        }}
        onDeleteParked={handleDeleteParked}
      />

      <ModalBayarPiutang
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

      <ModalTambahItemLainnya
        open={showTambahItemLainnya}
        subkontraktor={subkontraktor}
        kategoriOptions={kategoriBarangOptions}
        onClose={() => setShowTambahItemLainnya(false)}
        onSave={handleSaveTambahItemLainnya}
      />

      <ModalRincianInternalMaklon
        open={editingRincianInternalIndex !== null}
        item={
          editingRincianInternalIndex !== null
            ? cart[editingRincianInternalIndex]
            : null
        }
        subkontraktor={subkontraktor}
        onClose={() => setEditingRincianInternalIndex(null)}
        onSave={(v) => {
          if (editingRincianInternalIndex !== null) {
            handleSaveRincianInternal(editingRincianInternalIndex, v);
          }
        }}
      />

      <ModalParkirKeranjang
        open={showParkirModal}
        defaultLabel={defaultParkLabel}
        onClose={() => setShowParkirModal(false)}
        onConfirm={handlePark}
      />

      <PpnFakturModal
        open={showPpnModal}
        initial={
          ppnFaktur ?? {
            kena_ppn: false,
            ppn_persen: 11,
            ppn_metode: "EKSKLUSIF",
            nsfp_kode_transaksi: "01",
            nsfp_tahun: String(new Date().getFullYear()).slice(-2),
            nsfp_nomor_seri: "",
            tanggal_faktur_pajak: new Date().toISOString().split("T")[0],
            pelanggan_npwp_snapshot: "",
            pelanggan_alamat_npwp_snapshot: "",
            pelanggan_nama_npwp_snapshot: "",
          }
        }
        defaultPpnPersen={11}
        defaultPpnMetode="EKSKLUSIF"
        defaultKodeTransaksi="01"
        pelanggan={
          selectedPelanggan
            ? {
                nama: selectedPelanggan.nama,
                npwp: (selectedPelanggan as any).npwp,
                alamat_npwp: (selectedPelanggan as any).alamat_npwp,
                nama_di_npwp: (selectedPelanggan as any).nama_di_npwp,
              }
            : null
        }
        onSave={(data) => {
          setPpnFaktur(data);
          setShowPpnModal(false);
        }}
        onClear={() => setPpnFaktur(null)}
        onClose={() => setShowPpnModal(false)}
      />

      {confirmDialog && (
        <DialogKonfirmasi
          show={confirmDialog.show}
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
          type="pos"
        />
      )}

      <ModalFakturUmum
        open={showFakturUmumModal}
        value={fakturUmumInput}
        onChange={setFakturUmumInput}
        onClose={() => setShowFakturUmumModal(false)}
        onConfirm={() => {
          setFakturUmum({
            nama: fakturUmumInput.nama.trim(),
            kota: fakturUmumInput.kota.trim() || "Bekasi",
          });
          setShowFakturUmumModal(false);
          // re-trigger checkout now that the info is captured
          setTimeout(() => handleCheckout(), 0);
        }}
      />


      {showFormHargaModal && selectedMaterial && selectedUnit && (
        <ModalEditHarga
          show={showFormHargaModal}
          itemName={selectedMaterial.nama}
          jumlah={(() => {
            // Hitung perkiraan jumlah untuk preview subtotal di modal
            if (selectedMaterial.butuh_dimensi_status === 1) {
              const p = parseFloat(panjang) || 0;
              const l = parseFloat(lebar) || 0;
              const q = Math.max(1, Math.round(parseFloat(quantity) || 1));
              return p > 0 && l > 0 ? p * l * q : q;
            }
            return parseFloat(quantity) || 1;
          })()}
          hargaOriginal={
            selectedPelanggan?.member_status
              ? selectedUnit.harga_member || selectedUnit.harga_jual
              : selectedUnit.harga_jual
          }
          hargaCurrent={
            formHargaSatuan ??
            (selectedPelanggan?.member_status
              ? selectedUnit.harga_member || selectedUnit.harga_jual
              : selectedUnit.harga_jual)
          }
          onClose={() => setShowFormHargaModal(false)}
          onSave={(newHarga, useOriginal) => {
            setFormHargaSatuan(useOriginal ? null : newHarga);
            setShowFormHargaModal(false);
          }}
        />
      )}

      {notice && (
        <ToastNotifikasi type={notice.type} message={notice.message} />
      )}
    </>
  );
}
