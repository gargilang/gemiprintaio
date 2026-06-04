/**
 * POS/Sales Service
 * Universal API for Point of Sale on Tauri and Web
 *
 * Handles: Sales transactions, Receivables, Stock management, Finance entries
 */

import "server-only";

import {
  db,
  generateId,
  getCurrentTimestamp,
  getServerSupabaseClient,
} from "../db-unified";
import {
  createMaklonPurchase,
  deleteMaklonPurchasesForSale,
} from "./purchases-service";
import { recalculateCashbookIfAvailable } from "./finance-service";
import {
  getInventoryMovements,
  postInventoryMovement,
} from "./inventory-service";
import { hitungPpn } from "../ppn-helpers";
import { getShopSettings } from "./shop-settings-service";

// ============================================================================
// TIPE
// ============================================================================

export interface Sale {
  id: string;
  nomor_faktur: string;
  pelanggan_id?: string | null;
  pelanggan_nama?: string;
  pelanggan_nama_snapshot?: string | null;
  pelanggan_kota?: string | null;
  total_jumlah: number;
  jumlah_dibayar: number;
  jumlah_kembalian: number;
  metode_pembayaran: string;
  kasir_id?: string | null;
  kasir_nama?: string;
  catatan?: string | null;
  dibuat_pada?: string;
  diperbarui_pada?: string;
  status_pembayaran?: "LUNAS" | "AKTIF" | "SEBAGIAN";
  status_transaksi?: "DRAFT" | "POSTED" | "VOIDED";
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  sisa_piutang?: number;
  has_pelunasan?: boolean;
  member_status?: boolean | number;
  items?: SaleItem[];
  /** Header-level extra charges. */
  biaya_tambahan?: Array<{ id?: string; label: string; nominal: number; urutan?: number }>;
  biaya_tambahan_total?: number;
}

export interface SaleItem {
  id: string;
  penjualan_id: string;
  barang_id: string;
  barang_nama?: string;
  harga_satuan_id?: string | null;
  jumlah: number;
  nama_satuan: string;
  faktor_konversi: number;
  harga_satuan: number;
  subtotal: number;
  hpp_satuan?: number;
  hpp_total?: number;
  gross_profit?: number;
  gross_margin?: number;
  panjang?: number | null;
  lebar?: number | null;
  billed_panjang?: number | null;
  billed_lebar?: number | null;
  recommended_roll_width_m?: number | null;
  roll_inventory_deferred?: number | null;
  dibuat_pada?: string;
}

export interface Receivable {
  id: string;
  id_penjualan: string;
  nomor_faktur?: string;
  pelanggan_id?: string | null;
  pelanggan_nama?: string;
  pelanggan_telepon?: string;
  pelanggan_alamat?: string;
  jumlah_piutang: number;
  jumlah_terbayar: number;
  sisa_piutang: number;
  jatuh_tempo?: string | null;
  status: "AKTIF" | "SEBAGIAN" | "LUNAS";
  catatan?: string | null;
  total_penjualan?: number;
  metode_pembayaran?: string;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

export interface POSInitData {
  customers: any[];
  materials: any[];
  sales: Sale[];
  /** Vendor yang bisa dipakai sebagai subkontraktor maklon (tipe SUBKONTRAKTOR atau KEDUANYA). */
  subkontraktor: any[];
}

export interface CreateSaleData {
  pelanggan_id?: string;
  pelanggan_nama_snapshot?: string;
  pelanggan_kota?: string;
  items: Array<{
    barang_id: string;
    harga_satuan_id?: string;
    jumlah: number;
    nama_satuan: string;
    faktor_konversi: number;
    harga_satuan: number;
    subtotal: number;
    panjang?: number;
    lebar?: number;
    billed_panjang?: number;
    billed_lebar?: number;
    recommended_roll_width_m?: number;
    selectedRollSize?: number;
    finishing?: Array<{
      jenis_finishing: string;
      keterangan?: string;
    }>;
    /**
     * Tipe baris penjualan. `BARANG` (default) adalah barang inventori biasa;
     * `MAKLON` adalah baris subkontrak yang dikerjakan oleh percetakan lain —
     * otomatis membuat pembelian terkait ke vendor itu.
     * `JASA` adalah baris layanan non-inventori (tidak ada auto-PO).
     */
    tipe_item?: "BARANG" | "JASA" | "MAKLON";
    /** Wajib saat `tipe_item === 'MAKLON'`. */
    vendor_subkontrak_id?: string | null;
    /** Total biaya subkontrak untuk baris ini (jadi HPP + baris PO maklon). */
    biaya_subkontrak?: number | null;
    /** Wajib saat `tipe_item === 'MAKLON'`. */
    metode_bayar_vendor?: "CASH" | "NET30" | null;
    /** Deskripsi bebas yang dipakai di faktur + struk thermal untuk baris maklon. */
    deskripsi_pekerjaan?: string | null;
  }>;
  total_jumlah: number;
  jumlah_dibayar: number;
  jumlah_kembalian: number;
  metode_pembayaran:
    | "CASH"
    | "TRANSFER"
    | "QRIS"
    | "DEBIT"
    | "DOWN_PAYMENT"
    | "NET30";
  catatan?: string;
  kasir_id?: string;
  tanggal?: string;
  prioritas?: "NORMAL" | "KILAT";
  // PPN keluaran (opsional). Kalau tidak diset, kena_ppn=0.
  kena_ppn?: boolean;
  ppn_persen?: number;
  ppn_metode?: "EKSKLUSIF" | "INKLUSIF";
  /** NSFP yang akan dipakai. Wajib kalau kena_ppn=true. */
  nsfp_kode_transaksi?: string;
  nsfp_tahun?: string;
  nsfp_nomor_seri?: string;
  tanggal_faktur_pajak?: string;
  /** NPWP pelanggan saat penerbitan faktur (snapshot). */
  pelanggan_npwp_snapshot?: string;
  pelanggan_alamat_npwp_snapshot?: string;
  pelanggan_nama_npwp_snapshot?: string;
  /**
   * Biaya tambahan tingkat header (ongkir, biaya pasang, dll). Tiap baris diisi
   * label bebas + nominal. Total digulung ke penjualan.biaya_tambahan_total.
   */
  biaya_tambahan?: Array<{ label: string; nominal: number }>;
}

// ============================================================================
// FUNGSI HELPER
// ============================================================================

function getTodayJakarta(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Jakarta",
  });
}

function positiveNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isRollInventoryLine(material: any, item: {
  panjang?: number | null;
  lebar?: number | null;
  recommended_roll_width_m?: number | null;
  selectedRollSize?: number | null;
}): boolean {
  return (
    Number(material?.lacak_inventori_status) !== 0 &&
    Number(material?.butuh_dimensi_status) === 1 &&
    (positiveNumber(item.recommended_roll_width_m) > 0 ||
      positiveNumber(item.selectedRollSize) > 0 ||
      (positiveNumber(item.panjang) > 0 && positiveNumber(item.lebar) > 0))
  );
}

async function fallbackAverageCostPerBaseUnit(
  barangId: string,
  hargaSatuanId?: string | null
): Promise<number> {
  const unitPricesResult = await db.query<any>("harga_barang_satuan", {
    where: { barang_id: barangId },
    orderBy: { column: "urutan_tampilan", ascending: true },
  });
  const rows = unitPricesResult.data || [];
  const preferred = hargaSatuanId
    ? rows.find((r: any) => r.id === hargaSatuanId)
    : null;
  const unit =
    preferred ||
    rows.find((r: any) => Number(r.default_status) === 1) ||
    rows.find((r: any) => Number(r.faktor_konversi) === 1) ||
    rows[0];
  const factor = positiveNumber(unit?.faktor_konversi) || 1;
  return positiveNumber(unit?.harga_beli) / factor;
}

/**
 * Hitung date-part string berdasarkan format reset.
 * daily   → YYYYMMDD
 * monthly → YYYYMM
 * yearly  → YYYY
 * never   → "" (tidak pakai tanggal)
 */
function getDatePart(
  tanggal: string,
  reset: string,
  format: string
): string {
  if (format === "PREFIX-SEQ") return "";
  const d = tanggal.replace(/-/g, "");
  if (reset === "daily") return d;                    // 20260524
  if (reset === "monthly") return d.slice(0, 6);      // 202605
  if (reset === "yearly") return d.slice(0, 4);       // 2026
  return d;                                           // never → still embed full date
}

/**
 * Cek apakah nomor terakhir masih dalam periode yang sama.
 * Kalau iya, ambil urutan terakhirnya; kalau tidak, mulai dari start_seq.
 */
function extractSeqFromNumber(
  lastNumber: string,
  prefix: string,
  format: string,
  datePart: string,
  padding: number,
  startSeq: number
): number {
  if (!lastNumber) return startSeq;
  try {
    if (format === "PREFIX-DATE-SEQ") {
      // Expected: PREFIX-DATEPART-SEQ
      const expectedStart = `${prefix}-${datePart}-`;
      if (!lastNumber.startsWith(expectedStart)) return startSeq;
      const seqStr = lastNumber.slice(expectedStart.length);
      const seq = parseInt(seqStr, 10);
      return isNaN(seq) ? startSeq : seq + 1;
    } else {
      // PREFIX-SEQ: PREFIX-SEQ
      const expectedStart = `${prefix}-`;
      if (!lastNumber.startsWith(expectedStart)) return startSeq;
      const seqStr = lastNumber.slice(expectedStart.length);
      const seq = parseInt(seqStr, 10);
      return isNaN(seq) ? startSeq : seq + 1;
    }
  } catch {
    return startSeq;
  }
}

