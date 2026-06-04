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

// ── Queries ──────────────────────────────────────────

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
