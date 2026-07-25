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
import {
  listKatalogMaklon,
  type KatalogMaklon,
} from "./katalog-maklon-service";
import {
  DEFAULT_NOMOR_DATE_FORMAT,
  buildNomorUrut,
  extractNomorSequence,
  formatNomorDatePart,
  normalizeNomorDateFormat,
  sameNomorResetScope,
  type NomorFormat,
  type NomorReset,
} from "../numbering-utils";

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
  biaya_tambahan?: Array<{
    id?: string;
    label: string;
    nominal: number;
    urutan?: number;
  }>;
  biaya_tambahan_total?: number;
}

export interface SaleItem {
  id: string;
  penjualan_id: string;
  barang_id: string;
  barang_nama?: string;
  nama_produk_jual?: string | null;
  harga_satuan_id?: string | null;
  jumlah: number;
  jumlah_roll?: number | null;
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
  /** Biaya tambahan yang ditautkan ke item ini (item_penjualan_id). */
  biaya_tambahan?: Array<{ label: string; nominal: number }>;
  /** Label kustom per baris yang ditulis kasir — dicetak di faktur dan struk. */
  catatan_item?: string | null;
  /** String ukuran bebas untuk kolom UKURAN faktur — item sekali pakai. */
  ukuran_display?: string | null;
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

/** Piutang dikelompokkan per pelanggan, diurutkan total_sisa descending. */
export interface ReceivableGroup {
  /** Kunci unik grup: pelanggan_id | `nama:${snapshotLower}` | "__tanpa_nama__" */
  customerKey: string;
  pelanggan_id: string | null;
  /** Nama tampilan pelanggan. */
  pelanggan_nama: string;
  /** true bila pelanggan tidak terdaftar (walk-in tanpa pelanggan_id). */
  is_walk_in: boolean;
  /** Total sisa piutang seluruh tagihan dalam grup. */
  total_sisa: number;
  /** Jumlah tagihan aktif dalam grup. */
  jumlah_tagihan: number;
  /** Tagihan diurutkan FIFO (dibuat_pada asc). */
  tagihan: Receivable[];
}

export interface POSInitData {
  customers: any[];
  materials: any[];
  sales: Sale[];
  /** Vendor yang bisa dipakai sebagai subkontraktor maklon (tipe SUBKONTRAKTOR atau KEDUANYA). */
  subkontraktor: any[];
  katalogMaklon: KatalogMaklon[];
}

export interface CreateSaleData {
  pelanggan_id?: string;
  pelanggan_nama_snapshot?: string;
  pelanggan_kota?: string;
  items: Array<{
    barang_id: string;
    harga_satuan_id?: string;
    jumlah: number;
    jumlah_roll?: number;
    nama_satuan: string;
    nama_produk_jual?: string | null;
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
    metode_bayar_vendor?: "CASH" | "NET30" | "TRANSFER" | null;
    /** Deskripsi bebas yang dipakai di faktur + struk thermal untuk baris maklon. */
    deskripsi_pekerjaan?: string | null;
    /** Biaya tambahan per item, termasuk modal bila ada pengeluaran pihak ketiga. */
    biaya_tambahan?: Array<{ label: string; nominal: number; modal?: number }>;
    /**
     * ID katalog maklon (katalog_maklon) yang dipakai sebagai sumber baris ini.
     * Dipakai oleh safeguard C2: baris maklon tanpa vendor/biaya disimpan
     * sebagai pending (`pending_vendor_hpp=1`) dan dapat direconcile ulang
     * lewat katalog_maklon_id ini.
     */
    katalog_maklon_id?: string | null;
  }>;
  total_jumlah: number;
  jumlah_dibayar: number;
  jumlah_kembalian: number;
  metode_pembayaran:
    "CASH" | "TRANSFER" | "QRIS" | "DEBIT" | "DOWN_PAYMENT" | "NET30";
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
  biaya_tambahan?: Array<{ label: string; nominal: number; modal?: number }>;
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

function isRollInventoryLine(
  material: any,
  item: {
    panjang?: number | null;
    lebar?: number | null;
    recommended_roll_width_m?: number | null;
    selectedRollSize?: number | null;
  },
): boolean {
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
  hargaSatuanId?: string | null,
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

function resolveNextSequenceFromRows(
  rows: any[],
  options: {
    numberColumn: string;
    dateColumn: string;
    prefix: string;
    format: NomorFormat;
    reset: NomorReset;
    targetDate: string;
    startSeq: number;
  },
): number {
  let maxSeq = 0;
  for (const row of rows) {
    const rowDate = String(row?.[options.dateColumn] || row?.dibuat_pada || "");
    if (!sameNomorResetScope(rowDate, options.targetDate, options.reset)) {
      continue;
    }
    const seq = extractNomorSequence(
      row?.[options.numberColumn],
      options.prefix,
      options.format,
    );
    if (seq && seq > maxSeq) maxSeq = seq;
  }
  return maxSeq > 0 ? maxSeq + 1 : options.startSeq;
}

async function generateInvoiceNumber(tanggal: string): Promise<string> {
  const settings = await getShopSettings();
  const prefix = settings.inv_prefix || "INV";
  const format = (settings.inv_format || "PREFIX-DATE-SEQ") as NomorFormat;
  const reset = (settings.inv_reset || "daily") as NomorReset;
  const dateFormat = normalizeNomorDateFormat(
    settings.inv_date_format || DEFAULT_NOMOR_DATE_FORMAT,
  );
  const padding = settings.inv_padding ?? 3;
  const startSeq = settings.inv_start_seq ?? 1;

  const datePart =
    format === "PREFIX-DATE-SEQ" ? formatNomorDatePart(tanggal, dateFormat) : "";

  const invoiceResult = await db.query("penjualan", {
    orderBy: { column: "dibuat_pada", ascending: false },
  });

  const seq = resolveNextSequenceFromRows(invoiceResult.data || [], {
    numberColumn: "nomor_faktur",
    dateColumn: "tanggal",
    prefix,
    format,
    reset,
    targetDate: tanggal,
    startSeq,
  });

  const seqStr = String(seq).padStart(Math.max(1, padding), "0");
  return buildNomorUrut(prefix, format, datePart, seqStr);
}

async function generateSPKNumber(): Promise<string> {
  const settings = await getShopSettings();
  const prefix = settings.spk_prefix || "SPK";
  const format = (settings.spk_format || "PREFIX-SEQ") as NomorFormat;
  const reset = (settings.spk_reset || "never") as NomorReset;
  const dateFormat = normalizeNomorDateFormat(
    settings.spk_date_format || DEFAULT_NOMOR_DATE_FORMAT,
  );
  const padding = settings.spk_padding ?? 4;
  const startSeq = settings.spk_start_seq ?? 1;

  const today = new Date().toISOString().slice(0, 10);
  const datePart =
    format === "PREFIX-DATE-SEQ" ? formatNomorDatePart(today, dateFormat) : "";

  const orderResult = await db.query("order_produksi", {
    orderBy: { column: "dibuat_pada", ascending: false },
  });

  const seq = resolveNextSequenceFromRows(orderResult.data || [], {
    numberColumn: "nomor_spk",
    dateColumn: "dibuat_pada",
    prefix,
    format,
    reset,
    targetDate: today,
    startSeq,
  });

  const seqStr = String(seq).padStart(Math.max(1, padding), "0");
  return buildNomorUrut(prefix, format, datePart, seqStr);
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Ambil data awal halaman POS (pelanggan, barang, penjualan terkini)
 */

// ── Queries ──────────────────────────────────────────

export async function getPOSInitData(): Promise<POSInitData> {
  try {
    // Ambil pelanggan
    const customersResult = await db.query("pelanggan", {
      orderBy: { column: "nama", ascending: true },
    });

    // Ambil semua barang katalog (Produk Jual selalu tampil di POS meski
    // muncul_di_pos_status barang induk = 0). Flag muncul_di_pos_status hanya
    // mengontrol kartu barang induk (mis. mobile / barang tanpa satuan jual).
    const materialsResult = await db.query("barang", {
      orderBy: { column: "frekuensi_terjual", ascending: false },
    });

    // Ambil kategori untuk pengayaan data
    const categoriesResult = await db.query("kategori_barang");
    const subcategoriesResult = await db.query("subkategori_barang");

    const categories = categoriesResult.data || [];
    const subcategories = subcategoriesResult.data || [];
    const materials = materialsResult.data || [];

    // Ambil SEMUA harga satuan sekali lalu kelompokkan per barang_id di memori.
    // Hindari N+1: dulu 1 query harga_barang_satuan per produk. orderBy global
    // urutan_tampilan menjaga urutan tiap kelompok karena push berurutan.
    const allPricesResult = await db.query<any>("harga_barang_satuan", {
      orderBy: { column: "urutan_tampilan", ascending: true },
    });
    const pricesByBarang = new Map<string, any[]>();
    for (const price of allPricesResult.data || []) {
      const list = pricesByBarang.get(price.barang_id) || [];
      list.push(price);
      pricesByBarang.set(price.barang_id, list);
    }

    // Indeks kategori/subkategori sekali (hindari .find berulang per produk).
    const categoryById = new Map<string, any>(
      categories.map((c: any) => [c.id, c]),
    );
    const subcategoryById = new Map<string, any>(
      subcategories.map((sc: any) => [sc.id, sc]),
    );

    // Lengkapi barang dengan harga satuan dan nama kategori
    const materialsWithPrices = materials.map((material: any) => ({
      ...material,
      kategori_nama: categoryById.get(material.kategori_id)?.nama || null,
      subkategori_nama:
        subcategoryById.get(material.subkategori_id)?.nama || null,
      unit_prices: pricesByBarang.get(material.id) || [],
    }));

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

    let katalogMaklon: KatalogMaklon[] = [];
    try {
      katalogMaklon = await listKatalogMaklon(true);
    } catch (e) {
      console.warn("[getPOSInitData] failed to load katalog_maklon:", e);
    }

    return {
      customers: customersResult.data || [],
      materials: materialsWithPrices,
      sales,
      subkontraktor,
      katalogMaklon,
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
      const pelangganIds = [
        ...new Set(sales.map((s: any) => s.pelanggan_id).filter(Boolean)),
      ];
      const kasirIds = [
        ...new Set(sales.map((s: any) => s.kasir_id).filter(Boolean)),
      ];

      // 2–7. Ambil semua data terkait sekaligus secara paralel
      const [
        itemsRes,
        piutangRes,
        customersRes,
        usersRes,
        pelunasanRes,
        biayaTambahanRes,
        unitPricesRes,
      ] = await Promise.all([
        supabase.from("item_penjualan").select("*").in("penjualan_id", saleIds),
        supabase
          .from("piutang_penjualan")
          .select("*")
          .in("id_penjualan", saleIds),
        pelangganIds.length > 0
          ? supabase
              .from("pelanggan")
              .select("id,nama,member_status")
              .in("id", pelangganIds)
          : Promise.resolve({ data: [], error: null }),
        kasirIds.length > 0
          ? supabase
              .from("profil")
              .select("id,nama_pengguna")
              .in("id", kasirIds)
          : Promise.resolve({ data: [], error: null }),
        // Pelunasan dibutuhkan untuk tahu has_pelunasan — diambil sekaligus
        supabase.from("pelunasan_piutang").select("id,id_piutang"),
        // Biaya tambahan tingkat header
        supabase
          .from("biaya_tambahan_penjualan")
          .select("*")
          .in("penjualan_id", saleIds),
        supabase.from("harga_barang_satuan").select("id,nama_produk_jual"),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (piutangRes.error) throw piutangRes.error;
      if (unitPricesRes.error) throw unitPricesRes.error;

      const allItems: any[] = itemsRes.data || [];
      const allPiutang: any[] = piutangRes.data || [];
      const allCustomers: any[] = customersRes.data || [];
      const allUsers: any[] = usersRes.data || [];
      const allPelunasan: any[] = pelunasanRes.data || [];
      const allBiayaTambahan: any[] = biayaTambahanRes.data || [];
      const unitPriceNameMap = new Map<string, string>();
      for (const up of unitPricesRes.data || []) {
        if (up.nama_produk_jual)
          unitPriceNameMap.set(up.id, up.nama_produk_jual);
      }

      // Ambil nama barang untuk semua barang_id unik dalam satu query
      const barangIds = [
        ...new Set(allItems.map((i: any) => i.barang_id).filter(Boolean)),
      ];
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
        list.push({
          ...item,
          barang_nama: barangMap.get(item.barang_id) || "",
          nama_produk_jual:
            item.nama_produk_jual ||
            (item.harga_satuan_id
              ? unitPriceNameMap.get(item.harga_satuan_id) || null
              : null),
        });
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
      const biayaByItemId = new Map<string, any[]>();
      for (const b of allBiayaTambahan) {
        const list = biayaTambahanBySaleId.get(b.penjualan_id) || [];
        list.push({
          id: b.id,
          label: b.label,
          nominal: Number(b.nominal) || 0,
          urutan: b.urutan ?? 0,
        });
        biayaTambahanBySaleId.set(b.penjualan_id, list);
        if (b.item_penjualan_id) {
          const itemList = biayaByItemId.get(b.item_penjualan_id) || [];
          itemList.push({
            label: b.label,
            nominal: Number(b.nominal) || 0,
            urutan: b.urutan ?? 0,
          });
          biayaByItemId.set(b.item_penjualan_id, itemList);
        }
      }
      // Urutkan setiap list berdasarkan urutan
      for (const [, list] of biayaTambahanBySaleId) {
        list.sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));
      }
      for (const [, list] of biayaByItemId) {
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
        const has_pelunasan = piutang
          ? pelunasanByPiutangId.has(piutang.id)
          : false;

        return {
          ...sale,
          pelanggan_nama: customer?.nama || undefined,
          member_status: customer?.member_status || undefined,
          kasir_nama: kasir?.nama_pengguna || undefined,
          status_pembayaran: piutang?.status || "LUNAS",
          sisa_piutang: piutang?.sisa_piutang || 0,
          has_pelunasan,
          items: (itemsByPenjualanId.get(sale.id) || []).map((it) => ({
            ...it,
            biaya_tambahan: biayaByItemId.get(it.id) || [],
          })),
          biaya_tambahan: biayaTambahanBySaleId.get(sale.id) || [],
        };
      });
    }

    // ── Jalur SQLite (Tauri) — batch in-memory (D-I3) ─────────────────────────
    // Adapter SQLite belum punya whereIn, jadi ambil tabel terkait sekali saja
    // lalu join di memori. Menghilangkan N+1 (dulu: query item + barang per
    // sale, pelunasan per piutang, biaya per sale).
    const salesResult = await db.query<Sale>("penjualan", {
      orderBy: { column: "dibuat_pada", ascending: false },
      limit,
    });

    const sales = salesResult.data || [];
    if (sales.length === 0) return [];

    const saleIdSet = new Set(sales.map((s: any) => s.id));

    const [
      customersResult,
      usersResult,
      piutangResult,
      allItemsResult,
      allBarangResult,
      allPelunasanResult,
      allBiayaResult,
      allUnitPricesResult,
    ] = await Promise.all([
      db.query("pelanggan"),
      db.query("profil"),
      db.query("piutang_penjualan"),
      db.query<SaleItem>("item_penjualan"),
      db.query("barang"),
      db.query("pelunasan_piutang"),
      db.query<any>("biaya_tambahan_penjualan"),
      db.query<any>("harga_barang_satuan"),
    ]);

    const customers = customersResult.data || [];
    const users = usersResult.data || [];
    const piutangList = (piutangResult.data || []).filter((p: any) =>
      saleIdSet.has(p.id_penjualan),
    );

    const unitPriceNameMap = new Map<string, string>();
    for (const up of (allUnitPricesResult.data || []) as any[]) {
      if (up.nama_produk_jual) unitPriceNameMap.set(up.id, up.nama_produk_jual);
    }

    // Peta nama barang (katalog, jumlahnya terbatas).
    const barangNameMap = new Map<string, string>();
    for (const b of (allBarangResult.data || []) as any[]) {
      barangNameMap.set(b.id, b.nama);
    }

    // Item per penjualan.
    const itemsByPenjualanId = new Map<string, any[]>();
    for (const item of (allItemsResult.data || []) as any[]) {
      if (!saleIdSet.has(item.penjualan_id)) continue;
      const list = itemsByPenjualanId.get(item.penjualan_id) || [];
      list.push({
        ...item,
        barang_nama: barangNameMap.get(item.barang_id) || "",
        nama_produk_jual:
          item.nama_produk_jual ||
          (item.harga_satuan_id
            ? unitPriceNameMap.get(item.harga_satuan_id) || null
            : null),
      });
      itemsByPenjualanId.set(item.penjualan_id, list);
    }

    // Set piutang yang punya pelunasan.
    const piutangWithPelunasan = new Set<string>();
    for (const pl of (allPelunasanResult.data || []) as any[]) {
      piutangWithPelunasan.add(pl.id_piutang);
    }

    // Biaya tambahan per penjualan (terurut) + per item (berdasar item_penjualan_id).
    const biayaBySaleId = new Map<string, any[]>();
    const biayaByItemIdSqlite = new Map<string, any[]>();
    for (const b of (allBiayaResult.data || []) as any[]) {
      if (!saleIdSet.has(b.penjualan_id)) continue;
      const list = biayaBySaleId.get(b.penjualan_id) || [];
      list.push({
        id: b.id,
        label: b.label,
        nominal: Number(b.nominal) || 0,
        urutan: b.urutan ?? 0,
      });
      biayaBySaleId.set(b.penjualan_id, list);
      if (b.item_penjualan_id) {
        const itemList = biayaByItemIdSqlite.get(b.item_penjualan_id) || [];
        itemList.push({
          label: b.label,
          nominal: Number(b.nominal) || 0,
          urutan: b.urutan ?? 0,
        });
        biayaByItemIdSqlite.set(b.item_penjualan_id, itemList);
      }
    }
    for (const [, list] of biayaBySaleId) {
      list.sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));
    }
    for (const [, list] of biayaByItemIdSqlite) {
      list.sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));
    }