async function generateInvoiceNumber(tanggal: string): Promise<string> {
  const settings = await getShopSettings();
  const prefix = settings.inv_prefix || "INV";
  const format = settings.inv_format || "PREFIX-DATE-SEQ";
  const reset = settings.inv_reset || "daily";
  const padding = settings.inv_padding ?? 3;
  const startSeq = settings.inv_start_seq ?? 1;

  const datePart = getDatePart(tanggal, reset, format);

  const lastInvoiceResult = await db.query("penjualan", {
    orderBy: { column: "nomor_faktur", ascending: false },
    limit: 1,
  });

  let seq = startSeq;
  if (lastInvoiceResult.data && lastInvoiceResult.data.length > 0) {
    const lastInvoice = lastInvoiceResult.data[0] as any;
    seq = extractSeqFromNumber(
      lastInvoice.nomor_faktur || "",
      prefix,
      format,
      datePart,
      padding,
      startSeq
    );
  }

  const seqStr = String(seq).padStart(Math.max(1, padding), "0");
  if (format === "PREFIX-DATE-SEQ") {
    return `${prefix}-${datePart}-${seqStr}`;
  }
  return `${prefix}-${seqStr}`;
}

async function generateSPKNumber(): Promise<string> {
  const settings = await getShopSettings();
  const prefix = settings.spk_prefix || "SPK";
  const format = settings.spk_format || "PREFIX-SEQ";
  const reset = settings.spk_reset || "never";
  const padding = settings.spk_padding ?? 4;
  const startSeq = settings.spk_start_seq ?? 1;

  const today = new Date().toISOString().slice(0, 10);
  const datePart = getDatePart(today, reset, format);

  const lastOrderResult = await db.query("order_produksi", {
    orderBy: { column: "dibuat_pada", ascending: false },
    limit: 1,
  });

  let seq = startSeq;
  if (lastOrderResult.data && lastOrderResult.data.length > 0) {
    const lastOrder = lastOrderResult.data[0] as any;
    seq = extractSeqFromNumber(
      lastOrder.nomor_spk || "",
      prefix,
      format,
      datePart,
      padding,
      startSeq
    );
  }

  const seqStr = String(seq).padStart(Math.max(1, padding), "0");
  if (format === "PREFIX-DATE-SEQ") {
    return `${prefix}-${datePart}-${seqStr}`;
  }
  return `${prefix}-${seqStr}`;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Ambil data awal halaman POS (pelanggan, barang, penjualan terkini)
 */
export async function getPOSInitData(): Promise<POSInitData> {
  try {
    // Ambil pelanggan
    const customersResult = await db.query("pelanggan", {
      orderBy: { column: "nama", ascending: true },
    });

    // Ambil barang beserta kategori
    const materialsResult = await db.query("barang", {
      orderBy: { column: "frekuensi_terjual", ascending: false },
    });

    // Ambil kategori untuk pengayaan data
    const categoriesResult = await db.query("kategori_barang");
    const subcategoriesResult = await db.query("subkategori_barang");

    const categories = categoriesResult.data || [];
    const subcategories = subcategoriesResult.data || [];
    const materials = materialsResult.data || [];

    // Lengkapi barang dengan harga satuan dan nama kategori
    const materialsWithPrices = await Promise.all(
      materials.map(async (material: any) => {
        const unitPricesResult = await db.query("harga_barang_satuan", {
          where: { barang_id: material.id },
          orderBy: { column: "urutan_tampilan", ascending: true },
        });

        const category = categories.find(
          (c: any) => c.id === material.kategori_id
        );
        const subcategory = subcategories.find(
          (sc: any) => sc.id === material.subkategori_id
        );

        return {
          ...material,
          kategori_nama: category?.nama || null,
          subkategori_nama: subcategory?.nama || null,
          unit_prices: unitPricesResult.data || [],
        };
      })
    );

    // Ambil penjualan terkini (limit 100)
    const sales = await getSales(100);

    // Vendor subkontraktor untuk pemilih baris maklon. Difilter saat fetch
    // supaya payload kecil. Aman jatuh-balik di instalasi yang belum
    // menjalankan migrasi maklon (kolomnya tidak ada).
    let subkontraktor: any[] = [];
    try {
      const vendorsResult = await db.query<any>("vendor", {
        where: { aktif_status: 1 },
        orderBy: { column: "nama_perusahaan", ascending: true },
      });
      subkontraktor = (vendorsResult.data || []).filter((v: any) => {
        const tipe = String(v.tipe_vendor || "").toUpperCase();
        return tipe === "SUBKONTRAKTOR" || tipe === "KEDUANYA";
      });
    } catch (e) {
      console.warn("[getPOSInitData] failed to load subkontraktor vendors:", e);
    }

    return {
      customers: customersResult.data || [],
      materials: materialsWithPrices,
      sales,
      subkontraktor,
    };
  } catch (error) {
    console.error("Error fetching POS init data:", error);
    throw error;
  }
}

/**
 * Ambil data transaksi penjualan — versi batch yang sudah dioptimasi.
 *
 * Pendekatan lama: query N+1 (100 sale × item × barang + cek pelunasan).
 * Pendekatan baru: 6 query datar, semua join dilakukan di memori.
 *
 * Untuk Supabase (web) memakai filter `.in()` dari klien JS langsung.
 * Untuk SQLite (Tauri) tetap pakai pendekatan lama yang berurutan karena
 * adapter db belum menyediakan helper whereIn.
 */
export async function getSales(limit: number = 100): Promise<Sale[]> {
  try {
    const supabase = getServerSupabaseClient();

    // ── Jalur cepat Supabase (web) ────────────────────────────────────────────
    if (supabase) {
      // 1. Penjualan
      const { data: sales, error: salesErr } = await supabase
        .from("penjualan")
        .select("*")
        .order("dibuat_pada", { ascending: false })
        .limit(limit);
      if (salesErr) throw salesErr;
      if (!sales || sales.length === 0) return [];

      const saleIds = sales.map((s: any) => s.id);
      const pelangganIds = [...new Set(sales.map((s: any) => s.pelanggan_id).filter(Boolean))];
      const kasirIds = [...new Set(sales.map((s: any) => s.kasir_id).filter(Boolean))];

      // 2–7. Ambil semua data terkait sekaligus secara paralel
      const [
        itemsRes,
        piutangRes,
        customersRes,
        usersRes,
        pelunasanRes,
        biayaTambahanRes,
      ] = await Promise.all([
        supabase.from("item_penjualan").select("*").in("penjualan_id", saleIds),
        supabase.from("piutang_penjualan").select("*").in("id_penjualan", saleIds),
        pelangganIds.length > 0
          ? supabase.from("pelanggan").select("id,nama,member_status").in("id", pelangganIds)
          : Promise.resolve({ data: [], error: null }),
        kasirIds.length > 0
          ? supabase.from("profil").select("id,nama_pengguna").in("id", kasirIds)
          : Promise.resolve({ data: [], error: null }),
        // Pelunasan dibutuhkan untuk tahu has_pelunasan — diambil sekaligus
        supabase.from("pelunasan_piutang").select("id,id_piutang"),
        // Biaya tambahan tingkat header
        supabase
          .from("biaya_tambahan_penjualan")
          .select("*")
          .in("penjualan_id", saleIds),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (piutangRes.error) throw piutangRes.error;

      const allItems: any[] = itemsRes.data || [];
      const allPiutang: any[] = piutangRes.data || [];
      const allCustomers: any[] = customersRes.data || [];
      const allUsers: any[] = usersRes.data || [];
      const allPelunasan: any[] = pelunasanRes.data || [];
      const allBiayaTambahan: any[] = biayaTambahanRes.data || [];

      // Ambil nama barang untuk semua barang_id unik dalam satu query
      const barangIds = [...new Set(allItems.map((i: any) => i.barang_id).filter(Boolean))];
      const barangMap = new Map<string, string>();
      if (barangIds.length > 0) {
        const { data: barangRows } = await supabase
          .from("barang")
          .select("id,nama")
          .in("id", barangIds);
        for (const b of barangRows || []) {
          barangMap.set(b.id, b.nama);
        }
      }

      // Bangun peta lookup
      const itemsByPenjualanId = new Map<string, any[]>();
      for (const item of allItems) {
        const list = itemsByPenjualanId.get(item.penjualan_id) || [];
        list.push({ ...item, barang_nama: barangMap.get(item.barang_id) || "" });
        itemsByPenjualanId.set(item.penjualan_id, list);
      }

      const piutangBySaleId = new Map<string, any>();
      for (const p of allPiutang) {
        piutangBySaleId.set(p.id_penjualan, p);
      }

      const pelunasanByPiutangId = new Set<string>();
      for (const pl of allPelunasan) {
        pelunasanByPiutangId.add(pl.id_piutang);
      }

      const biayaTambahanBySaleId = new Map<string, any[]>();
      for (const b of allBiayaTambahan) {
        const list = biayaTambahanBySaleId.get(b.penjualan_id) || [];
        list.push({
          id: b.id,
          label: b.label,
          nominal: Number(b.nominal) || 0,
          urutan: b.urutan ?? 0,
        });
        biayaTambahanBySaleId.set(b.penjualan_id, list);
      }
      // Urutkan setiap list berdasarkan urutan
      for (const [, list] of biayaTambahanBySaleId) {
        list.sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));
      }

      const customerMap = new Map<string, any>();
      for (const c of allCustomers) customerMap.set(c.id, c);

      const userMap = new Map<string, any>();
      for (const u of allUsers) userMap.set(u.id, u);

      return sales.map((sale: any) => {
        const customer = customerMap.get(sale.pelanggan_id);
        const kasir = userMap.get(sale.kasir_id);
        const piutang = piutangBySaleId.get(sale.id);
        const has_pelunasan = piutang ? pelunasanByPiutangId.has(piutang.id) : false;

        return {
          ...sale,
          pelanggan_nama: customer?.nama || undefined,
          member_status: customer?.member_status || undefined,
          kasir_nama: kasir?.nama_pengguna || undefined,
          status_pembayaran: piutang?.status || "LUNAS",
          sisa_piutang: piutang?.sisa_piutang || 0,
          has_pelunasan,
          items: itemsByPenjualanId.get(sale.id) || [],
          biaya_tambahan: biayaTambahanBySaleId.get(sale.id) || [],
        };
      });
    }

    // ── Jalur SQLite (Tauri) — berurutan, sama seperti sebelumnya ─────────────
    const salesResult = await db.query<Sale>("penjualan", {
      orderBy: { column: "dibuat_pada", ascending: false },
      limit,
    });

    const sales = salesResult.data || [];

    const customersResult = await db.query("pelanggan");
    const usersResult = await db.query("profil");
    const piutangResult = await db.query("piutang_penjualan");

    const customers = customersResult.data || [];
    const users = usersResult.data || [];
    const piutangList = piutangResult.data || [];

    const salesWithItems = await Promise.all(
      sales.map(async (sale) => {
        const itemsResult = await db.query<SaleItem>("item_penjualan", {
          where: { penjualan_id: sale.id },
        });
        const items = itemsResult.data || [];
        const itemsWithNames = await Promise.all(
          items.map(async (item) => {
            const materialResult = await db.queryOne("barang", {
              where: { id: item.barang_id },
            });
            return { ...item, barang_nama: materialResult.data?.nama || "" };
          })
        );
        const customer = customers.find((c: any) => c.id === sale.pelanggan_id);
        const kasir = users.find((u: any) => u.id === sale.kasir_id);
        const piutang = piutangList.find((p: any) => p.id_penjualan === sale.id);
        let has_pelunasan = false;
        if (piutang) {
          const pelunasanResult = await db.query("pelunasan_piutang", {
            where: { id_piutang: piutang.id },
            limit: 1,
          });
          has_pelunasan = (pelunasanResult.data?.length || 0) > 0;
        }
        // Ambil biaya tambahan untuk penjualan ini (jalur SQLite berurutan)
        const biayaRes = await db.query<any>("biaya_tambahan_penjualan", {
          where: { penjualan_id: sale.id },
        });
        const biayaList = (biayaRes.data || [])
          .map((b: any) => ({
            id: b.id,
            label: b.label,
            nominal: Number(b.nominal) || 0,
            urutan: b.urutan ?? 0,
          }))
          .sort((a: any, b: any) => (a.urutan ?? 0) - (b.urutan ?? 0));
        return {
          ...sale,
          pelanggan_nama: customer?.nama || undefined,
          member_status: customer?.member_status || undefined,
          kasir_nama: kasir?.nama_pengguna || undefined,
          status_pembayaran: piutang?.status || "LUNAS",
          sisa_piutang: piutang?.sisa_piutang || 0,
          has_pelunasan,
          items: itemsWithNames,
          biaya_tambahan: biayaList,
        };
      })
    );

    return salesWithItems;
  } catch (error) {
    console.error("Error fetching sales:", error);
    throw error;
  }
}

/**
 * Buat transaksi penjualan baru
 */
export async function createSale(data: CreateSaleData): Promise<{
  id: string;
  nomor_faktur: string;
  spk_number: string;
}> {
  try {
    // Validasi
    if (!data.items || data.items.length === 0) {
      throw new Error("Items tidak boleh kosong");
    }

    if (!data.total_jumlah || data.total_jumlah <= 0) {
      throw new Error("Total jumlah harus lebih dari 0");
    }

    // Validasi maklon per baris. Tampilkan error sebelum membuka transaksi
    // supaya tidak meninggalkan state parsial.
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.tipe_item === "MAKLON") {
        if (!item.vendor_subkontrak_id) {
          throw new Error(
            `Item ${i + 1} (Maklon): vendor subkontraktor wajib dipilih`
          );
        }
        if (
          !item.biaya_subkontrak ||
          item.biaya_subkontrak <= 0
        ) {
          throw new Error(
            `Item ${i + 1} (Maklon): biaya subkontrak harus lebih dari 0`
          );
        }
        if (
          item.metode_bayar_vendor !== "CASH" &&
          item.metode_bayar_vendor !== "NET30"
        ) {
          throw new Error(
            `Item ${i + 1} (Maklon): metode bayar vendor harus CASH atau NET30`
          );
        }
        if (!item.deskripsi_pekerjaan?.trim()) {
          throw new Error(
            `Item ${i + 1} (Maklon): deskripsi pekerjaan wajib diisi`
          );
        }
      }
    }

    const requiredStock = new Map<string, number>();
    for (const item of data.items) {
      if (item.tipe_item === "MAKLON" || item.tipe_item === "JASA") continue;
      const materialResult = await db.queryOne("barang", {
        where: { id: item.barang_id },
      });
      if (isRollInventoryLine(materialResult.data, item)) continue;
      const qtyBase = item.jumlah * (positiveNumber(item.faktor_konversi) || 1);
      requiredStock.set(item.barang_id, (requiredStock.get(item.barang_id) || 0) + qtyBase);
    }
    for (const [barangId, requiredQty] of requiredStock) {
      const materialResult = await db.queryOne("barang", {
        where: { id: barangId },
      });
      const material = materialResult.data;
      if (material && material.lacak_inventori_status) {
        const available = Number(material.jumlah_stok || 0);
        if (available < requiredQty) {
          throw new Error(
            `Stok tidak cukup untuk ${material.nama || "barang ini"}. Stok tersedia ${available.toLocaleString(
              "id-ID"
            )}, dibutuhkan ${requiredQty.toLocaleString("id-ID")}.`
          );
        }
      }
    }

    const saleId = generateId();
    const tanggalSale = data.tanggal || getTodayJakarta();
    const invoiceNumber = await generateInvoiceNumber(tanggalSale);

    // Tentukan status pembayaran
    const actualPaid = data.jumlah_dibayar || 0;
    const isFullPaymentMethod = ["CASH", "TRANSFER", "QRIS", "DEBIT"].includes(
      data.metode_pembayaran
    );
    const isLunas = isFullPaymentMethod && actualPaid >= data.total_jumlah;
    const isPiutang =
      ["DOWN_PAYMENT", "NET30"].includes(data.metode_pembayaran) ||
      (isFullPaymentMethod && actualPaid < data.total_jumlah && actualPaid > 0);

    let totalHpp = 0;

    // PPN keluaran setup
    const kenaPpn = data.kena_ppn ? 1 : 0;
    const ppnPersen = kenaPpn === 1 ? Number(data.ppn_persen || 0) : 0;
    const ppnMetode: "EKSKLUSIF" | "INKLUSIF" =
      data.ppn_metode === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF";
    const ppnHeaderBreakdown =
      kenaPpn === 1 && ppnPersen > 0
        ? hitungPpn(data.total_jumlah, ppnPersen, ppnMetode)
        : { dpp: data.total_jumlah, ppn: 0, total: data.total_jumlah };

    if (kenaPpn === 1) {
      if (!data.nsfp_kode_transaksi || !data.nsfp_tahun || !data.nsfp_nomor_seri) {
        throw new Error(
          "Faktur kena PPN wajib menyertakan NSFP (Nomor Seri Faktur Pajak) lengkap"
        );
      }
    }

    // Lacak id item maklon yang sudah disisipkan supaya bisa update pembelian_id_terkait
    // setelah auto-PO dibuat. Key-nya adalah indeks item di payload request asal.
    const maklonItemIds = new Map<number, string>();

    // Eksekusi di dalam transaksi
    const saleResultPayload = await db.transaction(async () => {
      // Buat record penjualan
      const sale = {
        id: saleId,
        nomor_faktur: invoiceNumber,
        pelanggan_id: data.pelanggan_id || null,
        pelanggan_nama_snapshot: data.pelanggan_nama_snapshot?.trim() || null,
        pelanggan_kota: data.pelanggan_kota?.trim() || null,
        total_jumlah: data.total_jumlah,
        jumlah_dibayar: actualPaid,
        jumlah_kembalian: data.jumlah_kembalian || 0,
        metode_pembayaran: data.metode_pembayaran,
        kasir_id: data.kasir_id || null,
        catatan: data.catatan?.trim() || null,
        biaya_tambahan_total: (data.biaya_tambahan || [])
          .reduce((sum, b) => sum + (Number(b.nominal) || 0), 0),
        // PPN keluaran
        kena_ppn: kenaPpn,
        ppn_persen: ppnPersen,
        ppn_metode: ppnMetode,
        dpp_total: ppnHeaderBreakdown.dpp,
        ppn_total: ppnHeaderBreakdown.ppn,
        nsfp_kode_transaksi: kenaPpn === 1 ? data.nsfp_kode_transaksi || null : null,
        nsfp_tahun: kenaPpn === 1 ? data.nsfp_tahun || null : null,
        nsfp_nomor_seri: kenaPpn === 1 ? data.nsfp_nomor_seri || null : null,
        tanggal_faktur_pajak:
          kenaPpn === 1 ? data.tanggal_faktur_pajak || tanggalSale : null,
        pelanggan_npwp_snapshot: data.pelanggan_npwp_snapshot || null,
        pelanggan_alamat_npwp_snapshot: data.pelanggan_alamat_npwp_snapshot || null,
        pelanggan_nama_npwp_snapshot: data.pelanggan_nama_npwp_snapshot || null,
      };

      const saleResult = await db.insert("penjualan", sale);
      if (saleResult.error) throw saleResult.error;

      // Sisipkan baris biaya tambahan (ongkir, biaya pasang, dll). Lewati baris
      // dengan label kosong atau nominal 0.
      if (data.biaya_tambahan && data.biaya_tambahan.length > 0) {
        for (let i = 0; i < data.biaya_tambahan.length; i++) {
          const b = data.biaya_tambahan[i];
          const label = b.label?.trim();
          const nominal = Number(b.nominal) || 0;
          if (!label || nominal <= 0) continue;
          const r = await db.insert("biaya_tambahan_penjualan", {
            id: generateId(),
            penjualan_id: saleId,
            label,
            nominal,
            urutan: i,
          });
          if (r.error) throw r.error;
        }
      }

      // Lock NSFP slot kalau dipakai (status TERSEDIA → TERPAKAI). Lakukan
      // sebelum insert items supaya gagal-tertentu di NSFP rollback semua.
      if (
        kenaPpn === 1 &&
        data.nsfp_tahun &&
        data.nsfp_kode_transaksi &&
        data.nsfp_nomor_seri
      ) {
        const nsfpRow = await db.queryOne<any>("nsfp_pool", {
          where: {
            tahun: data.nsfp_tahun,
            kode_transaksi: data.nsfp_kode_transaksi,
            nomor_seri: data.nsfp_nomor_seri,
          },
        });
        if (!nsfpRow.data) {
          throw new Error(
            `NSFP ${data.nsfp_kode_transaksi}.${data.nsfp_tahun}.${data.nsfp_nomor_seri} tidak ditemukan di pool. Impor dulu dari Coretax.`
          );
        }
        if (nsfpRow.data.status !== "TERSEDIA") {
          throw new Error(
            `NSFP ${data.nsfp_kode_transaksi}.${data.nsfp_tahun}.${data.nsfp_nomor_seri} sudah ${nsfpRow.data.status}. Pilih nomor lain.`
          );
        }
        const upd = await db.update("nsfp_pool", nsfpRow.data.id, {
          status: "TERPAKAI",
          penjualan_id: saleId,
          diperbarui_pada: getCurrentTimestamp(),
        });
        if (upd.error) throw upd.error;
      }

      // Sisipkan baris penjualan dan perbarui stok
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const itemId = generateId();
        const isMaklon = item.tipe_item === "MAKLON";
        const isJasa = item.tipe_item === "JASA";

        // BARANG: HPP berasal dari biaya rata-rata bergerak barang.
        // MAKLON: HPP = biaya_subkontrak (yang dibayar ke percetakan rekanan).
        // JASA: HPP = 0 (tidak ada barang dasar; murni margin).
        let hppSatuan = 0;
        let hppTotal = 0;
        let material: any = null;
        if (isMaklon) {
          const biaya = Number(item.biaya_subkontrak) || 0;
          hppTotal = biaya;
          hppSatuan = item.jumlah > 0 ? biaya / item.jumlah : biaya;
        } else if (isJasa) {
          hppSatuan = 0;
          hppTotal = 0;
        } else {
          const materialResult = await db.queryOne("barang", {
            where: { id: item.barang_id },
          });
          material = materialResult.data;
          const averageCostPerBaseUnit =
            positiveNumber(material?.average_cost_per_base_unit) ||
            (await fallbackAverageCostPerBaseUnit(
              item.barang_id,
              item.harga_satuan_id
            ));
          hppSatuan =
            averageCostPerBaseUnit *
            (positiveNumber(item.faktor_konversi) || 1);
          hppTotal = hppSatuan * item.jumlah;
        }
        const recommendedRollWidth =
          positiveNumber(item.recommended_roll_width_m) ||
          positiveNumber(item.selectedRollSize) ||
          null;
        const rollInventoryDeferred =
          !isMaklon && !isJasa && isRollInventoryLine(material, {
            ...item,
            recommended_roll_width_m: recommendedRollWidth,
          });
        const grossProfit = item.subtotal - hppTotal;
        const grossMargin =
          item.subtotal > 0 ? (grossProfit / item.subtotal) * 100 : 0;
        totalHpp += hppTotal;

        // Per-line PPN breakdown (kalau header kena_ppn=1)
        const lineBreakdown =
          kenaPpn === 1 && ppnPersen > 0
            ? hitungPpn(item.subtotal, ppnPersen, ppnMetode)
            : { dpp: item.subtotal, ppn: 0, total: item.subtotal };
        const lineDppSatuan =
          item.jumlah !== 0 ? lineBreakdown.dpp / item.jumlah : 0;
        const linePpnSatuan =
          item.jumlah !== 0 ? lineBreakdown.ppn / item.jumlah : 0;

        const saleItem = {
          id: itemId,
          penjualan_id: saleId,
          // Baris maklon memakai barang placeholder yang sudah di-seed agar FK valid
          // tanpa memasukkan baris stok palsu di katalog.
          barang_id: isMaklon ? "barang-jasa-maklon" : item.barang_id,
          harga_satuan_id: isMaklon
            ? "harga-jasa-maklon-pcs"
            : item.harga_satuan_id || null,
          jumlah: item.jumlah,
          nama_satuan: item.nama_satuan,
          faktor_konversi: item.faktor_konversi,
          harga_satuan: item.harga_satuan,
          subtotal: item.subtotal,
          hpp_satuan: hppSatuan,
          hpp_total: hppTotal,
          gross_profit: grossProfit,
          gross_margin: grossMargin,
          panjang: item.panjang ?? null,
          lebar: item.lebar ?? null,
          billed_panjang: item.billed_panjang ?? null,
          billed_lebar: item.billed_lebar ?? null,
          recommended_roll_width_m: recommendedRollWidth,
          roll_inventory_deferred: rollInventoryDeferred ? 1 : 0,
          tipe_item: item.tipe_item || "BARANG",
          vendor_subkontrak_id: isMaklon ? item.vendor_subkontrak_id : null,
          biaya_subkontrak: isMaklon ? item.biaya_subkontrak : null,
          metode_bayar_vendor: isMaklon ? item.metode_bayar_vendor : null,
          pembelian_id_terkait: null,
          deskripsi_pekerjaan: item.deskripsi_pekerjaan?.trim() || null,
          dpp_satuan: lineDppSatuan,
          ppn_satuan: linePpnSatuan,
          dpp_total: lineBreakdown.dpp,
          ppn_total: lineBreakdown.ppn,
        };

        const itemResult = await db.insert("item_penjualan", saleItem);
        if (itemResult.error) throw itemResult.error;

        if (isMaklon) {
          maklonItemIds.set(i, itemId);
          // Baris maklon tidak pernah menyentuh stok atau frekuensi terjual
          // — karena tidak ada barang dasar di katalog kita.
        } else if (material && material.lacak_inventori_status && !rollInventoryDeferred) {
          const stockReduction = item.jumlah * item.faktor_konversi;
          await postInventoryMovement({
            id: `mov-${itemId}`,
            barang_id: item.barang_id,
            tanggal: tanggalSale,
            movement_type: "SALE_ISSUE",
            qty_delta: -stockReduction,
            unit_cost:
              positiveNumber(material.average_cost_per_base_unit) ||
              hppSatuan / (positiveNumber(item.faktor_konversi) || 1),
            source_type: "SALE",
            source_id: saleId,
            source_line_id: itemId,
            catatan: `Penjualan ${invoiceNumber}`,
            dibuat_oleh: data.kasir_id || null,
          });
          await db.update("barang", item.barang_id, {
            frekuensi_terjual: (material.frekuensi_terjual || 0) + 1,
          });
        } else if (material) {
          // Inventori non-tracked (lacak_inventori_status=0): cukup naikkan
          // popularitas supaya grid barang POS berurut benar.
          await db.update("barang", item.barang_id, {
            frekuensi_terjual: (material.frekuensi_terjual || 0) + 1,
          });
        }
      }

      // Buat entri keuangan kalau LUNAS
      if (isLunas) {
        await createFinanceEntry({
          tanggal: tanggalSale,
          kategori_transaksi: "OMZET",
          debit: data.total_jumlah,
          keperluan: await buildKeperluan(
            invoiceNumber,
            data.pelanggan_id,
            data.catatan,
            saleId
          ),
          omzet: data.total_jumlah,
          catatan: data.catatan,
          dibuat_oleh: data.kasir_id,
          reference_type: "SALE",
          reference_id: saleId,
        });
      }

      if (totalHpp > 0) {
        await createFinanceEntry({
          tanggal: tanggalSale,
          kategori_transaksi: "HPP",
          debit: 0,
          kredit: totalHpp,
          keperluan: `HPP ${invoiceNumber} [REF:${saleId}]`,
          omzet: 0,
          biaya_bahan: totalHpp,
          catatan: data.catatan,
          dibuat_oleh: data.kasir_id,
          reference_type: "SALE_HPP",
          reference_id: saleId,
        });
      }

      // Buat piutang kalau perlu
      if (isPiutang) {
        const piutangId = generateId();
        const jatuhTempo =
          data.metode_pembayaran === "NET30"
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0]
            : null;

        const jumlahTerbayar = actualPaid;
        const sisaPiutang = data.total_jumlah - jumlahTerbayar;

        let statusPiutang: "AKTIF" | "SEBAGIAN" = "AKTIF";
        let catatanPiutang = "";

        if (data.metode_pembayaran === "NET30") {
          catatanPiutang = "Piutang dengan jatuh tempo 30 hari";
        } else if (data.metode_pembayaran === "DOWN_PAYMENT") {
          catatanPiutang = "Down Payment - pembayaran sebagian";
          if (sisaPiutang > 0 && jumlahTerbayar > 0) {
            statusPiutang = "SEBAGIAN";
          }
        } else {
          catatanPiutang = `Pembayaran ${data.metode_pembayaran} tidak mencukupi`;
          if (sisaPiutang > 0 && jumlahTerbayar > 0) {
            statusPiutang = "SEBAGIAN";
          }
        }

        const piutang = {
          id: piutangId,
          id_penjualan: saleId,
          jumlah_piutang: data.total_jumlah,
          jumlah_terbayar: jumlahTerbayar,
          sisa_piutang: sisaPiutang,
          jatuh_tempo: jatuhTempo,
          status: statusPiutang,
          catatan: catatanPiutang,
        };

        const piutangResult = await db.insert("piutang_penjualan", piutang);
        if (piutangResult.error) throw piutangResult.error;

        // Kalau ada pembayaran sebagian, catat di keuangan
        if (jumlahTerbayar > 0) {
          await createFinanceEntry({
            tanggal: tanggalSale,
            kategori_transaksi: "PIUTANG",
            debit: jumlahTerbayar,
            keperluan: await buildPiutangKeperluan(
              invoiceNumber,
              data.pelanggan_id,
              data.metode_pembayaran,
              jumlahTerbayar,
              data.total_jumlah,
              saleId
            ),
            omzet: jumlahTerbayar,
            catatan: data.catatan,
            dibuat_oleh: data.kasir_id,
            reference_type: "SALE_RECEIVABLE_DP",
            reference_id: saleId,
          });
        }
      }

      // Buat order produksi
      const spkNumber = await generateSPKNumber();
      const orderId = `OP-${Date.now()}`;

      const customerResult = data.pelanggan_id
        ? await db.queryOne("pelanggan", { where: { id: data.pelanggan_id } })
        : { data: null };

      const productionOrder = {
        id: orderId,
        penjualan_id: saleId,
        nomor_spk: spkNumber,
        pelanggan_nama: customerResult.data?.nama || null,
        total_item: data.items.length,
        status: "MENUNGGU" as const,
        prioritas: data.prioritas || ("NORMAL" as const),
        catatan: data.catatan?.trim() || null,
        dibuat_oleh: data.kasir_id || null,
      };

      const orderResult = await db.insert("order_produksi", productionOrder);
      if (orderResult.error) throw orderResult.error;

      // Buat item produksi
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const isMaklon = item.tipe_item === "MAKLON";

        // Ambil item_penjualan yang sudah dibuat
        const itemPenjualanResult = await db.query("item_penjualan", {
          where: { penjualan_id: saleId },
          orderBy: { column: "dibuat_pada", ascending: true },
          offset: i,
          limit: 1,
        });

        if (itemPenjualanResult.data && itemPenjualanResult.data.length > 0) {
          const itemPenjualan = itemPenjualanResult.data[0];
          const itemProdId = `IP-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;

          // Untuk baris maklon kita pakai deskripsi_pekerjaan sebagai nama item
          // produksi (deskripsi bebas pekerjaan, bukan item katalog).
          // Untuk BARANG/JASA kita lookup nama barang seperti biasa.
          let barangNama = "Unknown";
          if (isMaklon) {
            barangNama = item.deskripsi_pekerjaan?.trim()
              ? `[MAKLON] ${item.deskripsi_pekerjaan.trim()}`
              : "[MAKLON] Pekerjaan subkontrak";
          } else {
            const materialResult = await db.queryOne("barang", {
              where: { id: item.barang_id },
            });
            barangNama = materialResult.data?.nama || "Unknown";
          }

          const productionItem = {
            id: itemProdId,
            order_produksi_id: orderId,
            item_penjualan_id: itemPenjualan.id,
            barang_id: isMaklon ? null : itemPenjualan.barang_id,
            barang_nama: barangNama,
            jumlah: item.jumlah,
            nama_satuan: item.nama_satuan,
            panjang: item.panjang || null,
            lebar: item.lebar || null,
            billed_panjang: item.billed_panjang ?? null,
            billed_lebar: item.billed_lebar ?? null,
            recommended_roll_width_m:
              (itemPenjualan as any).recommended_roll_width_m ?? null,
            roll_inventory_status:
              (itemPenjualan as any).roll_inventory_deferred === 1
                ? "PENDING"
                : "NOT_REQUIRED",
            status: "MENUNGGU" as const,
          };

          const prodItemResult = await db.insert(
            "item_produksi",
            productionItem
          );
          if (prodItemResult.error) throw prodItemResult.error;

          // Buat item finishing kalau ada
          if (item.finishing && item.finishing.length > 0) {
            for (const fin of item.finishing) {
              const finId = `FIN-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 9)}`;

              const finishingItem = {
                id: finId,
                item_produksi_id: itemProdId,
                jenis_finishing: fin.jenis_finishing,
                keterangan: fin.keterangan?.trim() || null,
                status: "MENUNGGU" as const,
              };

              const finResult = await db.insert(
                "item_finishing",
                finishingItem
              );
              if (finResult.error) throw finResult.error;
            }
          }
        }
      }

      return {
        id: saleId,
        nomor_faktur: invoiceNumber,
        spk_number: spkNumber,
      };
    });

    // Maklon: otomatis buat PO vendor untuk baris maklon di penjualan ini.
    // Dilakukan DI LUAR transaksi penjualan utama supaya:
    //   1. Tiap PO maklon jalan di db.transaction-nya sendiri (rollback lebih bersih).
    //   2. Kegagalan di sini tidak rollback penjualan ke pelanggan, yang
    //      adalah hal utama yang dipedulikan kasir. Error tetap dicatat dan
    //      ditampilkan via payload yang dikembalikan, tapi penjualan tetap commit.
    if (maklonItemIds.size > 0) {
      // Kelompokkan item maklon berdasarkan (vendor_subkontrak_id, metode_bayar_vendor).
      // Satu PO per grup: vendor sama + metode bayar sama = satu faktur dari sisi vendor.
      // Beda metode bayar ke vendor yang sama dipecah jadi PO berbeda karena
      // bentuk pembukuannya beda (CASH masuk keuangan, NET30 masuk hutang_pembelian).
      type GroupKey = string;
      const groups = new Map<
        GroupKey,
        {
          vendorId: string;
          metodeBayar: "CASH" | "NET30";
          items: Array<{
            itemIndex: number;
            saleItemId: string;
            deskripsi_pekerjaan: string;
            jumlah: number;
            biaya_subkontrak: number;
          }>;
        }
      >();

      for (const [idx, saleItemId] of maklonItemIds) {
        const it = data.items[idx];
        const key = `${it.vendor_subkontrak_id}::${it.metode_bayar_vendor}`;
        if (!groups.has(key)) {
          groups.set(key, {
            vendorId: it.vendor_subkontrak_id!,
            metodeBayar: it.metode_bayar_vendor as "CASH" | "NET30",
            items: [],
          });
        }
        groups.get(key)!.items.push({
          itemIndex: idx,
          saleItemId,
          deskripsi_pekerjaan: (it.deskripsi_pekerjaan || "").trim(),
          jumlah: it.jumlah,
          biaya_subkontrak: Number(it.biaya_subkontrak) || 0,
        });
      }

      for (const group of groups.values()) {
        try {
          const { id: pembelianId } = await createMaklonPurchase({
            saleId,
            saleInvoiceNumber: invoiceNumber,
            vendorId: group.vendorId,
            metodeBayar: group.metodeBayar,
            tanggal: tanggalSale,
            catatan: data.catatan,
            dibuatOleh: data.kasir_id || null,
            items: group.items.map((g) => ({
              deskripsi_pekerjaan: g.deskripsi_pekerjaan,
              jumlah: g.jumlah,
              biaya_subkontrak: g.biaya_subkontrak,
            })),
          });
          // Tautkan kembali tiap baris penjualan maklon ke PO yang memenuhinya.
          for (const g of group.items) {
            await db.update("item_penjualan", g.saleItemId, {
              pembelian_id_terkait: pembelianId,
            });
          }
        } catch (err) {
          console.error(
            "[createSale] createMaklonPurchase failed for vendor",
            group.vendorId,
            err
          );
          // Tampilkan tapi jangan throw — penjualan sendiri sudah commit.
        }
      }
    }

    await recalculateCashbookIfAvailable();
    return saleResultPayload;
  } catch (error: any) {
    console.error("Error creating sale:", error);
    throw error;
  }
}

/**
 * Hapus penjualan (kembalikan stok dan keuangan).
 *
 * Pola pembersihan best-effort: tiap langkah dibungkus terpisah supaya
 * satu langkah gagal tidak membatalkan langkah lain. Baris penjualan itu
 * sendiri dihapus terakhir — kalau langkah lain berhasil walau sebagian,
 * penjualan tetap dihapus supaya tidak muncul lagi di riwayat. Kegagalan
 * dikumpulkan dan ditampilkan via error yang dilempar supaya pengguna tahu
 * persis apa yang ter-orphan.
 *
 * Untuk transaksi atomik penuh lintas langkah, migrasikan ke fungsi RPC
 * Postgres (lihat roadmap di docs repo).
 */
export async function voidSale(
  id: string,
  reason = "Penjualan dibatalkan",
  actorId?: string | null
): Promise<boolean> {
  const sb =
    process.env.TAURI === "true" || process.env.TAURI === "1"
      ? null
      : getServerSupabaseClient();
  if (sb) {
    const { error } = await sb.rpc("void_sale_with_inventory", {
      sale_id: id,
      reason,
      actor_id: actorId || null,
    });
    if (error) {
      throw new Error(error.message);
    }
    try {
      await deleteMaklonPurchasesForSale(id);
    } catch (err) {
      console.warn("[voidSale] failed to void linked maklon purchases:", err);
    }
    await recalculateCashbookIfAvailable();
    return true;
  }

  const saleResult = await db.queryOne<any>("penjualan", { where: { id } });
  if (saleResult.error) throw saleResult.error;
  const sale = saleResult.data;
  if (!sale) {
    throw new Error("Transaksi tidak ditemukan");
  }
  if (sale.status_transaksi === "VOIDED") {
    throw new Error("Transaksi sudah dibatalkan");
  }

  // Cek status produksi — kalau SPK sudah PROSES atau SELESAI, void tidak
  // diizinkan karena barang sudah dikerjakan. Tampilkan nomor SPK spesifik.
  const prodResult = await db.query<any>("order_produksi", {
    where: { penjualan_id: id },
  });
  if (!prodResult.error) {
    const activeOrders = (prodResult.data || []).filter(
      (o: any) =>
        o.status === "PROSES" ||
        o.status === "SELESAI" ||
        o.status === "PRINTING" ||
        o.status === "FINISHING"
    );
    if (activeOrders.length > 0) {
      const spkList = activeOrders
        .map((o: any) => {
          const status = o.status;
          return `${o.nomor_spk} (${status})`;
        })
        .join(", ");
      throw new Error(
        `Tidak bisa dibatalkan. Penjualan ini sudah masuk produksi: ${spkList}. ` +
          `Batalkan atau selesaikan SPK tersebut dulu sebelum membatalkan penjualan.`
      );
    }
  }

  const piutangResult = await db.query<any>("piutang_penjualan", {
    where: { id_penjualan: id },
  });
  if (piutangResult.error) throw piutangResult.error;

  for (const piutang of piutangResult.data || []) {
    const paymentsResult = await db.query("pelunasan_piutang", {
      where: { id_piutang: piutang.id },
    });
    if (paymentsResult.error) throw paymentsResult.error;
    if ((paymentsResult.data || []).length > 0) {
      throw new Error(
        "Penjualan sudah memiliki pelunasan piutang. Revert pembayaran dulu sebelum membatalkan transaksi."
      );
    }
  }

  await db.transaction(async () => {
    const itemsResult = await db.query<any>("item_penjualan", {
      where: { penjualan_id: id },
    });
    if (itemsResult.error) throw itemsResult.error;
    const movements = await getInventoryMovements({
      source_type: "SALE",
      source_id: id,
    });

    for (const item of itemsResult.data || []) {
      if (item.tipe_item === "MAKLON" || item.tipe_item === "JASA") {
        continue;
      }
      const original = movements.find(
        (m) =>
          m.source_line_id === item.id && m.movement_type === "SALE_ISSUE"
      );
      const qtyBase =
        original?.qty_delta != null
          ? Math.abs(Number(original.qty_delta))
          : Number(item.jumlah || 0) *
            (positiveNumber(item.faktor_konversi) || 1);
      const unitCost =
        positiveNumber(original?.unit_cost) ||
        positiveNumber(item.hpp_satuan) /
          (positiveNumber(item.faktor_konversi) || 1);

      await postInventoryMovement({
        id: original ? `void-${original.id}` : `void-${item.id}`,
        barang_id: item.barang_id,
        tanggal: new Date().toISOString().split("T")[0],
        movement_type: "SALE_VOID",
        qty_delta: qtyBase,
        unit_cost: unitCost,
        source_type: "SALE_VOID",
        source_id: id,
        source_line_id: item.id,
        reversal_of_id: original?.id || null,
        catatan: reason,
        dibuat_oleh: actorId || null,
      });
    }

    const financeResult = await db.query<any>("keuangan");
    if (financeResult.error) throw financeResult.error;
    for (const entry of financeResult.data || []) {
      if (!entry.keperluan?.includes(`[REF:${id}]`)) continue;
      const upd = await db.update("keuangan", entry.id, {
        status_transaksi: "VOIDED",
        voided_at: getCurrentTimestamp(),
        voided_by: actorId || null,
        void_reason: reason,
        diperbarui_pada: getCurrentTimestamp(),
      });
      if (upd.error) throw upd.error;
    }

    for (const piutang of piutangResult.data || []) {
      const upd = await db.update("piutang_penjualan", piutang.id, {
        jumlah_terbayar: 0,
        sisa_piutang: 0,
        status: "LUNAS",
        catatan: `${piutang.catatan || ""} (Penjualan dibatalkan)`.trim(),
        diperbarui_pada: getCurrentTimestamp(),
      });
      if (upd.error) throw upd.error;
    }

    const upd = await db.update("penjualan", id, {
      status_transaksi: "VOIDED",
      voided_at: getCurrentTimestamp(),
      voided_by: actorId || null,
      void_reason: reason,
      diperbarui_pada: getCurrentTimestamp(),
    });
    if (upd.error) throw upd.error;
  });

  try {
    await deleteMaklonPurchasesForSale(id);
  } catch (err) {
    console.warn("[voidSale] failed to void linked maklon purchases:", err);
  }

  await recalculateCashbookIfAvailable();
  return true;
}

export async function deleteSale(id: string): Promise<boolean> {
  return voidSale(id, "Penjualan dibatalkan");

  const failures: string[] = [];

  // Hapus berantai PO maklon yang dibuat otomatis terlebih dahulu.
  try {
    await deleteMaklonPurchasesForSale(id);
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[deleteSale] gagal hapus berantai PO maklon:", e);
    failures.push(`pembersihan PO maklon: ${msg}`);
  }

  // Pastikan penjualan ada sebelum lanjut.
  const saleResult = await db.queryOne("penjualan", { where: { id } });
  if (!saleResult.data) {
    throw new Error("Transaksi tidak ditemukan");
  }

  // Kumpulkan baris penjualan supaya bisa kembalikan stok + bersihkan baris terkait.
  const itemsResult = await db.query("item_penjualan", {
    where: { penjualan_id: id },
  });
  const items = itemsResult.data || [];

  // Langkah 1: kembalikan stok untuk barang yang dilacak inventori. Try/catch
  // per item supaya satu barang yang hilang tidak merusak alur lain.
  for (const item of items as any[]) {
    if (item.tipe_item === "MAKLON" || item.tipe_item === "JASA") {
      continue;
    }
    try {
      const materialResult = await db.queryOne("barang", {
        where: { id: item.barang_id },
      });
      const material = materialResult.data;
      if (material && material.lacak_inventori_status) {
        const stockAddition = item.jumlah * (item.faktor_konversi || 1);
        const newStock = (material.jumlah_stok || 0) + stockAddition;
        const upd = await db.update("barang", item.barang_id, {
          jumlah_stok: newStock,
        });
        if (upd.error) throw upd.error;
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[deleteSale] failed to revert stock for ${item.barang_id}:`,
        e
      );
      failures.push(`revert stock ${item.barang_id}: ${msg}`);
    }
  }

  // Langkah 2: hapus entri keuangan yang ditautkan via [REF:<saleId>]. Itu
  // baris OMZET/HPP/PIUTANG yang disuntikkan POS saat penjualan dibuat.
  try {
    const financeResult = await db.query("keuangan");
    const financeEntries = financeResult.data || [];
    const toDelete = financeEntries.filter((entry: any) =>
      entry.keperluan?.includes(`[REF:${id}]`)
    );
    for (const entry of toDelete) {
      try {
        const del = await db.delete("keuangan", (entry as any).id);
        if (del.error) throw del.error;
      } catch (e: any) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(
          `[deleteSale] failed to delete keuangan ${(entry as any).id}:`,
          e
        );
        failures.push(`delete keuangan ${(entry as any).id}: ${msg}`);
      }
    }
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[deleteSale] failed to scan keuangan:", e);
    failures.push(`scan keuangan: ${msg}`);
  }

  // Langkah 3: hapus baris piutang + pelunasan yang ditautkan ke penjualan ini.
  try {
    const piutangResult = await db.query("piutang_penjualan", {
      where: { id_penjualan: id },
    });
    const piutangRows = piutangResult.data || [];
    if (piutangRows.length > 0) {
      const piutang = piutangRows[0] as any;
      try {
        const pelunasanResult = await db.query("pelunasan_piutang", {
          where: { id_piutang: piutang.id },
        });
        for (const pelunasan of pelunasanResult.data || []) {
          try {
            const del = await db.delete(
              "pelunasan_piutang",
              (pelunasan as any).id
            );
            if (del.error) throw del.error;
          } catch (e: any) {
            const msg = e instanceof Error ? e.message : String(e);
            failures.push(
              `delete pelunasan_piutang ${(pelunasan as any).id}: ${msg}`
            );
          }
        }
      } catch (e: any) {
        const msg = e instanceof Error ? e.message : String(e);
        failures.push(`scan pelunasan_piutang: ${msg}`);
      }
      try {
        const del = await db.delete("piutang_penjualan", piutang.id);
        if (del.error) throw del.error;
      } catch (e: any) {
        const msg = e instanceof Error ? e.message : String(e);
        failures.push(`delete piutang_penjualan ${piutang.id}: ${msg}`);
      }
    }
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`scan piutang_penjualan: ${msg}`);
  }

  // Langkah 4: hapus baris penjualan.
  for (const item of items) {
    try {
      const del = await db.delete("item_penjualan", (item as any).id);
      if (del.error) throw del.error;
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`delete item_penjualan ${(item as any).id}: ${msg}`);
    }
  }

  // Langkah 5: hapus header penjualan itu sendiri. Ini satu-satunya langkah
  // yang dianggap fatal — kalau header bertahan, penjualan masih terlihat
  // ke pengguna dan mereka bisa mencoba hapus ulang.
  const deleteResult = await db.delete("penjualan", id);
  if (deleteResult.error) {
    const deleteError: any = deleteResult.error;
    failures.push(
      `delete penjualan ${id}: ${
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError)
      }`
    );
    throw new Error(
      `Gagal menghapus transaksi. Detail: ${failures.join("; ")}`
    );
  }

  await recalculateCashbookIfAvailable();

  // Sampai sini berarti penghapusan berhasil tapi ada kegagalan parsial — tampilkan
  // supaya kasir tahu mungkin perlu pembersihan manual untuk baris orphan.
  if (failures.length > 0) {
    console.warn(
      `[deleteSale] sale ${id} deleted with ${failures.length} non-fatal failures:`,
      failures
    );
    throw new Error(
      `Transaksi terhapus, tetapi ada ${failures.length} kesalahan saat membersihkan data terkait. Periksa log untuk detail.`
    );
  }

  return true;
}

