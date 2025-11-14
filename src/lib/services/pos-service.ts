/**
 * POS/Sales Service
 * Universal API untuk Point of Sale yang bekerja di Tauri dan Web
 *
 * Handles: Sales transactions, Receivables, Stock management, Finance entries
 */

import { db, generateId, getCurrentTimestamp, isTauriApp } from "../db-unified";
import { recalculateCashbook } from "../calculate-cashbook";

// ============================================================================
// TYPES
// ============================================================================

export interface Sale {
  id: string;
  nomor_invoice: string;
  pelanggan_id?: string | null;
  pelanggan_nama?: string;
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
}

export interface CreateSaleData {
  pelanggan_id?: string;
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
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTodayJakarta(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Jakarta",
  });
}

async function generateInvoiceNumber(tanggal: string): Promise<string> {
  const dateStr = tanggal.replace(/-/g, "");

  const lastInvoiceResult = await db.query("penjualan", {
    orderBy: { column: "nomor_invoice", ascending: false },
    limit: 1,
  });

  if (lastInvoiceResult.data && lastInvoiceResult.data.length > 0) {
    const lastInvoice = lastInvoiceResult.data[0] as any;
    if (lastInvoice.nomor_invoice?.startsWith(`INV-${dateStr}`)) {
      const lastNum = parseInt(lastInvoice.nomor_invoice.split("-")[2]);
      return `INV-${dateStr}-${String(lastNum + 1).padStart(3, "0")}`;
    }
  }

  return `INV-${dateStr}-001`;
}

async function generateSPKNumber(): Promise<string> {
  const lastOrderResult = await db.query("order_produksi", {
    orderBy: { column: "dibuat_pada", ascending: false },
    limit: 1,
  });

  if (lastOrderResult.data && lastOrderResult.data.length > 0) {
    const lastOrder = lastOrderResult.data[0] as any;
    if (lastOrder.nomor_spk) {
      const lastNum = parseInt(lastOrder.nomor_spk.split("-")[1]);
      return `SPK-${String(lastNum + 1).padStart(4, "0")}`;
    }
  }

  return "SPK-0001";
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

    return {
      customers: customersResult.data || [],
      materials: materialsWithPrices,
      sales,
    };
  } catch (error) {
    console.error("Error fetching POS init data:", error);
    throw error;
  }
}

/**
 * Get sales transactions
 */