    const salesWithItems = sales.map((sale) => {
      const customer = customers.find((c: any) => c.id === sale.pelanggan_id);
      const kasir = users.find((u: any) => u.id === sale.kasir_id);
      const piutang = piutangList.find((p: any) => p.id_penjualan === sale.id);
      const has_pelunasan = piutang
        ? piutangWithPelunasan.has(piutang.id)
        : false;
      return {
        ...sale,
        pelanggan_nama: customer?.nama || undefined,
        member_status: customer?.member_status || undefined,
        kasir_nama: kasir?.nama_pengguna || undefined,
        status_pembayaran: piutang?.status || "LUNAS",
        sisa_piutang: piutang?.sisa_piutang || 0,
        has_pelunasan,
        items: (itemsByPenjualanId.get(sale.id) || []).map((it) => ({
          ...it,
          biaya_tambahan: biayaByItemIdSqlite.get(it.id) || [],
        })),
        biaya_tambahan: biayaBySaleId.get(sale.id) || [],
      };
    });

    return salesWithItems;
  } catch (error) {
    console.error("Error fetching sales:", error);
    throw error;
  }
}

/**
 * Buat transaksi penjualan baru
 */
export async function getReceivables(): Promise<Receivable[]> {
  try {
    const piutangResult = await db.query<Receivable>("piutang_penjualan");
    const piutangList = piutangResult.data || [];

    // Filter hanya AKTIF dan SEBAGIAN
    const activeReceivables = piutangList.filter(
      (p: any) => p.status === "AKTIF" || p.status === "SEBAGIAN",
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
 * Kelompokkan array piutang per pelanggan (fungsi murni, dapat di-test tanpa DB).
 * Kunci pengelompokan: pelanggan_id bila ada; walk-in pakai nama snapshot
 * (trim+lowercase); nama kosong → "__tanpa_nama__".
 * Tagihan diurutkan FIFO (dibuat_pada asc); grup diurutkan total_sisa desc.
 */
export function groupReceivablesByCustomer(
  rows: Receivable[],
): ReceivableGroup[] {
  const map = new Map<string, ReceivableGroup>();
  for (const r of rows) {
    let key: string;
    let isWalkIn: boolean;
    if (r.pelanggan_id) {
      key = r.pelanggan_id;
      isWalkIn = false;
    } else {
      const nama = (r.pelanggan_nama || "").trim();
      key = nama ? `nama:${nama.toLowerCase()}` : "__tanpa_nama__";
      isWalkIn = true;
    }
    let g = map.get(key);
    if (!g) {
      g = {
        customerKey: key,
        pelanggan_id: r.pelanggan_id ?? null,
        pelanggan_nama:
          (r.pelanggan_nama || "").trim() ||
          (isWalkIn ? "Pelanggan Umum" : "—"),
        is_walk_in: isWalkIn,
        total_sisa: 0,
        jumlah_tagihan: 0,
        tagihan: [],
      };
      map.set(key, g);
    }
    g.total_sisa += Number(r.sisa_piutang) || 0;
    g.jumlah_tagihan += 1;
    g.tagihan.push(r);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.tagihan.sort((a, b) =>
      String(a.dibuat_pada || "").localeCompare(String(b.dibuat_pada || "")),
    );
  }
  groups.sort((a, b) => b.total_sisa - a.total_sisa);
  return groups;
}

/**
 * Ambil piutang aktif dan kelompokkan per pelanggan.
 * Reuse `getReceivables()` lalu terapkan `groupReceivablesByCustomer`.
 */
export async function getReceivablesByCustomer(): Promise<ReceivableGroup[]> {
  const rows = await getReceivables();
  return groupReceivablesByCustomer(rows);
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