/**
 * Ambil semua piutang
 */
export async function getReceivables(): Promise<Receivable[]> {
  try {
    const piutangResult = await db.query<Receivable>("piutang_penjualan");
    const piutangList = piutangResult.data || [];

    // Filter hanya AKTIF dan SEBAGIAN
    const activeReceivables = piutangList.filter(
      (p: any) => p.status === "AKTIF" || p.status === "SEBAGIAN"
    );

    // Ambil penjualan dan pelanggan untuk pengayaan
    const salesResult = await db.query("penjualan");
    const customersResult = await db.query("pelanggan");

    const sales = salesResult.data || [];
    const customers = customersResult.data || [];

    // Lengkapi data piutang
    const enrichedReceivables = activeReceivables.map((piutang: any) => {
      const sale = sales.find((s: any) => s.id === piutang.id_penjualan);
      const customer = customers.find((c: any) => c.id === sale?.pelanggan_id);

      return {
        ...piutang,
        nomor_faktur: sale?.nomor_faktur || undefined,
        pelanggan_id: sale?.pelanggan_id || undefined,
        pelanggan_nama: customer?.nama || undefined,
        pelanggan_telepon: customer?.telepon || undefined,
        pelanggan_alamat: customer?.alamat || undefined,
        total_penjualan: sale?.total_jumlah || undefined,
        metode_pembayaran: sale?.metode_pembayaran || undefined,
      };
    });

    return enrichedReceivables.sort((a, b) => {
      const dateA = new Date(a.dibuat_pada || 0).getTime();
      const dateB = new Date(b.dibuat_pada || 0).getTime();
      return dateB - dateA;
    });
  } catch (error) {
    console.error("Error fetching receivables:", error);
    throw error;
  }
}

