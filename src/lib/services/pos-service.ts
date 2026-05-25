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
// TYPES
// ============================================================================

export interface Sale {
  id: string;
  nomor_invoice: string;
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
  dibuat_pada?: string;
}

export interface Receivable {
  id: string;
  id_penjualan: string;
  nomor_invoice?: string;
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
  /** Vendors that can be used as maklon subcontractors (tipe SUBKONTRAKTOR or KEDUANYA). */
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
    finishing?: Array<{
      jenis_finishing: string;
      keterangan?: string;
    }>;
    /**
     * Sale line type. `BARANG` (default) is a regular inventory item;
     * `MAKLON` is a subcontract line where another print shop produces
     * the work — auto-generates a linked pembelian to that vendor.
     * `JASA` is a non-inventory service line (no auto-PO).
     */
    tipe_item?: "BARANG" | "JASA" | "MAKLON";
    /** Required when `tipe_item === 'MAKLON'`. */
    vendor_subkontrak_id?: string | null;
    /** Total subcontract cost for this line (becomes HPP + maklon PO line). */
    biaya_subkontrak?: number | null;
    /** Required when `tipe_item === 'MAKLON'`. */
    metode_bayar_vendor?: "CASH" | "NET30" | null;
    /** Free-text description used on faktur + thermal receipt for maklon lines. */
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
}