export async function getSales(limit: number = 100): Promise<Sale[]> {
  try {
    const salesResult = await db.query<Sale>("penjualan", {
      orderBy: { column: "dibuat_pada", ascending: false },
      limit,
    });

    const sales = salesResult.data || [];

    // Get customers and users for enrichment
    const customersResult = await db.query("pelanggan");
    const usersResult = await db.query("profil");
    const piutangResult = await db.query("piutang_penjualan");

    const customers = customersResult.data || [];
    const users = usersResult.data || [];
    const piutangList = piutangResult.data || [];

    // Enrich sales with items and related data
    const salesWithItems = await Promise.all(
      sales.map(async (sale) => {
        // Get items
        const itemsResult = await db.query<SaleItem>("item_penjualan", {
          where: { penjualan_id: sale.id },
        });

        const items = itemsResult.data || [];

        // Enrich items with material names
        const itemsWithNames = await Promise.all(
          items.map(async (item) => {
            const materialResult = await db.queryOne("barang", {
              where: { id: item.barang_id },
            });

            return {
              ...item,
              barang_nama: materialResult.data?.nama || "",
            };
          })
        );

        // Find related data
        const customer = customers.find((c: any) => c.id === sale.pelanggan_id);
        const kasir = users.find((u: any) => u.id === sale.kasir_id);
        const piutang = piutangList.find(
          (p: any) => p.id_penjualan === sale.id
        );

        // Check if has pelunasan
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

    // Execute in transaction
    return await db.transaction(async () => {
      // Create sale record
      const sale = {
        id: saleId,
        nomor_invoice: invoiceNumber,
        pelanggan_id: data.pelanggan_id || null,
        total_jumlah: data.total_jumlah,
        jumlah_dibayar: actualPaid,
        jumlah_kembalian: data.jumlah_kembalian || 0,
        metode_pembayaran: data.metode_pembayaran,
        kasir_id: data.kasir_id || null,
        catatan: data.catatan?.trim() || null,
      };

      const saleResult = await db.insert("penjualan", sale);
      if (saleResult.error) throw saleResult.error;

      // Insert sale items and update stock
      for (const item of data.items) {
        const itemId = generateId();

        const saleItem = {
          id: itemId,
          penjualan_id: saleId,
          barang_id: item.barang_id,
          harga_satuan_id: item.harga_satuan_id || null,
          jumlah: item.jumlah,
          nama_satuan: item.nama_satuan,
          faktor_konversi: item.faktor_konversi,
          harga_satuan: item.harga_satuan,
          subtotal: item.subtotal,
        };

        const itemResult = await db.insert("item_penjualan", saleItem);
        if (itemResult.error) throw itemResult.error;

        // Update stock if material tracks inventory
        const materialResult = await db.queryOne("barang", {
          where: { id: item.barang_id },
        });

        const material = materialResult.data;
        if (material && material.lacak_inventori_status) {
          const stockReduction = item.jumlah * item.faktor_konversi;
          const newStock = (material.jumlah_stok || 0) - stockReduction;

          await db.update("barang", item.barang_id, {
            jumlah_stok: newStock,
            frekuensi_terjual: (material.frekuensi_terjual || 0) + 1,
          });
        } else {
          // Just increment frequency
          await db.update("barang", item.barang_id, {
            frekuensi_terjual: (material?.frekuensi_terjual || 0) + 1,
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
          });
        }
      }

      // Recalculate cashbook (Tauri only)
      if (isTauriApp()) {
        const Database = (await import("better-sqlite3")).default;
        const dbPath = require("path").join(
          process.cwd(),
          "database",
          "gemiprint.db"
        );
        const dbInstance = new Database(dbPath);
        await recalculateCashbook(dbInstance);
        dbInstance.close();
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

          const materialResult = await db.queryOne("barang", {
            where: { id: item.barang_id },
          });

          const productionItem = {
            id: itemProdId,
            order_produksi_id: orderId,
            item_penjualan_id: itemPenjualan.id,
            barang_nama: materialResult.data?.nama || "Unknown",
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
  } catch (error: any) {
    console.error("Error creating sale:", error);
    throw error;
  }
}

/**
 * Delete sale (revert stock and finance)
 */
export async function deleteSale(id: string): Promise<boolean> {
  try {
    return await db.transaction(async () => {
      // Get sale
      const saleResult = await db.queryOne("penjualan", { where: { id } });
      if (!saleResult.data) {
        throw new Error("Transaksi tidak ditemukan");
      }

      // Get items for stock reversal
      const itemsResult = await db.query("item_penjualan", {
        where: { penjualan_id: id },
      });

      const items = itemsResult.data || [];

      // Reverse stock changes
      for (const item of items as any[]) {
        const materialResult = await db.queryOne("barang", {
          where: { id: item.barang_id },
        });

        const material = materialResult.data;
        if (material && material.lacak_inventori_status) {
          const stockAddition = item.jumlah * (item.faktor_konversi || 1);
          const newStock = (material.jumlah_stok || 0) + stockAddition;

          await db.update("barang", item.barang_id, {
            jumlah_stok: newStock,
          });
        }
      }

      // Delete finance entries
      const financeResult = await db.query("keuangan");
      const financeEntries = financeResult.data || [];

      for (const entry of financeEntries as any[]) {
        if (entry.keperluan?.includes(`[REF:${id}]`)) {
          await db.delete("keuangan", entry.id);
        }
      }

      // Delete piutang and pelunasan
      const piutangResult = await db.query("piutang_penjualan", {
        where: { id_penjualan: id },
      });

      if (piutangResult.data && piutangResult.data.length > 0) {
        const piutang = piutangResult.data[0];

        // Delete pelunasan first
        const pelunasanResult = await db.query("pelunasan_piutang", {
          where: { id_piutang: piutang.id },
        });

        for (const pelunasan of pelunasanResult.data || []) {
          await db.delete("pelunasan_piutang", pelunasan.id);
        }

        // Delete piutang
        await db.delete("piutang_penjualan", piutang.id);
      }

      // Delete items
      for (const item of items) {
        await db.delete("item_penjualan", item.id);
      }

      // Delete sale
      const deleteResult = await db.delete("penjualan", id);
      if (deleteResult.error) throw deleteResult.error;

      // Recalculate cashbook (Tauri only)
      if (isTauriApp()) {
        const Database = (await import("better-sqlite3")).default;
        const dbPath = require("path").join(
          process.cwd(),
          "database",
          "gemiprint.db"
        );
        const dbInstance = new Database(dbPath);
        await recalculateCashbook(dbInstance);
        dbInstance.close();
      }

      return true;
    });
  } catch (error) {
    console.error("Error deleting sale:", error);
    throw error;
  }
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
 * Pay receivable
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
  try {
    // Validation
    if (!data.jumlah_bayar || data.jumlah_bayar <= 0) {
      throw new Error("Jumlah pembayaran harus lebih dari 0");
    }

    return await db.transaction(async () => {
      // Get piutang info
      const piutangResult = await db.queryOne("piutang_penjualan", {
        where: { id: data.piutang_id },
      });

      if (!piutangResult.data) {
        throw new Error("Piutang tidak ditemukan");
      }

      const piutang = piutangResult.data as any;

      // Validate payment amount
      if (data.jumlah_bayar > piutang.sisa_piutang) {
        throw new Error("Jumlah pembayaran tidak boleh melebihi sisa piutang");
      }

      // Get sale info
      const saleResult = await db.queryOne("penjualan", {
        where: { id: piutang.id_penjualan },
      });

      const sale = saleResult.data;

      // Get customer info if exists
      let customer = null;
      if (sale?.pelanggan_id) {
        const customerResult = await db.queryOne("pelanggan", {
          where: { id: sale.pelanggan_id },
        });
        customer = customerResult.data;
      }

      // Create payment record
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
      if (paymentResult.error) throw paymentResult.error;

      // Update piutang
      const newJumlahTerbayar = piutang.jumlah_terbayar + data.jumlah_bayar;
      const newSisaPiutang = piutang.sisa_piutang - data.jumlah_bayar;
      const newStatus =
        newSisaPiutang <= 0
          ? "LUNAS"
          : newJumlahTerbayar > 0
          ? "SEBAGIAN"
          : "AKTIF";

      await db.update("piutang_penjualan", data.piutang_id, {
        jumlah_terbayar: newJumlahTerbayar,
        sisa_piutang: newSisaPiutang,
        status: newStatus,
      });

      // Create finance entry
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
      });

      // Recalculate cashbook (Tauri only)
      if (isTauriApp()) {
        const Database = (await import("better-sqlite3")).default;
        const dbPath = require("path").join(
          process.cwd(),
          "database",
          "gemiprint.db"
        );
        const dbInstance = new Database(dbPath);
        await recalculateCashbook(dbInstance);
        dbInstance.close();
      }

      return {
        id: paymentId,
        jumlah_bayar: data.jumlah_bayar,
        status_baru: newStatus,
        sisa_piutang: newSisaPiutang,
      };
    });
  } catch (error) {
    console.error("Error paying receivable:", error);
    throw error;
  }
}

/**
 * Revert payment (make piutang AKTIF again)
 */
export async function revertSalePayment(data: {
  sale_id: string;
  dibuat_oleh?: string;
}): Promise<number> {
  try {
    return await db.transaction(async () => {
      // Get sale
      const saleResult = await db.queryOne("penjualan", {
        where: { id: data.sale_id },
      });

      if (!saleResult.data) {
        throw new Error("Penjualan tidak ditemukan");
      }

      const sale = saleResult.data;

      // Get piutang
      const piutangResult = await db.query("piutang_penjualan", {
        where: { id_penjualan: data.sale_id },
      });

      if (!piutangResult.data || piutangResult.data.length === 0) {
        throw new Error("Transaksi ini tidak memiliki piutang");
      }

      const piutang = piutangResult.data[0] as any;

      // Get payment records
      const paymentsResult = await db.query("pelunasan_piutang", {
        where: { id_piutang: piutang.id },
      });

      const payments = paymentsResult.data || [];

      if (payments.length === 0) {
        throw new Error(
          "Tidak ada catatan pembayaran piutang untuk transaksi ini"
        );
      }

      // Delete all payment records
      for (const payment of payments) {
        await db.delete("pelunasan_piutang", payment.id);
      }

      // Delete related finance entries
      const financeResult = await db.query("keuangan");
      const financeEntries = financeResult.data || [];

      for (const entry of financeEntries as any[]) {
        if (
          (entry.kategori_transaksi === "LUNAS" ||
            entry.kategori_transaksi === "PIUTANG") &&
          entry.keperluan?.includes(sale.nomor_invoice)
        ) {
          await db.delete("keuangan", entry.id);
        }
      }

      // Reset piutang to original state
      await db.update("piutang_penjualan", piutang.id, {
        jumlah_terbayar: 0,
        sisa_piutang: piutang.jumlah_piutang,
        status: "AKTIF",
      });

      // Update penjualan timestamp
      await db.update("penjualan", data.sale_id, {
        diperbarui_pada: getCurrentTimestamp(),
      });

      // Recalculate cashbook (Tauri only)
      if (isTauriApp()) {
        const Database = (await import("better-sqlite3")).default;
        const dbPath = require("path").join(
          process.cwd(),
          "database",
          "gemiprint.db"
        );
        const dbInstance = new Database(dbPath);
        await recalculateCashbook(dbInstance);
        dbInstance.close();
      }

      return payments.length;
    });
  } catch (error) {
    console.error("Error reverting sale payment:", error);
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS (PRIVATE)
// ============================================================================

async function createFinanceEntry(data: {
  tanggal: string;
  kategori_transaksi: string;
  debit: number;
  keperluan: string;
  omzet: number;
  catatan?: string | null;
  dibuat_oleh?: string | null;
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
  const finance = {
    id: keuanganId,
    tanggal: data.tanggal,
    kategori_transaksi: data.kategori_transaksi,
    debit: data.debit,
    kredit: 0,
    keperluan: data.keperluan,
    omzet: data.omzet,
    catatan: data.catatan || null,
    dibuat_oleh: data.dibuat_oleh || null,
    urutan_tampilan: nextDisplayOrder,
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