/**
 * Bayar piutang.
 *
 * Langkah (tiap langkah best-effort dengan log error detail):
 *   1. Validasi piutang + jumlah pembayaran.
 *   2. Sisipkan baris pelunasan_piutang.
 *   3. Update total + status piutang_penjualan.
 *   4. Sisipkan entri keuangan (LUNAS / PIUTANG).
 *
 * Langkah 1 + 2 wajib (validasi + record dasar); langkah 3 + 4 ditandai
 * tapi tidak fatal supaya kasir bisa retry / fix manual kalau perlu.
 * Untuk keamanan atomik penuh, migrasikan ke fungsi RPC Postgres.
 */
export async function payReceivable(data: {
  piutang_id: string;
  jumlah_bayar: number;
  tanggal_bayar?: string;
  metode_pembayaran?: string;
  referensi?: string;
  catatan?: string;
  dibuat_oleh?: string;
}): Promise<{
  id: string;
  jumlah_bayar: number;
  status_baru: string;
  sisa_piutang: number;
}> {
  // Validasi — wajib lulus sebelum melakukan tulis apa pun.
  if (!data.jumlah_bayar || data.jumlah_bayar <= 0) {
    throw new Error("Jumlah pembayaran harus lebih dari 0");
  }

  const piutangResult = await db.queryOne("piutang_penjualan", {
    where: { id: data.piutang_id },
  });
  if (!piutangResult.data) {
    throw new Error("Piutang tidak ditemukan");
  }
  const piutang = piutangResult.data as any;

  if (data.jumlah_bayar > piutang.sisa_piutang) {
    throw new Error("Jumlah pembayaran tidak boleh melebihi sisa piutang");
  }

  // Resolve penjualan + pelanggan untuk string keperluan keuangan.
  const saleResult = await db.queryOne("penjualan", {
    where: { id: piutang.id_penjualan },
  });
  const sale = saleResult.data;
  let customer: any = null;
  if (sale?.pelanggan_id) {
    const customerResult = await db.queryOne("pelanggan", {
      where: { id: sale.pelanggan_id },
    });
    customer = customerResult.data;
  }

  const failures: string[] = [];

  // Langkah 1 (wajib): buat record pembayaran. Tanpa baris ini, pembayaran
  // dianggap tidak pernah terjadi — keluar daripada menulis state parsial.
  const paymentId = generateId();
  const payment = {
    id: paymentId,
    id_piutang: data.piutang_id,
    tanggal_bayar: data.tanggal_bayar || getTodayJakarta(),
    jumlah_bayar: data.jumlah_bayar,
    metode_pembayaran: data.metode_pembayaran || "CASH",
    referensi: data.referensi || null,
    catatan: data.catatan || null,
    dibuat_oleh: data.dibuat_oleh || null,
  };
  const paymentResult = await db.insert("pelunasan_piutang", payment);
  if (paymentResult.error) {
    throw paymentResult.error;
  }

  // Langkah 2 (best-effort): update total + status piutang.
  const newJumlahTerbayar = piutang.jumlah_terbayar + data.jumlah_bayar;
  const newSisaPiutang = piutang.sisa_piutang - data.jumlah_bayar;
  const newStatus =
    newSisaPiutang <= 0
      ? "LUNAS"
      : newJumlahTerbayar > 0
        ? "SEBAGIAN"
        : "AKTIF";

  try {
    const upd = await db.update("piutang_penjualan", data.piutang_id, {
      jumlah_terbayar: newJumlahTerbayar,
      sisa_piutang: newSisaPiutang,
      status: newStatus,
    });
    if (upd.error) throw upd.error;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[payReceivable] failed to update piutang:", e);
    failures.push(`update piutang: ${msg}`);
  }

  // Langkah 3 (best-effort): buat entri keuangan yang sesuai.
  try {
    const kategori = newStatus === "LUNAS" ? "LUNAS" : "PIUTANG";
    let keperluan = `Bayar Piutang ${sale?.nomor_faktur || ""}`;
    if (customer) {
      keperluan += ` - ${customer.nama}`;
    }
    if (newStatus === "LUNAS") {
      keperluan += " (LUNAS)";
    } else {
      keperluan += ` (Sisa: Rp ${newSisaPiutang.toLocaleString("id-ID")})`;
    }
    keperluan += ` [REF:${piutang.id_penjualan}]`;

    await createFinanceEntry({
      tanggal: data.tanggal_bayar || getTodayJakarta(),
      kategori_transaksi: kategori,
      debit: data.jumlah_bayar,
      keperluan,
      omzet: data.jumlah_bayar,
      catatan: data.catatan,
      dibuat_oleh: data.dibuat_oleh,
      reference_type: "SALE_RECEIVABLE_PAYMENT",
      reference_id: piutang.id_penjualan,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[payReceivable] failed to create finance entry:", e);
    failures.push(`finance entry: ${msg}`);
  }

  await recalculateCashbookIfAvailable();

  if (failures.length > 0) {
    console.warn(
      `[payReceivable] payment ${paymentId} recorded with ${failures.length} non-fatal failures:`,
      failures
    );
    // Catatan: kita sengaja TIDAK throw di sini. Baris pembayaran adalah
    // sumber kebenaran — kehilangan baris itu jauh lebih buruk daripada
    // status piutang sedikit out-of-sync. Tampilkan warning lewat console
    // dan biarkan caller lanjut sukses.
  }

  return {
    id: paymentId,
    jumlah_bayar: data.jumlah_bayar,
    status_baru: newStatus,
    sisa_piutang: newSisaPiutang,
  };
}

/**
 * Revert pembayaran (jadikan piutang AKTIF lagi)
 */
export async function revertSalePayment(data: {
  sale_id: string;
  dibuat_oleh?: string;
}): Promise<number> {
  // Fase validasi — wajib sukses sebelum ada penghapusan apa pun.
  const saleResult = await db.queryOne("penjualan", {
    where: { id: data.sale_id },
  });
  if (!saleResult.data) {
    throw new Error("Penjualan tidak ditemukan");
  }
  const sale = saleResult.data;

  const piutangResult = await db.query("piutang_penjualan", {
    where: { id_penjualan: data.sale_id },
  });
  if (!piutangResult.data || piutangResult.data.length === 0) {
    throw new Error("Transaksi ini tidak memiliki piutang");
  }
  const piutang = piutangResult.data[0] as any;

  const paymentsResult = await db.query("pelunasan_piutang", {
    where: { id_piutang: piutang.id },
  });
  const payments = paymentsResult.data || [];
  if (payments.length === 0) {
    throw new Error(
      "Tidak ada catatan pembayaran piutang untuk transaksi ini"
    );
  }

  // Pembersihan best-effort. Tiap langkah terisolasi supaya satu kegagalan
  // tidak membatalkan langkah lain.
  const failures: string[] = [];

  // Langkah 1: hapus semua record pembayaran.
  for (const payment of payments) {
    try {
      const del = await db.delete(
        "pelunasan_piutang",
        (payment as any).id
      );
      if (del.error) throw del.error;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[revertSalePayment] failed to delete pelunasan_piutang ${(payment as any).id}:`,
        e
      );
      failures.push(`delete pelunasan_piutang ${(payment as any).id}: ${msg}`);
    }
  }

  // Langkah 2: hapus entri keuangan terkait (LUNAS / PIUTANG yang match faktur).
  try {
    const financeResult = await db.query("keuangan");
    const financeEntries = financeResult.data || [];
    for (const entry of financeEntries as any[]) {
      if (
        (entry.kategori_transaksi === "LUNAS" ||
          entry.kategori_transaksi === "PIUTANG") &&
        entry.keperluan?.includes(sale.nomor_faktur)
      ) {
        try {
          const del = await db.delete("keuangan", entry.id);
          if (del.error) throw del.error;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          failures.push(`delete keuangan ${entry.id}: ${msg}`);
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`scan keuangan: ${msg}`);
  }

  // Langkah 3: reset piutang ke kondisi awal.
  try {
    const upd = await db.update("piutang_penjualan", piutang.id, {
      jumlah_terbayar: 0,
      sisa_piutang: piutang.jumlah_piutang,
      status: "AKTIF",
    });
    if (upd.error) throw upd.error;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`reset piutang: ${msg}`);
  }

  // Langkah 4: perbarui timestamp diperbarui_pada di penjualan.
  try {
    const upd = await db.update("penjualan", data.sale_id, {
      diperbarui_pada: getCurrentTimestamp(),
    });
    if (upd.error) throw upd.error;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`bump penjualan timestamp: ${msg}`);
  }

  await recalculateCashbookIfAvailable();

  if (failures.length > 0) {
    console.warn(
      `[revertSalePayment] sale ${data.sale_id} reverted with ${failures.length} non-fatal failures:`,
      failures
    );
    throw new Error(
      `Pembayaran sebagian berhasil direvert (${payments.length} pembayaran), tetapi ada ${failures.length} kesalahan saat membersihkan data terkait. Periksa log untuk detail.`
    );
  }

  return payments.length;
}

// ============================================================================
// FUNGSI HELPER (PRIVATE)
// ============================================================================

async function createFinanceEntry(data: {
  tanggal: string;
  kategori_transaksi: string;
  debit?: number;
  kredit?: number;
  keperluan: string;
  omzet?: number;
  biaya_bahan?: number;
  catatan?: string | null;
  dibuat_oleh?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
}) {
  // Ambil urutan_tampilan tertinggi
  const maxOrderResult = await db.query("keuangan", {
    orderBy: { column: "urutan_tampilan", ascending: false },
    limit: 1,
  });

  const maxOrder =
    maxOrderResult.data && maxOrderResult.data.length > 0
      ? (maxOrderResult.data[0] as any).urutan_tampilan
      : 0;

  const nextDisplayOrder = (maxOrder || 0) + 1;

  const keuanganId = generateId();
  const debit = data.debit ?? 0;
  const kredit = data.kredit ?? 0;
  const finance = {
    id: keuanganId,
    tanggal: data.tanggal,
    kategori_transaksi: data.kategori_transaksi,
    debit,
    kredit,
    keperluan: data.keperluan,
    omzet: data.omzet ?? 0,
    biaya_bahan: data.biaya_bahan ?? 0,
    catatan: data.catatan || null,
    dibuat_oleh: data.dibuat_oleh || null,
    urutan_tampilan: nextDisplayOrder,
    reference_type: data.reference_type || null,
    reference_id: data.reference_id || null,
  };

  const result = await db.insert("keuangan", finance);
  if (result.error) throw result.error;
}

async function buildKeperluan(
  invoiceNumber: string,
  pelanggan_id?: string,
  catatan?: string,
  saleId?: string
): Promise<string> {
  let keperluan = `Penjualan ${invoiceNumber}`;

  if (pelanggan_id) {
    const customerResult = await db.queryOne("pelanggan", {
      where: { id: pelanggan_id },
    });
    if (customerResult.data) {
      keperluan += ` - ${customerResult.data.nama}`;
    } else {
      keperluan += " - Pelanggan Umum";
    }
  } else {
    keperluan += " - Pelanggan Umum";
  }

  if (catatan?.trim()) {
    const excerpt = catatan.trim().substring(0, 25);
    keperluan += ` (${excerpt}${catatan.trim().length > 25 ? "..." : ""})`;
  }

  if (saleId) {
    keperluan += ` [REF:${saleId}]`;
  }

  return keperluan;
}

async function buildPiutangKeperluan(
  invoiceNumber: string,
  pelanggan_id?: string,
  metode_pembayaran?: string,
  jumlahTerbayar?: number,
  total_jumlah?: number,
  saleId?: string
): Promise<string> {
  let keperluan = "";

  if (metode_pembayaran === "DOWN_PAYMENT") {
    keperluan = `DP ${invoiceNumber}`;
  } else {
    keperluan = `Pembayaran Sebagian ${invoiceNumber}`;
  }

  if (pelanggan_id) {
    const customerResult = await db.queryOne("pelanggan", {
      where: { id: pelanggan_id },
    });
    if (customerResult.data) {
      keperluan += ` - ${customerResult.data.nama}`;
    } else {
      keperluan += " - Pelanggan Umum";
    }
  } else {
    keperluan += " - Pelanggan Umum";
  }

  if (jumlahTerbayar && total_jumlah) {
    keperluan += ` (Rp ${jumlahTerbayar.toLocaleString(
      "id-ID"
    )} dari Rp ${total_jumlah.toLocaleString("id-ID")})`;
  }

  if (saleId) {
    keperluan += ` [REF:${saleId}]`;
  }

  return keperluan;
}