// ============================================================================
// HELPER FUNCTIONS
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
    orderBy: { column: "nomor_invoice", ascending: false },
    limit: 1,
  });

  let seq = startSeq;
  if (lastInvoiceResult.data && lastInvoiceResult.data.length > 0) {
    const lastInvoice = lastInvoiceResult.data[0] as any;
    seq = extractSeqFromNumber(
      lastInvoice.nomor_invoice || "",
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
 * Get init data for POS page (customers, materials, recent sales)
 */
export async function getPOSInitData(): Promise<POSInitData> {
  try {
    // Get customers
    const customersResult = await db.query("pelanggan", {
      orderBy: { column: "nama", ascending: true },
    });

    // Get materials with categories
    const materialsResult = await db.query("barang", {
      orderBy: { column: "frekuensi_terjual", ascending: false },
    });

    // Get categories for enrichment
    const categoriesResult = await db.query("kategori_barang");
    const subcategoriesResult = await db.query("subkategori_barang");

    const categories = categoriesResult.data || [];
    const subcategories = subcategoriesResult.data || [];
    const materials = materialsResult.data || [];

    // Enrich materials with unit prices and category names
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

    // Get recent sales (limit 100)
    const sales = await getSales(100);

    // Subcontractor vendors for the maklon line picker. Filter at fetch time
    // to keep the payload small. Falls back gracefully on installs that
    // haven't run the maklon migration yet (the column will be missing).
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
 * Get sales transactions — optimised batch version.
 *
 * Old approach: N+1 queries (100 sales × items × barang + pelunasan checks)
 * New approach: 6 flat queries, all joins done in-memory.
 *
 * For Supabase (web) we use the JS client's .in() filter directly.
 * For SQLite (Tauri) we fall back to the old sequential approach because
 * the db adapter does not yet expose a whereIn helper.
 */
export async function getSales(limit: number = 100): Promise<Sale[]> {
  try {
    const supabase = getServerSupabaseClient();

    // ── Supabase fast-path (web) ──────────────────────────────────────────────
    if (supabase) {
      // 1. Sales
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

      // 2–6. Batch fetch all related data in parallel
      const [
        itemsRes,
        piutangRes,
        customersRes,
        usersRes,
        pelunasanRes,
      ] = await Promise.all([
        supabase.from("item_penjualan").select("*").in("penjualan_id", saleIds),
        supabase.from("piutang_penjualan").select("*").in("id_penjualan", saleIds),
        pelangganIds.length > 0
          ? supabase.from("pelanggan").select("id,nama,member_status").in("id", pelangganIds)
          : Promise.resolve({ data: [], error: null }),
        kasirIds.length > 0
          ? supabase.from("profil").select("id,nama_pengguna").in("id", kasirIds)
          : Promise.resolve({ data: [], error: null }),
        // We need pelunasan to know has_pelunasan — fetch all at once
        supabase.from("pelunasan_piutang").select("id,id_piutang"),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (piutangRes.error) throw piutangRes.error;

      const allItems: any[] = itemsRes.data || [];
      const allPiutang: any[] = piutangRes.data || [];
      const allCustomers: any[] = customersRes.data || [];
      const allUsers: any[] = usersRes.data || [];
      const allPelunasan: any[] = pelunasanRes.data || [];

      // Fetch barang names for all unique barang_ids in one query
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

      // Build lookup maps
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
        };
      });
    }

    // ── SQLite fallback (Tauri) — sequential, same as before ─────────────────
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
        return {
          ...sale,
          pelanggan_nama: customer?.nama || undefined,
          member_status: customer?.member_status || undefined,
          kasir_nama: kasir?.nama_pengguna || undefined,
          status_pembayaran: piutang?.status || "LUNAS",
          sisa_piutang: piutang?.sisa_piutang || 0,
          has_pelunasan,
          items: itemsWithNames,
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
 * Create new sale transaction
 */
export async function createSale(data: CreateSaleData): Promise<{
  id: string;
  nomor_invoice: string;
  spk_number: string;
}> {
  try {
    // Validation
    if (!data.items || data.items.length === 0) {
      throw new Error("Items tidak boleh kosong");
    }

    if (!data.total_jumlah || data.total_jumlah <= 0) {
      throw new Error("Total jumlah harus lebih dari 0");
    }

    // Per-line maklon validation. Surface errors before opening the
    // transaction so we don't leave partial state behind.
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

    // Determine payment status
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

    // Track inserted maklon item ids so we can update pembelian_id_terkait
    // after the auto-PO is generated. Keyed by item index in the original
    // request payload.
    const maklonItemIds = new Map<number, string>();

    // Execute in transaction
    const saleResultPayload = await db.transaction(async () => {
      // Create sale record
      const sale = {
        id: saleId,
        nomor_invoice: invoiceNumber,
        pelanggan_id: data.pelanggan_id || null,
        pelanggan_nama_snapshot: data.pelanggan_nama_snapshot?.trim() || null,
        pelanggan_kota: data.pelanggan_kota?.trim() || null,
        total_jumlah: data.total_jumlah,
        jumlah_dibayar: actualPaid,
        jumlah_kembalian: data.jumlah_kembalian || 0,
        metode_pembayaran: data.metode_pembayaran,
        kasir_id: data.kasir_id || null,
        catatan: data.catatan?.trim() || null,
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
            `NSFP ${data.nsfp_kode_transaksi}.${data.nsfp_tahun}.${data.nsfp_nomor_seri} tidak ditemukan di pool. Import dulu dari Coretax.`
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

      // Insert sale items and update stock
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const itemId = generateId();
        const isMaklon = item.tipe_item === "MAKLON";
        const isJasa = item.tipe_item === "JASA";

        // For BARANG: HPP comes from the material's moving-average cost.
        // For MAKLON: HPP = biaya_subkontrak (what we pay the partner shop).
        // For JASA: HPP = 0 (no underlying material; pure margin).
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
          // Maklon lines use the seeded placeholder barang to keep the FK valid
          // without introducing a fake stock row in the catalog.
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
          // Maklon lines never touch stock or material frequency — there is
          // no underlying material in our catalog.
        } else if (material && material.lacak_inventori_status) {
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
          // Non-tracked inventory (lacak_inventori_status=0): just bump
          // popularity so the POS material grid sorts correctly.
          await db.update("barang", item.barang_id, {
            frekuensi_terjual: (material.frekuensi_terjual || 0) + 1,
          });
        }
      }

      // Create finance entry if LUNAS
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

      // Create piutang if needed
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

        // If there's a partial payment, record it in finance
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

      // Create production order
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

      // Create production items
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const isMaklon = item.tipe_item === "MAKLON";

        // Get the created item_penjualan
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

          // For maklon lines we use the deskripsi_pekerjaan as the production
          // item name (it's a free-text job description, not a catalog item).
          // For BARANG/JASA we look up the material name as before.
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
            barang_nama: barangNama,
            jumlah: item.jumlah,
            nama_satuan: item.nama_satuan,
            panjang: item.panjang || null,
            lebar: item.lebar || null,
            status: "MENUNGGU" as const,
          };

          const prodItemResult = await db.insert(
            "item_produksi",
            productionItem
          );
          if (prodItemResult.error) throw prodItemResult.error;

          // Create finishing items if specified
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
        nomor_invoice: invoiceNumber,
        spk_number: spkNumber,
      };
    });

    // Maklon: auto-create vendor PO(s) for maklon lines on this sale.
    // Done OUTSIDE the main sale transaction so that:
    //   1. Each maklon PO runs in its own db.transaction (cleaner rollback).
    //   2. Failures here don't roll back the customer-facing sale, which is
    //      what the kasir actually cares about. Errors are logged + surfaced
    //      via the returned payload but the sale itself stays committed.
    if (maklonItemIds.size > 0) {
      // Group maklon items by (vendor_subkontrak_id, metode_bayar_vendor).
      // One PO per group: same vendor, same payment method = single invoice
      // from their side. Mixed payment methods to the same vendor split into
      // separate POs because the bookkeeping shape differs (CASH writes to
      // keuangan, NET30 writes to hutang_pembelian).
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
          // Back-link each maklon sale line to the PO that fulfils it.
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
          // Surface but don't throw — the sale itself is already committed.
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
 * Delete sale (revert stock and finance).
 *
 * Best-effort cleanup pattern: each step is wrapped individually so a
 * single failed step doesn't abort the rest. The sale row itself is
 * deleted last — if everything else succeeded, even partially, we still
 * remove the sale so it doesn't reappear in the history. Failures are
 * collected and surfaced in the thrown error so the user knows exactly
 * what was left orphaned.
 *
 * For full atomic transactions across these steps, migrate to a Postgres
 * RPC function (see roadmap in repo docs).
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

  // Cascade-delete auto-created maklon POs first.
  try {
    await deleteMaklonPurchasesForSale(id);
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[deleteSale] failed to cascade-delete maklon POs:", e);
    failures.push(`maklon PO cleanup: ${msg}`);
  }

  // Confirm sale exists before continuing.
  const saleResult = await db.queryOne("penjualan", { where: { id } });
  if (!saleResult.data) {
    throw new Error("Transaksi tidak ditemukan");
  }

  // Gather sale items so we can revert stock + clean linked rows.
  const itemsResult = await db.query("item_penjualan", {
    where: { penjualan_id: id },
  });
  const items = itemsResult.data || [];

  // Step 1: reverse stock for inventory-tracked items. Per-item try/catch
  // so a single missing material doesn't break the rest of the pipeline.
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

  // Step 2: delete finance entries linked by [REF:<saleId>]. These are
  // OMZET/HPP/PIUTANG rows that POS injected at sale-creation time.
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

  // Step 3: delete piutang + pelunasan rows linked to this sale.
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

  // Step 4: delete sale items.
  for (const item of items) {
    try {
      const del = await db.delete("item_penjualan", (item as any).id);
      if (del.error) throw del.error;
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`delete item_penjualan ${(item as any).id}: ${msg}`);
    }
  }

  // Step 5: delete the sale itself. This is the only step we treat as
  // hard-fatal — if the header survives, the sale is still visible to
  // the user and they can retry deletion.
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

  // If we made it here but there were partial failures, surface them so
  // the kasir knows manual cleanup may be needed for orphaned rows.
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
 * Get all receivables
 */
export async function getReceivables(): Promise<Receivable[]> {
  try {
    const piutangResult = await db.query<Receivable>("piutang_penjualan");
    const piutangList = piutangResult.data || [];

    // Filter only AKTIF and SEBAGIAN
    const activeReceivables = piutangList.filter(
      (p: any) => p.status === "AKTIF" || p.status === "SEBAGIAN"
    );

    // Get sales and customers for enrichment
    const salesResult = await db.query("penjualan");
    const customersResult = await db.query("pelanggan");

    const sales = salesResult.data || [];
    const customers = customersResult.data || [];

    // Enrich receivables
    const enrichedReceivables = activeReceivables.map((piutang: any) => {
      const sale = sales.find((s: any) => s.id === piutang.id_penjualan);
      const customer = customers.find((c: any) => c.id === sale?.pelanggan_id);

      return {
        ...piutang,
        nomor_invoice: sale?.nomor_invoice || undefined,
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
 * Pay receivable.
 *
 * Steps (each best-effort with detailed error logging):
 *   1. Validate piutang + payment amount.
 *   2. Insert pelunasan_piutang row.
 *   3. Update piutang_penjualan totals + status.
 *   4. Insert keuangan entry (LUNAS / PIUTANG).
 *
 * Steps 1 + 2 are hard-required (validation + base record); steps 3 + 4
 * are flagged but not fatal so the kasir can retry / fix manually if
 * needed. For full atomic safety, migrate to a Postgres RPC function.
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
  // Validation — must pass before any writes.
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

  // Resolve sale + customer for the keuangan keperluan string.
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

  // Step 1 (hard-required): create payment record. Without this row the
  // payment never happened — bail out instead of writing partial state.
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

  // Step 2 (best-effort): update piutang totals + status.
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

  // Step 3 (best-effort): create matching keuangan entry.
  try {
    const kategori = newStatus === "LUNAS" ? "LUNAS" : "PIUTANG";
    let keperluan = `Bayar Piutang ${sale?.nomor_invoice || ""}`;
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
    // Note: we intentionally do NOT throw here. The payment row is the
    // source of truth — losing it would be far worse than a slightly
    // out-of-sync piutang status. Surface a soft warning via console
    // and let the caller proceed with success.
  }

  return {
    id: paymentId,
    jumlah_bayar: data.jumlah_bayar,
    status_baru: newStatus,
    sisa_piutang: newSisaPiutang,
  };
}

/**
 * Revert payment (make piutang AKTIF again)
 */
export async function revertSalePayment(data: {
  sale_id: string;
  dibuat_oleh?: string;
}): Promise<number> {
  // Validation phase — must succeed before any deletes.
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

  // Best-effort cleanup. Each step is isolated so a single failure
  // doesn't abort the others.
  const failures: string[] = [];

  // Step 1: delete all payment records.
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

  // Step 2: delete linked keuangan entries (LUNAS / PIUTANG matching invoice).
  try {
    const financeResult = await db.query("keuangan");
    const financeEntries = financeResult.data || [];
    for (const entry of financeEntries as any[]) {
      if (
        (entry.kategori_transaksi === "LUNAS" ||
          entry.kategori_transaksi === "PIUTANG") &&
        entry.keperluan?.includes(sale.nomor_invoice)
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

  // Step 3: reset piutang to original state.
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

  // Step 4: bump penjualan diperbarui_pada timestamp.
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
// HELPER FUNCTIONS (PRIVATE)
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
  // Get max urutan_tampilan
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
      keperluan += " - Walk-in";
    }
  } else {
    keperluan += " - Walk-in";
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
      keperluan += " - Walk-in";
    }
  } else {
    keperluan += " - Walk-in";
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
