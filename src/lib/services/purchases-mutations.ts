/**
 * Purchases Service
 * Universal API for Purchases on Tauri and Web
 */

import "server-only";

import { db, getServerSupabaseClient, isCompositeTransactionAtomic } from "../db-unified";
import { fetchLastNomorPembelian } from "../server-data-supabase";
import { recalculateCashbookIfAvailable, resolveOpenPeriodeIdForKeuangan } from "./finance-service";
import {
  ID_BARANG_PLACEHOLDER_MAKLON,
  ID_HARGA_PLACEHOLDER_MAKLON,
} from "../barang-placeholder";
import {
  convertRollVariant,
  findOrCreateRollVariant,
  getInventoryMovements,
  postInventoryMovement,
  rebuildInventoryBalance,
} from "./inventory-service";
import { hitungPpn } from "../ppn-helpers";
import { usePgCompositeRpc } from "../feature-flags";
import { friendlyPgError } from "../pg-error";
import { withDuplicateNumberRetry } from "../retry-utils";

/**
 * Bangun DTO pembelian dari baris pembelian via db-unified (Supabase / SQLite).
 */
import type { Purchase, PurchaseItem, InitData } from "./purchases-queries";
import { enrichPurchaseRows, normalizePaymentMethod, isCashPayment, generateId, positiveNumber, fallbackAverageCostPerBaseUnit, syncUnitPurchasePricesFromAverage, applyPurchaseCostToMaterial, reversePurchaseCostFromMaterial, nextNomorPembelian, nextNomorPembelianMaklon, normalizePurchaseItemsForUI, getPurchaseById } from "./purchases-queries";

// ── Mutations ─────────────────────────────────────────

/**
 * Buat pembelian dengan retry pada tabrakan nomor (PO `nomor_pembelian` /
 * `nomor_faktur` UNIQUE) — D-I5. Aman karena createPurchaseAttempt sudah punya
 * compensating cleanup (non-atomik) / rollback (atomik).
 */
export function createPurchase(
  data: Parameters<typeof createPurchaseAttempt>[0]
): Promise<{ id: string }> {
  return withDuplicateNumberRetry(() => createPurchaseAttempt(data), {
    label: "createPurchase",
  });
}

/**
 * Compensating cleanup untuk createPurchase di jalur NON-ATOMIK (Supabase-only).
 * Lihat penjelasan di pos-mutations.compensateFailedSale — pola sama:
 *   1. Hapus inventory_movements milik pembelian ini + rebuild saldo barang.
 *   2. Hapus entri keuangan ber-reference pembelian ini.
 *   3. Hapus header pembelian; FK CASCADE membersihkan item_pembelian dan
 *      hutang_pembelian.
 * Best-effort; semua error dicatat tanpa menghentikan langkah lain.
 */
async function compensateFailedPurchase(params: {
  purchaseId: string;
  affectedBarangIds: Set<string>;
}): Promise<void> {
  const { purchaseId, affectedBarangIds } = params;

  try {
    const movements = await getInventoryMovements({
      source_type: "PURCHASE",
      source_id: purchaseId,
    });
    for (const mov of movements) {
      try {
        await db.delete("inventory_movements", mov.id);
      } catch (e) {
        console.error("[compensateFailedPurchase] gagal hapus movement", mov.id, e);
      }
    }
    for (const barangId of affectedBarangIds) {
      try {
        await rebuildInventoryBalance(barangId);
      } catch (e) {
        console.error("[compensateFailedPurchase] gagal rebuild saldo", barangId, e);
      }
    }
  } catch (e) {
    console.error("[compensateFailedPurchase] gagal proses inventori:", e);
  }

  try {
    const financeRes = await db.query<any>("keuangan", {
      where: { reference_id: purchaseId },
    });
    for (const row of financeRes.data || []) {
      try {
        await db.delete("keuangan", row.id);
      } catch (e) {
        console.error("[compensateFailedPurchase] gagal hapus keuangan", row.id, e);
      }
    }
  } catch (e) {
    console.error("[compensateFailedPurchase] gagal proses keuangan:", e);
  }

  try {
    await db.delete("pembelian", purchaseId);
  } catch (e) {
    console.error("[compensateFailedPurchase] gagal hapus header pembelian:", e);
  }
}

async function createPurchaseAttempt(data: {
  nomor_pembelian?: string;
  nomor_faktur: string;
  vendor_id: string | null;
  tanggal: string;
  metode_pembayaran: string;
  catatan?: string;
  dibuat_oleh?: string;
  diterima_oleh?: string;
  // PPN masukan (opsional — kalau tidak ada, kena_ppn=0)
  kena_ppn?: boolean;
  ppn_persen?: number;
  ppn_metode?: "EKSKLUSIF" | "INKLUSIF";
  dapat_dikreditkan?: boolean;
  nomor_faktur_pajak_vendor?: string | null;
  tanggal_faktur_pajak?: string | null;
  vendor_npwp_snapshot?: string | null;
  items: Array<{
    barang_id: string;
    harga_satuan_id?: string | null;
    nama_satuan: string;
    faktor_konversi: number;
    jumlah: number;
    harga_satuan: number;
    panjang?: number | null;
    lebar?: number | null;
    /** Jumlah roll fisik dengan dimensi yang sama (default 1). */
    jumlah_roll?: number | null;
    /**
     * Opsional: pecah roll yang baru diterima jadi beberapa lebar.
     * Setiap batch = N roll dengan pola potongan yang sama. Total
     * lebar di tiap pola harus sama dengan lebar roll. Total roll_count
     * dari semua batch tidak boleh melebihi `jumlah_roll`. Roll yang
     * tidak masuk batch akan dibiarkan utuh.
     */
    split_batches?: Array<{
      roll_count: number;
      targets: number[];
    }> | null;
  }>;
}): Promise<{ id: string }> {
  // Hoisted untuk compensating cleanup di jalur non-atomik (Supabase-only).
  let purchaseIdForCleanup: string | null = null;
  const affectedBarangIds = new Set<string>();
  try {
    // Validate
    if (!data.nomor_faktur?.trim()) {
      throw new Error("Nomor faktur harus diisi");
    }

    if (!data.items || data.items.length === 0) {
      throw new Error("Minimal harus ada 1 item pembelian");
    }

    const nomorFakturNorm = data.nomor_faktur.trim();
    const dup = await db.queryOne("pembelian", {
      where: { nomor_faktur: nomorFakturNorm },
    });
    if (dup.data) {
      throw new Error("Nomor faktur sudah digunakan");
    }

    const nomorPembelian =
      data.nomor_pembelian?.trim() || (await nextNomorPembelian());

    // Generate ID
    const purchaseId = generateId("purchase");
    purchaseIdForCleanup = purchaseId;

    // Hitung total (jumlah subtotal). Kalau metode INKLUSIF, total ini
    // sudah termasuk PPN. Jalur RPC/TS yang akan ekstrak DPP dari total ini.
    const total_harga = data.items.reduce(
      (sum, item) => sum + item.jumlah * item.harga_satuan,
      0
    );

    const kenaPpn = data.kena_ppn ? 1 : 0;
    const ppnPersen = kenaPpn === 1 ? Number(data.ppn_persen || 0) : 0;
    const ppnMetode: "EKSKLUSIF" | "INKLUSIF" =
      data.ppn_metode === "INKLUSIF" ? "INKLUSIF" : "EKSKLUSIF";
    const dapatDikreditkan = data.dapat_dikreditkan === false ? 0 : 1;
    const ppnBreakdown =
      kenaPpn === 1 && ppnPersen > 0
        ? hitungPpn(total_harga, ppnPersen, ppnMetode)
        : { dpp: total_harga, ppn: 0, total: total_harga };

    const metodePembayaran = normalizePaymentMethod(data.metode_pembayaran);
    const jumlahDibayar = isCashPayment(metodePembayaran) ? total_harga : 0;
    const statusPembayaran = isCashPayment(metodePembayaran) ? "LUNAS" : "HUTANG";

    const sb: any =
      process.env.TAURI === "true" || process.env.TAURI === "1"
        ? null
        : getServerSupabaseClient();
    if (usePgCompositeRpc() && sb) {
      const preparedItems = data.items.map((item) => {
        const itemId = generateId("pi");
        const subtotal = item.jumlah * item.harga_satuan;
        return {
          id: itemId,
          barang_id: item.barang_id,
          harga_satuan_id: item.harga_satuan_id || null,
          nama_satuan: item.nama_satuan || "",
          faktor_konversi: item.faktor_konversi || 1,
          jumlah: item.jumlah,
          harga_satuan: item.harga_satuan,
          subtotal,
          panjang: item.panjang ?? null,
          lebar: item.lebar ?? null,
          jumlah_roll: Math.max(1, Math.round(Number(item.jumlah_roll) || 1)),
          movement_id: `mov-${itemId}`,
        };
      });

      let finance: any = null;
      let debt: any = null;
      if (isCashPayment(metodePembayaran)) {
        const maxOrderResult = await db.query<any>("keuangan", {
          orderBy: { column: "urutan_tampilan", ascending: false },
          limit: 1,
        });
        const nextOrder =
          (maxOrderResult.data?.[0]?.urutan_tampilan || 0) + 1;
        const vendorName = data.vendor_id
          ? (await db.queryOne("vendor", { where: { id: data.vendor_id } })).data
              ?.nama_perusahaan
          : null;
        const catatanTrim = data.catatan?.trim() || "";
        const catatanExcerpt =
          catatanTrim && catatanTrim.length > 0
            ? catatanTrim.substring(0, 25) +
              (catatanTrim.length > 25 ? "..." : "")
            : null;
        const poLabel =
          nomorPembelian && nomorPembelian !== nomorFakturNorm
            ? `${nomorPembelian} / Faktur ${nomorFakturNorm}`
            : `Faktur ${nomorFakturNorm}`;
        let keperluan = `Pembelian ${poLabel}`;
        if (vendorName) {
          keperluan += ` - ${vendorName}`;
        } else if (catatanExcerpt) {
          keperluan += ` (${catatanExcerpt})`;
        }
        keperluan += ` [REF:${purchaseId}]`;
        finance = {
          id: generateId("keu"),
          tanggal: data.tanggal,
          kategori_transaksi: "SUPPLY",
          debit: 0,
          kredit: total_harga,
          keperluan,
          omzet: 0,
          biaya_bahan: 0,
          catatan: data.catatan?.trim() || null,
          dibuat_oleh: data.dibuat_oleh || null,
          urutan_tampilan: nextOrder,
          reference_type: "PURCHASE",
          reference_id: purchaseId,
        };
      } else {
        const jatuhTempo =
          metodePembayaran === "NET30"
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0]
            : null;
        debt = {
          id: generateId("hutang"),
          jumlah_hutang: total_harga,
          jumlah_terbayar: 0,
          sisa_hutang: total_harga,
          jatuh_tempo: jatuhTempo,
          status: "AKTIF",
          catatan:
            metodePembayaran === "NET30"
              ? "Tagihan dengan jatuh tempo 30 hari"
              : "Tagihan COD - bayar saat terima barang",
        };
      }

      const { error } = await sb.rpc("create_purchase_with_inventory", {
        payload: {
          purchase: {
            id: purchaseId,
            nomor_pembelian: nomorPembelian,
            nomor_faktur: nomorFakturNorm,
            vendor_id: data.vendor_id,
            tanggal: data.tanggal,
            metode_pembayaran: metodePembayaran,
            total_jumlah: total_harga,
            jumlah_dibayar: jumlahDibayar,
            status_pembayaran: statusPembayaran,
            catatan: data.catatan?.trim() || null,
            dibuat_oleh: data.dibuat_oleh || null,
            diterima_oleh: data.diterima_oleh?.trim() || null,
            tipe_pembelian: "BARANG",
            kena_ppn: kenaPpn,
            ppn_persen: ppnPersen,
            ppn_metode: ppnMetode,
            dapat_dikreditkan: dapatDikreditkan,
            nomor_faktur_pajak_vendor: data.nomor_faktur_pajak_vendor || null,
            tanggal_faktur_pajak: data.tanggal_faktur_pajak || null,
            vendor_npwp_snapshot: data.vendor_npwp_snapshot || null,
          },
          items: preparedItems,
          finance,
          debt,
        },
      });
      if (error) {
        throw new Error(friendlyPgError(error, "pembelian"));
      }
      if (isCashPayment(metodePembayaran)) {
        await recalculateCashbookIfAvailable();
      }
      return { id: purchaseId };
    }

    await db.transaction(async () => {
      // Buat header pembelian
      const purchase = {
        id: purchaseId,
        nomor_pembelian: nomorPembelian,
        nomor_faktur: nomorFakturNorm,
        vendor_id: data.vendor_id,
        tanggal: data.tanggal,
        metode_pembayaran: metodePembayaran,
        total_jumlah: total_harga,
        jumlah_dibayar: jumlahDibayar,
        status_pembayaran: statusPembayaran,
        catatan: data.catatan?.trim() || null,
        dibuat_oleh: data.dibuat_oleh || null,
        diterima_oleh: data.diterima_oleh?.trim() || null,
        kena_ppn: kenaPpn,
        ppn_persen: ppnPersen,
        ppn_metode: ppnMetode,
        dpp_total: ppnBreakdown.dpp,
        ppn_total: ppnBreakdown.ppn,
        dapat_dikreditkan: dapatDikreditkan,
        nomor_faktur_pajak_vendor: data.nomor_faktur_pajak_vendor || null,
        tanggal_faktur_pajak: data.tanggal_faktur_pajak || null,
        vendor_npwp_snapshot: data.vendor_npwp_snapshot || null,
      };

      const purchaseResult = await db.insert("pembelian", purchase);
      if (purchaseResult.error) {
        throw purchaseResult.error;
      }

      // Buat item + sesuaikan stok
      for (const item of data.items) {
        const itemId = generateId("pi");
        const subtotal = item.jumlah * item.harga_satuan;

        // Per-line PPN breakdown — pakai subtotal line, tarif sama dengan
        // header. Kalau kena_ppn=0 maka semua kolom PPN line = 0.
        const lineBreakdown =
          kenaPpn === 1 && ppnPersen > 0
            ? hitungPpn(subtotal, ppnPersen, ppnMetode)
            : { dpp: subtotal, ppn: 0, total: subtotal };
        const lineDppSatuan =
          item.jumlah !== 0 ? lineBreakdown.dpp / item.jumlah : 0;
        const linePpnSatuan =
          item.jumlah !== 0 ? lineBreakdown.ppn / item.jumlah : 0;

        const purchaseItem = {
          id: itemId,
          pembelian_id: purchaseId,
          barang_id: item.barang_id,
          harga_satuan_id: item.harga_satuan_id || null,
          nama_satuan: item.nama_satuan || "",
          faktor_konversi: item.faktor_konversi || 1,
          jumlah: item.jumlah,
          harga_satuan: item.harga_satuan,
          subtotal,
          panjang: item.panjang ?? null,
          lebar: item.lebar ?? null,
          jumlah_roll: Math.max(1, Math.round(Number(item.jumlah_roll) || 1)),
          dpp_satuan: lineDppSatuan,
          ppn_satuan: linePpnSatuan,
          dpp_total: lineBreakdown.dpp,
          ppn_total: lineBreakdown.ppn,
        };

        const itemResult = await db.insert("item_pembelian", purchaseItem);
        if (itemResult.error) {
          throw itemResult.error;
        }

        // Biaya unit inventori pakai DPP per unit dasar, supaya HPP bersih
        // dari PPN. PPN masukan akan dikreditkan terpisah saat lapor pajak.
        const faktorKonversi = positiveNumber(item.faktor_konversi) || 1;
        const qtyBase = item.jumlah * faktorKonversi;
        const unitCostDpp =
          qtyBase !== 0 ? lineBreakdown.dpp / qtyBase : 0;
        const rollWidth = positiveNumber(item.lebar);
        const rollLengthSingle = positiveNumber(item.panjang);
        const rollCount = Math.max(
          1,
          Math.round(positiveNumber(item.jumlah_roll) || 1)
        );
        const rollLengthTotal = rollLengthSingle * rollCount;
        const rollVariant =
          rollWidth > 0 && rollLengthTotal > 0
            ? await findOrCreateRollVariant({
                barang_id: item.barang_id,
                lebar_m: rollWidth,
                average_cost_per_m2: unitCostDpp,
                catatan: `Penerimaan pembelian ${nomorFakturNorm}`,
              })
            : null;
        await postInventoryMovement({
          id: `mov-${itemId}`,
          barang_id: item.barang_id,
          tanggal: data.tanggal,
          movement_type: "PURCHASE_RECEIPT",
          qty_delta: qtyBase,
          unit_cost: unitCostDpp,
          source_type: "PURCHASE",
          source_id: purchaseId,
          source_line_id: itemId,
          roll_variant_id: rollVariant?.id || null,
          roll_width_m: rollVariant ? rollWidth : null,
          linear_delta_m: rollVariant ? rollLengthTotal : null,
          catatan: `Penerimaan pembelian ${nomorFakturNorm}`,
          dibuat_oleh: data.dibuat_oleh || null,
        });
        affectedBarangIds.add(item.barang_id);

        // Optional: pecah roll yang baru diterima sesuai instruksi vendor /
        // potongan fisik yang dilakukan di lapangan. Setiap batch
        // merepresentasikan N roll dengan pola potongan yang sama (lebar
        // tujuan dipisah koma). Roll yang tidak ikut di batch manapun
        // dibiarkan utuh.
        if (
          rollVariant &&
          Array.isArray(item.split_batches) &&
          item.split_batches.length > 0
        ) {
          let totalUsedRolls = 0;
          for (const batch of item.split_batches) {
            const batchCount = Math.max(
              0,
              Math.round(Number(batch?.roll_count) || 0)
            );
            const cleanTargets = (batch?.targets || [])
              .map(Number)
              .filter((n) => Number.isFinite(n) && n > 0);
            if (batchCount === 0 || cleanTargets.length === 0) continue;
            totalUsedRolls += batchCount;
            if (totalUsedRolls > rollCount) {
              throw new Error(
                `Item ${item.barang_id}: total roll yang dipotong (${totalUsedRolls}) melebihi jumlah roll yang dibeli (${rollCount}).`
              );
            }
            await convertRollVariant({
              source_roll_variant_id: rollVariant.id,
              target_widths_m: cleanTargets,
              length_m: rollLengthSingle * batchCount,
              reason: `Potong ${batchCount} roll dari pembelian ${nomorFakturNorm}`,
              tanggal: data.tanggal,
              dibuat_oleh: data.dibuat_oleh || null,
            });
          }
        }
      }

      if (isCashPayment(metodePembayaran)) {
        const maxOrderResult = await db.query<any>("keuangan", {
          orderBy: { column: "urutan_tampilan", ascending: false },
          limit: 1,
        });
        const nextOrder =
          (maxOrderResult.data?.[0]?.urutan_tampilan || 0) + 1;

        const vendorName = data.vendor_id
          ? (await db.queryOne("vendor", { where: { id: data.vendor_id } })).data
              ?.nama_perusahaan
          : null;

        const catatanTrim = data.catatan?.trim();
        const catatanExcerpt =
          catatanTrim && catatanTrim.length > 0
            ? catatanTrim.substring(0, 25) +
              (catatanTrim.length > 25 ? "..." : "")
            : null;

        // Bangun keperluan: tampilkan nomor PO hanya kalau berbeda dengan
        // nomor faktur vendor untuk hindari duplikasi seperti "inv-002 (inv-002)".
        const poLabel =
          nomorPembelian && nomorPembelian !== nomorFakturNorm
            ? `${nomorPembelian} / Faktur ${nomorFakturNorm}`
            : `Faktur ${nomorFakturNorm}`;
        let keperluan = `Pembelian ${poLabel}`;
        if (vendorName) {
          keperluan += ` - ${vendorName}`;
        } else if (catatanExcerpt) {
          keperluan += ` (${catatanExcerpt})`;
        }
        keperluan += ` [REF:${purchaseId}]`;

        const periodeId = await resolveOpenPeriodeIdForKeuangan();
        const financeResult = await db.insert("keuangan", {
          id: generateId("keu"),
          tanggal: data.tanggal,
          kategori_transaksi: "SUPPLY",
          debit: 0,
          kredit: total_harga,
          keperluan,
          biaya_bahan: 0,
          catatan: data.catatan?.trim() || null,
          dibuat_oleh: data.dibuat_oleh || null,
          urutan_tampilan: nextOrder,
          reference_type: "PURCHASE",
          reference_id: purchaseId,
          periode_id: periodeId,
        });
        if (financeResult.error) {
          throw financeResult.error;
        }
      } else {
        const jatuhTempo =
          metodePembayaran === "NET30"
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0]
            : null;

        const debtResult = await db.insert("hutang_pembelian", {
          id: generateId("hutang"),
          id_pembelian: purchaseId,
          jumlah_hutang: total_harga,
          jumlah_terbayar: 0,
          sisa_hutang: total_harga,
          jatuh_tempo: jatuhTempo,
          status: "AKTIF",
          catatan:
            metodePembayaran === "NET30"
              ? "Tagihan dengan jatuh tempo 30 hari"
              : "Tagihan COD - bayar saat terima barang",
        });
        if (debtResult.error) {
          throw debtResult.error;
        }
      }
    });

    if (isCashPayment(metodePembayaran)) {
      await recalculateCashbookIfAvailable();
    }

    return { id: purchaseId };
  } catch (error: any) {
    console.error("Error creating purchase:", error);
    // Compensating cleanup di jalur non-atomik (Supabase-only). Di jalur atomik
    // (Tauri/SQLite) transaksi sudah rollback otomatis.
    if (purchaseIdForCleanup) {
      try {
        const atomic = await isCompositeTransactionAtomic();
        if (!atomic) {
          await compensateFailedPurchase({
            purchaseId: purchaseIdForCleanup,
            affectedBarangIds,
          });
        }
      } catch (cleanupErr) {
        console.error(
          "[createPurchase] compensating cleanup gagal (data mungkin perlu diperiksa manual):",
          cleanupErr
        );
      }
    }
    throw error;
  }
}

/**
 * Buat order pembelian maklon (subkontrak) yang ditautkan ke penjualan.
 *
 * Satu panggilan per grup (vendor, metode bayar) di sebuah penjualan — jadi
 * satu penjualan bisa membuat beberapa PO maklon kalau menyangkut banyak
 * vendor atau mencampur CASH+NET30 ke vendor yang sama.
 *
 * Sisipkan:
 *   - 1 baris pembelian dengan `tipe_pembelian='MAKLON'` dan `penjualan_id_sumber`
 *   - 1 baris item_pembelian per baris maklon (barang placeholder `barang-jasa-maklon`,
 *     melewati moving-average karena maklon bukan inventori bersaldo)
 *   - CASH: 1 baris keuangan (kategori `MAKLON`, kredit) dengan `[REF:<purchaseId>]`
 *   - NET30: 1 baris hutang_pembelian (jatuh_tempo +30 hari)
 *
 * Mengembalikan pembelian.id baru supaya pemanggil bisa menautkan
 * `item_penjualan.pembelian_id_terkait` untuk tiap baris maklon di grup.
 */
export async function createMaklonPurchase(input: {
  saleId: string;
  saleInvoiceNumber: string;
  vendorId: string;
  metodeBayar: "CASH" | "NET30";
  tanggal: string;
  catatan?: string;
  dibuatOleh?: string | null;
  /** Satu entri per baris maklon di grup vendor+metode bayar ini. */
  items: Array<{
    deskripsi_pekerjaan: string;
    jumlah: number;
    biaya_subkontrak: number;
  }>;
}): Promise<{ id: string }> {
  if (!input.vendorId) {
    throw new Error("Vendor subkontraktor wajib dipilih untuk maklon");
  }
  if (!input.items || input.items.length === 0) {
    throw new Error("Item maklon kosong");
  }
  if (input.items.some((it) => !(it.biaya_subkontrak > 0))) {
    throw new Error("Biaya subkontrak harus lebih dari 0");
  }
  if (input.metodeBayar !== "CASH" && input.metodeBayar !== "NET30") {
    throw new Error(`Metode bayar vendor tidak valid: ${input.metodeBayar}`);
  }

  const purchaseId = generateId("maklon");
  const nomorPembelian = await nextNomorPembelianMaklon();
  // Nomor faktur otomatis; pengguna bisa edit nanti saat vendor mengirim
  // faktur sesungguhnya. Selalu unik karena saleInvoiceNumber + groupSeq
  // tidak akan bertabrakan per (vendor, metode bayar).
  const groupSeq = `${input.vendorId.slice(0, 6)}-${input.metodeBayar}`;
  const nomorFaktur = `MAKLON-${input.saleInvoiceNumber}-${groupSeq}`;

  const totalHarga = input.items.reduce(
    (sum, it) => sum + it.biaya_subkontrak,
    0
  );
  const jumlahDibayar = input.metodeBayar === "CASH" ? totalHarga : 0;
  const statusPembayaran = input.metodeBayar === "CASH" ? "LUNAS" : "HUTANG";

  await db.transaction(async () => {
    const purchase = {
      id: purchaseId,
      nomor_pembelian: nomorPembelian,
      nomor_faktur: nomorFaktur,
      vendor_id: input.vendorId,
      tanggal: input.tanggal,
      metode_pembayaran: input.metodeBayar,
      total_jumlah: totalHarga,
      jumlah_dibayar: jumlahDibayar,
      status_pembayaran: statusPembayaran,
      catatan:
        input.catatan?.trim() ||
        `Maklon untuk ${input.saleInvoiceNumber}`,
      dibuat_oleh: input.dibuatOleh || null,
      diterima_oleh: null,
      tipe_pembelian: "MAKLON",
      penjualan_id_sumber: input.saleId,
    };

    const purchaseResult = await db.insert("pembelian", purchase);
    if (purchaseResult.error) throw purchaseResult.error;

    // Sisipkan baris item yang menunjuk ke barang placeholder. Kita TIDAK memanggil
    // applyPurchaseCostToMaterial — maklon bukan inventori bersaldo.
    for (const item of input.items) {
      const itemId = generateId("pi");
      const subtotal =
        item.jumlah > 0 ? item.biaya_subkontrak : item.biaya_subkontrak;
      const hargaSatuan =
        item.jumlah > 0 ? item.biaya_subkontrak / item.jumlah : item.biaya_subkontrak;

      const purchaseItem = {
        id: itemId,
        pembelian_id: purchaseId,
        barang_id: ID_BARANG_PLACEHOLDER_MAKLON,
        harga_satuan_id: ID_HARGA_PLACEHOLDER_MAKLON,
        nama_satuan: "pcs",
        faktor_konversi: 1,
        jumlah: item.jumlah > 0 ? item.jumlah : 1,
        harga_satuan: hargaSatuan,
        subtotal,
        panjang: null,
        lebar: null,
      };

      const itemResult = await db.insert("item_pembelian", purchaseItem);
      if (itemResult.error) throw itemResult.error;
    }

    if (input.metodeBayar === "CASH") {
      const maxOrderResult = await db.query<any>("keuangan", {
        orderBy: { column: "urutan_tampilan", ascending: false },
        limit: 1,
      });
      const nextOrder =
        (maxOrderResult.data?.[0]?.urutan_tampilan || 0) + 1;

      const vendorRow = await db.queryOne<{ nama_perusahaan: string }>(
        "vendor",
        { where: { id: input.vendorId } }
      );
      const vendorName = vendorRow.data?.nama_perusahaan || "Vendor Maklon";

      const keperluan = `Maklon ${input.saleInvoiceNumber} - ${vendorName} [REF:${purchaseId}]`;

      const periodeIdMaklon = await resolveOpenPeriodeIdForKeuangan();
      const financeResult = await db.insert("keuangan", {
        id: generateId("keu"),
        tanggal: input.tanggal,
        kategori_transaksi: "MAKLON",
        debit: 0,
        kredit: totalHarga,
        keperluan,
        biaya_bahan: 0,
        catatan:
          input.catatan?.trim() || `Maklon ke ${vendorName}`,
        dibuat_oleh: input.dibuatOleh || null,
        urutan_tampilan: nextOrder,
        reference_type: "PURCHASE_MAKLON",
        reference_id: purchaseId,
        periode_id: periodeIdMaklon,
      });
      if (financeResult.error) throw financeResult.error;
    } else {
      const jatuhTempo = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const debtResult = await db.insert("hutang_pembelian", {
        id: generateId("hutang"),
        id_pembelian: purchaseId,
        jumlah_hutang: totalHarga,
        jumlah_terbayar: 0,
        sisa_hutang: totalHarga,
        jatuh_tempo: jatuhTempo,
        status: "AKTIF",
        catatan: `Tagihan maklon ${input.saleInvoiceNumber} - jatuh tempo 30 hari`,
      });
      if (debtResult.error) throw debtResult.error;
    }
  });

  // Tidak ada recalc di sini — pemanggil (createSale) memicu recalc sekali
  // di akhir untuk seluruh transaksi.
  return { id: purchaseId };
}

/**
 * Hapus semua pembelian maklon yang dibuat otomatis untuk sebuah penjualan.
 * Membatalkan entri keuangan terkait (via [REF:<purchaseId>]) dan baris hutang
 * yang masih outstanding. Dipakai oleh deleteSale supaya pembukuan konsisten.
 */
export async function deleteMaklonPurchasesForSale(
  saleId: string
): Promise<number> {
  const rows = await db.query<any>("pembelian", {
    where: { penjualan_id_sumber: saleId, tipe_pembelian: "MAKLON" },
  });
  const purchases = rows.data || [];
  if (purchases.length === 0) return 0;

  for (const purchase of purchases) {
    await voidPurchase(
      purchase.id,
      `Pembelian maklon dibatalkan karena penjualan ${saleId} dibatalkan`
    );
  }

  return purchases.length;
}

/**
 * Ambil satu pembelian berdasarkan ID
 */

export async function updatePurchase(
  id: string,
  data: {
    nomor_pembelian: string;
    nomor_faktur: string;
    vendor_id: string | null;
    tanggal: string;
    metode_pembayaran: string;
    catatan?: string;
    diterima_oleh?: string;
    items: Array<{
      barang_id: string;
      harga_satuan_id: string;
      nama_satuan: string;
      faktor_konversi: number;
      jumlah: number;
      harga_satuan: number;
      panjang?: number | null;
      lebar?: number | null;
      jumlah_roll?: number | null;
      split_batches?: Array<{
        roll_count: number;
        targets: number[];
      }> | null;
    }>;
  }
): Promise<{ id: string }> {
  try {
    // Validate
    if (!data.nomor_faktur?.trim()) {
      throw new Error("Nomor faktur harus diisi");
    }

    if (!data.items || data.items.length === 0) {
      throw new Error("Minimal harus ada 1 item pembelian");
    }

    // Cek apakah pembelian ada
    const existing = await db.queryOne("pembelian", { where: { id } });
    if (existing.error || !existing.data) {
      throw new Error("Pembelian tidak ditemukan");
    }

    if ((existing.data as any).status_transaksi === "VOIDED") {
      throw new Error("Pembelian yang sudah dibatalkan tidak dapat diedit");
    }

    const existingMovements = await getInventoryMovements({
      source_type: "PURCHASE",
      source_id: id,
    });
    if (existingMovements.length > 0) {
      throw new Error(
        "Pembelian yang sudah masuk stok tidak dapat diedit langsung. Batalkan pembelian lalu buat ulang agar riwayat stok tetap rapi."
      );
    }

    // Calculate new total
    const total_harga = data.items.reduce(
      (sum, item) => sum + item.jumlah * item.harga_satuan,
      0
    );

    // Ambil item lama untuk membalik stok
    const oldItemsResult = await db.query<PurchaseItem>("item_pembelian", {
      where: { pembelian_id: id },
    });
    const oldItems = oldItemsResult.data || [];

    // Balikkan stok lama dan perubahan nilai inventori
    for (const oldItem of oldItems) {
      await reversePurchaseCostFromMaterial(oldItem);
    }

    // Delete old items
    for (const oldItem of oldItems) {
      await db.delete("item_pembelian", oldItem.id);
    }

    // Perbarui header pembelian
    const metodePembayaran = normalizePaymentMethod(data.metode_pembayaran);
    const jumlahDibayar = isCashPayment(metodePembayaran) ? total_harga : 0;
    const statusPembayaran = isCashPayment(metodePembayaran) ? "LUNAS" : "HUTANG";

    const purchaseUpdate = {
      nomor_pembelian: data.nomor_pembelian,
      nomor_faktur: data.nomor_faktur.trim(),
      vendor_id: data.vendor_id,
      tanggal: data.tanggal,
      total_jumlah: total_harga,
      jumlah_dibayar: jumlahDibayar,
      metode_pembayaran: metodePembayaran,
      status_pembayaran: statusPembayaran,
      catatan: data.catatan?.trim() || null,
      diterima_oleh: data.diterima_oleh?.trim() || null,
    };

    const updateResult = await db.update("pembelian", id, purchaseUpdate);
    if (updateResult.error) {
      throw updateResult.error;
    }

    // Insert new items
    for (const item of data.items) {
      const itemId = `pi-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const subtotal = item.jumlah * item.harga_satuan;

      const purchaseItem = {
        id: itemId,
        pembelian_id: id,
        barang_id: item.barang_id,
        harga_satuan_id: item.harga_satuan_id,
        nama_satuan: item.nama_satuan,
        faktor_konversi: item.faktor_konversi,
        jumlah: item.jumlah,
        harga_satuan: item.harga_satuan,
        subtotal,
        panjang: item.panjang ?? null,
        lebar: item.lebar ?? null,
        jumlah_roll: Math.max(1, Math.round(Number(item.jumlah_roll) || 1)),
      };

      const itemResult = await db.insert("item_pembelian", purchaseItem);
      if (itemResult.error) {
        console.error("Failed to insert purchase item:", itemResult.error);
      }

      const faktorKonversi = positiveNumber(item.faktor_konversi) || 1;
      const qtyBase = item.jumlah * faktorKonversi;
      const unitCost = positiveNumber(item.harga_satuan) / faktorKonversi;
      const rollWidth = positiveNumber(item.lebar);
      const rollLengthSingle = positiveNumber(item.panjang);
      const rollCount = Math.max(
        1,
        Math.round(positiveNumber(item.jumlah_roll) || 1)
      );
      const rollLengthTotal = rollLengthSingle * rollCount;
      const rollVariant =
        rollWidth > 0 && rollLengthTotal > 0
          ? await findOrCreateRollVariant({
              barang_id: item.barang_id,
              lebar_m: rollWidth,
              average_cost_per_m2: unitCost,
              catatan: `Penerimaan pembelian ${data.nomor_faktur}`,
            })
          : null;
      await postInventoryMovement({
        id: `mov-${itemId}`,
        barang_id: item.barang_id,
        tanggal: data.tanggal,
        movement_type: "PURCHASE_RECEIPT",
        qty_delta: qtyBase,
        unit_cost: unitCost,
        source_type: "PURCHASE",
        source_id: id,
        source_line_id: itemId,
        roll_variant_id: rollVariant?.id || null,
        roll_width_m: rollVariant ? rollWidth : null,
        linear_delta_m: rollVariant ? rollLengthTotal : null,
        catatan: `Penerimaan pembelian ${data.nomor_faktur}`,
      });

      if (
        rollVariant &&
        Array.isArray(item.split_batches) &&
        item.split_batches.length > 0
      ) {
        let totalUsedRolls = 0;
        for (const batch of item.split_batches) {
          const batchCount = Math.max(
            0,
            Math.round(Number(batch?.roll_count) || 0)
          );
          const cleanTargets = (batch?.targets || [])
            .map(Number)
            .filter((n) => Number.isFinite(n) && n > 0);
          if (batchCount === 0 || cleanTargets.length === 0) continue;
          totalUsedRolls += batchCount;
          if (totalUsedRolls > rollCount) {
            throw new Error(
              `Item ${item.barang_id}: total roll yang dipotong (${totalUsedRolls}) melebihi jumlah roll (${rollCount}).`
            );
          }
          await convertRollVariant({
            source_roll_variant_id: rollVariant.id,
            target_widths_m: cleanTargets,
            length_m: rollLengthSingle * batchCount,
            reason: `Potong ${batchCount} roll dari pembelian ${data.nomor_faktur}`,
            tanggal: data.tanggal,
          });
        }
      }
    }

    // Update keuangan entry if exists (for LUNAS purchases)
    const nomorFakturUpdate = data.nomor_faktur || data.nomor_pembelian;
    const poLabelUpdate =
      data.nomor_pembelian && data.nomor_pembelian !== nomorFakturUpdate
        ? `${data.nomor_pembelian} / Faktur ${nomorFakturUpdate}`
        : `Faktur ${nomorFakturUpdate}`;
    const keperluanText = `Pembelian ${poLabelUpdate} [REF:${id}]`;

    const keuAllForRef = await db.query<any>("keuangan", {});
    const matchingKeu = (keuAllForRef.data || []).filter((e: Record<string,unknown>) =>
      String(e.keperluan || "").includes(`[REF:${id}]`)
    );

    if (matchingKeu.length > 0) {
      const keuanganId = matchingKeu[0].id;
      await db.update("keuangan", keuanganId, {
        tanggal: data.tanggal,
        keperluan: keperluanText,
        kredit: total_harga,
        biaya_bahan: 0,
        catatan: data.catatan || null,
      });
    }

    await recalculateCashbookIfAvailable();

    return { id };
  } catch (error) {
    console.error("Error updating purchase:", error);
    throw error;
  }
}

/**
 * Ambil semua pembelian yang masih punya hutang outstanding
 */

export async function voidPurchase(
  id: string,
  reason: string = "Pembelian dibatalkan",
  actorId?: string | null
): Promise<void> {
  try {
    const sb: any =
      process.env.TAURI === "true" || process.env.TAURI === "1"
        ? null
        : getServerSupabaseClient();
    if (usePgCompositeRpc() && sb) {
      const { error } = await sb.rpc("void_purchase_with_inventory", {
        purchase_id: id,
        reason,
        actor_id: actorId || null,
      });
      if (error) {
        const message = (error as any).message || "";
        const friendly = message.includes("Stok tidak cukup")
          ? `Stok dari pembelian ini sudah dipakai. Gunakan Retur/Adjustment atau batalkan transaksi penjualan terkait dulu. Detail: ${message}`
          : friendlyPgError(error, "pembelian");
        throw new Error(friendly);
      }
      await recalculateCashbookIfAvailable();
      return;
    }

    const purchase = await getPurchaseById(id);
    if (!purchase) {
      throw new Error("Pembelian tidak ditemukan");
    }
    if ((purchase as any).status_transaksi === "VOIDED") {
      throw new Error("Pembelian sudah dibatalkan");
    }

    const hutangRow = await db.queryOne<any>("hutang_pembelian", {
      where: { id_pembelian: id },
    });
    if (hutangRow.data) {
      const payments = await db.query<any>("pelunasan_hutang", {
        where: { id_hutang: hutangRow.data.id },
      });
      if ((payments.data || []).length > 0) {
        throw new Error(
          "Pembelian sudah memiliki pembayaran tagihan. Revert pembayaran dulu sebelum membatalkan pembelian."
        );
      }
    }

    // Ambil item untuk membalik stok
    const itemsResult = await db.query<PurchaseItem>("item_pembelian", {
      where: { pembelian_id: id },
    });

    const items = itemsResult.data || [];
    const movements = await getInventoryMovements({
      source_type: "PURCHASE",
      source_id: id,
    });

    // Sebelum mencoba reversal, cek dulu apakah stok dari pembelian ini
    // sudah dipakai di penjualan. Kalau iya, kumpulkan nomor invoice-nya
    // supaya pesan error bisa menyebut transaksi spesifik.
    const barangIds = [...new Set(items.map((it) => it.barang_id))];
    const blockingInvoices: string[] = [];
    for (const barangId of barangIds) {
      // Cari SALE_ISSUE movements untuk barang ini yang terjadi SETELAH
      // PURCHASE_RECEIPT dari pembelian ini. Kalau ada, berarti stok dari
      // pembelian ini sudah dipakai.
      const purchaseReceipt = movements.find(
        (m) => m.movement_type === "PURCHASE_RECEIPT" && m.barang_id === barangId
      );
      if (!purchaseReceipt) continue;

      // Cek stok saat ini vs qty yang perlu di-reverse
      const barangResult = await db.queryOne<any>("barang", {
        where: { id: barangId },
      });
      const currentStock = Number(barangResult.data?.jumlah_stok || 0);
      const qtyToReverse = Math.abs(Number(purchaseReceipt.qty_delta || 0));

      if (currentStock < qtyToReverse - 0.000001) {
        // Stok tidak cukup — cari penjualan yang memakai barang ini
        const saleMovements = await getInventoryMovements({
          barang_id: barangId,
          source_type: "SALE",
        });
        for (const sm of saleMovements) {
          if (sm.movement_type !== "SALE_ISSUE") continue;
          // Cari nomor invoice dari penjualan ini
          const saleResult = await db.queryOne<any>("penjualan", {
            where: { id: sm.source_id },
          });
          if (saleResult.data) {
            const inv = saleResult.data.nomor_faktur || sm.source_id;
            const tgl = saleResult.data.dibuat_pada
              ? new Date(saleResult.data.dibuat_pada).toLocaleDateString(
                  "id-ID",
                  { day: "numeric", month: "short", year: "numeric" }
                )
              : "";
            const label = tgl ? `${inv} (${tgl})` : inv;
            if (!blockingInvoices.includes(label)) {
              blockingInvoices.push(label);
            }
          }
        }
      }
    }

    if (blockingInvoices.length > 0) {
      throw new Error(
        `Tidak bisa dibatalkan. Stok dari pembelian ini sudah dipakai di penjualan: ${blockingInvoices.join(", ")}. ` +
          `Batalkan penjualan tersebut dulu, atau gunakan Retur Vendor untuk mengembalikan sebagian stok.`
      );
    }

    // Tambahkan movement pembalik. Kalau stok sudah dipakai, ini melempar
    // error stok-tidak-cukup yang ramah dan pembelian tetap dianggap posted.
    for (const item of items) {
      const original = movements.find((movement) => {
        return (
          movement.source_line_id === item.id &&
          movement.movement_type === "PURCHASE_RECEIPT"
        );
      });
      const faktorKonversi = positiveNumber(item.faktor_konversi) || 1;
      const qtyBase = original
        ? Math.abs(Number(original.qty_delta || 0))
        : item.jumlah * faktorKonversi;
      const unitCost = original
        ? Number(original.unit_cost || 0)
        : positiveNumber(item.harga_satuan) / faktorKonversi;

      try {
        await postInventoryMovement({
          id: original ? `void-${original.id}` : `void-${item.id}`,
          barang_id: item.barang_id,
          tanggal: new Date().toISOString().split("T")[0],
          movement_type: "PURCHASE_VOID",
          qty_delta: -qtyBase,
          unit_cost: unitCost,
          source_type: "PURCHASE_VOID",
          source_id: id,
          source_line_id: item.id,
          reversal_of_id: original?.id || null,
          roll_variant_id: (original as any)?.roll_variant_id || null,
          roll_width_m: (original as any)?.roll_width_m || null,
          linear_delta_m: (original as any)?.linear_delta_m
            ? -Math.abs(Number((original as any).linear_delta_m || 0))
            : null,
          catatan: reason,
          dibuat_oleh: actorId || null,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Stok dari pembelian ini sudah dipakai. Gunakan retur/adjustment atau batalkan transaksi penjualan terkait dulu. Detail: ${msg}`
        );
      }
    }

    // Void linked cashbook entries by reference (works on Supabase + SQLite)
    const linkedCashbook = await db.query("keuangan", {});
    if (linkedCashbook.data) {
      const toVoid = linkedCashbook.data.filter((entry: Record<string,unknown>) =>
        String(entry.keperluan || "").includes(`[REF:${id}]`)
      );
      for (const entry of toVoid) {
        const voidResult = await db.update("keuangan", entry.id, {
          status_transaksi: "VOIDED",
          voided_at: new Date().toISOString(),
          voided_by: actorId || null,
          void_reason: reason,
        });
        if (voidResult.error) throw voidResult.error;
      }
    }

    if (hutangRow.data) {
      const debtVoid = await db.update("hutang_pembelian", hutangRow.data.id, {
        jumlah_terbayar: 0,
        sisa_hutang: 0,
        status: "LUNAS",
        catatan: `${hutangRow.data.catatan || ""} (Pembelian dibatalkan)`.trim(),
      });
      if (debtVoid.error) throw debtVoid.error;
    }

    const result = await db.update("pembelian", id, {
      status_transaksi: "VOIDED",
      voided_at: new Date().toISOString(),
      voided_by: actorId || null,
      void_reason: reason,
    });
    if (result.error) throw result.error;

    await recalculateCashbookIfAvailable();
  } catch (error) {
    console.error("Error voiding purchase:", error);
    throw error;
  }
}

/**
 * Pembungkus kompatibilitas: pemanggil lama masih meminta delete, tapi pembelian
 * yang sudah posted sekarang di-void supaya histori inventori tetap auditabel.
 */
export async function deletePurchase(id: string): Promise<void> {
  return voidPurchase(id, "Pembelian dibatalkan");
}

/**
 * Revert pembayaran - ubah pembelian dari LUNAS kembali ke HUTANG
 */
export async function revertPayment(
  purchaseId: string
): Promise<{ payments_deleted: number }> {
  try {
    const purchase = await getPurchaseById(purchaseId);
    if (!purchase) {
      throw new Error("Pembelian tidak ditemukan");
    }

    if ((purchase.status_pembayaran || "").toUpperCase() !== "LUNAS") {
      throw new Error(
        "Hanya pembelian dengan status LUNAS yang dapat direvert ke HUTANG"
      );
    }

    if (isCashPayment(purchase.metode_pembayaran)) {
      throw new Error(
        "Pembelian dengan metode TUNAI tidak dapat direvert. Hapus saja pembelian jika salah."
      );
    }

    const hutangRow = await db.queryOne<any>("hutang_pembelian", {
      where: { id_pembelian: purchaseId },
    });
    const hutangRecord = hutangRow.data;
    if (!hutangRecord) {
      throw new Error("Data hutang tidak ditemukan");
    }

    const pelunasanList = await db.query<any>("pelunasan_hutang", {
      where: { id_hutang: hutangRecord.id },
    });
    const payments_deleted = pelunasanList.data?.length || 0;

    if (payments_deleted === 0) {
      throw new Error("Tidak ada catatan pembayaran yang ditemukan");
    }

    for (const row of pelunasanList.data || []) {
      const del = await db.delete("pelunasan_hutang", row.id);
      if (del.error) throw del.error;
    }

    const keuAll = await db.query<any>("keuangan", {});
    const nomorFaktur = String(purchase.nomor_faktur || "");
    const toDelKeu = (keuAll.data || []).filter(
      (k: Record<string,unknown>) =>
        k.kategori_transaksi === "SUPPLY" &&
        String(k.keperluan || "").includes(nomorFaktur)
    );
    for (const k of toDelKeu) {
      const delK = await db.delete("keuangan", k.id);
      if (delK.error) throw delK.error;
    }

    const jumlahHutang = Number(
      hutangRecord.jumlah_hutang ??
        (purchase as any).total_jumlah ??
        purchase.total_harga ??
        0
    );

    await db.update("hutang_pembelian", hutangRecord.id, {
      jumlah_terbayar: 0,
      sisa_hutang: jumlahHutang,
      status: "AKTIF",
    });

    await db.update("pembelian", purchaseId, {
      jumlah_dibayar: 0,
      status_pembayaran: "HUTANG",
    });

    await recalculateCashbookIfAvailable();

    return { payments_deleted };
  } catch (error) {
    console.error("Error reverting payment:", error);
    throw error;
  }
}

/**
 * Bayar hutang untuk sebuah pembelian
 */
export async function payDebt(data: {
  purchase_id: string;
  jumlah_bayar: number;
  tanggal_bayar?: string;
  metode_pembayaran?: string;
  referensi?: string;
  catatan?: string;
  dibuat_oleh?: string;
}): Promise<{ status: string; sisa_hutang: number }> {
  try {
    // Validate
    if (!data.purchase_id) {
      throw new Error("ID pembelian harus diisi");
    }

    if (!data.jumlah_bayar || data.jumlah_bayar <= 0) {
      throw new Error("Jumlah pembayaran harus lebih dari 0");
    }

    // Ambil pembelian
    const purchase = await getPurchaseById(data.purchase_id);
    if (!purchase) {
      throw new Error("Pembelian tidak ditemukan");
    }

    // Validate payment amount
    const sisaHutang = purchase.total_harga - (purchase.jumlah_dibayar || 0);
    if (data.jumlah_bayar > sisaHutang) {
      throw new Error("Jumlah pembayaran melebihi sisa hutang");
    }

    // Calculate new values
    const newJumlahDibayar = (purchase.jumlah_dibayar || 0) + data.jumlah_bayar;
    const newSisaHutang = purchase.total_harga - newJumlahDibayar;
    const newStatus = newSisaHutang <= 0 ? "LUNAS" : "SEBAGIAN";

    const purchaseTotal = Number(
      (purchase as any).total_jumlah ?? purchase.total_harga ?? 0
    );

    // Ambil atau buat record hutang_pembelian
    const hutangRow = await db.queryOne<any>("hutang_pembelian", {
      where: { id_pembelian: data.purchase_id },
    });

    let hutangId = hutangRow.data?.id as string | undefined;

    if (!hutangId) {
      hutangId = `hutang-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      await db.insert("hutang_pembelian", {
        id: hutangId,
        id_pembelian: data.purchase_id,
        jumlah_hutang: purchaseTotal,
        jumlah_terbayar: 0,
        sisa_hutang: purchaseTotal,
        status: "AKTIF",
      });
    }

    // Insert pelunasan_hutang record
    const pelunasanId = `pelunasan-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    await db.insert("pelunasan_hutang", {
      id: pelunasanId,
      id_hutang: hutangId,
      tanggal_bayar:
        data.tanggal_bayar || new Date().toISOString().split("T")[0],
      jumlah_bayar: data.jumlah_bayar,
      metode_pembayaran: normalizePaymentMethod(data.metode_pembayaran),
      referensi: data.referensi?.trim() || null,
      catatan: data.catatan?.trim() || null,
      dibuat_oleh: data.dibuat_oleh || null,
    });

    await db.update("hutang_pembelian", hutangId, {
      jumlah_terbayar: newJumlahDibayar,
      sisa_hutang: newSisaHutang,
      status: newSisaHutang <= 0 ? "LUNAS" : "AKTIF",
    });

    // Update pembelian
    await db.update("pembelian", data.purchase_id, {
      jumlah_dibayar: newJumlahDibayar,
      status_pembayaran: newStatus,
    });

    // Create keuangan entry (SUPPLY category)
    const maxOrderResult = await db.query<any>("keuangan", {
      orderBy: { column: "urutan_tampilan", ascending: false },
      limit: 1,
    });
    const nextOrder =
      (maxOrderResult.data?.[0]?.urutan_tampilan || 0) + 1;

    // Get vendor info
    const vendorResult = purchase.vendor_id
      ? await db.queryOne<any>("vendor", {
          where: { id: purchase.vendor_id },
        })
      : { data: null };
    const vendor = vendorResult.data;

    const keperluan = `Pembayaran Hutang ${purchase.nomor_faktur}${
      vendor ? ` - ${vendor.nama_perusahaan}` : ""
    }${data.referensi ? ` (Ref: ${data.referensi})` : ""} [REF:${
      data.purchase_id
    }]`;

    // Pakai kategori MAKLON saat melunasi PO maklon vendor supaya buku kas
    // melaporkannya di bawah "Biaya Maklon" alih-alih "Supply". Untuk pembelian
    // BARANG biasa, tetap pakai kategori legacy SUPPLY.
    const kategoriPembayaran =
      (purchase as any).tipe_pembelian === "MAKLON" ? "MAKLON" : "SUPPLY";

    const periodeIdBayar = await resolveOpenPeriodeIdForKeuangan();
    await db.insert("keuangan", {
      id: `keu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tanggal: data.tanggal_bayar || new Date().toISOString().split("T")[0],
      kategori_transaksi: kategoriPembayaran,
      debit: 0,
      kredit: data.jumlah_bayar,
      keperluan,
      biaya_bahan: 0,
      catatan:
        data.catatan || `Pelunasan ${newStatus} - ${purchase.nomor_faktur}`,
      dibuat_oleh: data.dibuat_oleh || null,
      urutan_tampilan: nextOrder,
      reference_type:
        kategoriPembayaran === "MAKLON" ? "PURCHASE_MAKLON_PAYMENT" : "PURCHASE_PAYMENT",
      reference_id: data.purchase_id,
      periode_id: periodeIdBayar,
    });

    await recalculateCashbookIfAvailable();

    return {
      status: newStatus,
      sisa_hutang: newSisaHutang,
    };
  } catch (error) {
    console.error("Error paying debt:", error);
    throw error;
  }
}

/**
 * Retur Vendor: kembalikan sebagian (atau seluruh) qty dari pembelian POSTED
 * ke vendor. Membuat movement PURCHASE_RETURN (qty negatif) per line yang
 * dipilih user.
 *
 * Berbeda dari void:
 *   - Pembelian tetap POSTED, tidak di-flip ke VOIDED.
 *   - Hanya line yang user pilih yang dikembalikan, partial allowed.
 *   - Stok yang dikembalikan dievaluasi pakai movement asli (PURCHASE_RECEIPT)
 *     untuk dapat unit_cost yang dipakai saat receipt.
 *   - Kalau qty current < qty retur (sudah dipakai jual), throw friendly error.
 *
 * Belum di-handle (out of scope v1):
 *   - Pengurangan kewajiban hutang vendor (user lakukan manual via revert).
 *   - Penyesuaian PPN masukan (kalau pembelian kena PPN, retur juga harus
 *     bikin nota retur PPN. Untuk sekarang user lakukan manual lewat Coretax).
 */
export async function createPurchaseReturn(input: {
  purchase_id: string;
  reason: string;
  actor_id?: string | null;
  /** Per line: id_item_pembelian + qty yang akan di-retur (dalam satuan jumlah, bukan base unit). */
  items: Array<{ item_pembelian_id: string; qty: number }>;
}): Promise<{ ok: true; total_retur_value: number }> {
  const formalReturn = await import("./return-service").then((m) =>
    m.createPurchaseReturn(input)
  );
  return { ok: true, total_retur_value: formalReturn.total_retur };
}

async function createLegacyInventoryOnlyPurchaseReturn(input: {
  purchase_id: string;
  reason: string;
  actor_id?: string | null;
  items: Array<{ item_pembelian_id: string; qty: number }>;
}): Promise<{ ok: true; total_retur_value: number }> {
  if (!input.reason?.trim()) {
    throw new Error("Alasan retur wajib diisi");
  }
  if (!input.items?.length) {
    throw new Error("Minimal satu line untuk retur");
  }

  const purchase = await getPurchaseById(input.purchase_id);
  if (!purchase) {
    throw new Error("Pembelian tidak ditemukan");
  }
  if ((purchase as any).status_transaksi === "VOIDED") {
    throw new Error("Pembelian sudah dibatalkan, tidak bisa di-retur");
  }

  // Load items + movements pembelian
  const itemsRes = await db.query<any>("item_pembelian", {
    where: { pembelian_id: input.purchase_id },
  });
  if (itemsRes.error) throw itemsRes.error;
  const items = itemsRes.data || [];
  const movements = await getInventoryMovements({
    source_type: "PURCHASE",
    source_id: input.purchase_id,
  });

  let totalReturValue = 0;

  for (const reqLine of input.items) {
    if (!reqLine.qty || reqLine.qty <= 0) continue;
    const item = items.find((it: Record<string,unknown>) => it.id === reqLine.item_pembelian_id);
    if (!item) {
      throw new Error(`Item pembelian ${reqLine.item_pembelian_id} tidak ditemukan`);
    }
    const original = movements.find(
      (m) =>
        m.source_line_id === item.id && m.movement_type === "PURCHASE_RECEIPT"
    );
    const faktorKonversi = positiveNumber(item.faktor_konversi) || 1;
    const qtyBaseRetur = reqLine.qty * faktorKonversi;
    if (qtyBaseRetur > Math.abs(Number(original?.qty_delta || 0))) {
      throw new Error(
        `Retur ${item.id}: qty ${reqLine.qty} melebihi qty pembelian ${
          (Number(original?.qty_delta || 0) / faktorKonversi).toFixed(2)
        }`
      );
    }
    const unitCost = original
      ? Number(original.unit_cost || 0)
      : positiveNumber(item.harga_satuan) / faktorKonversi;

    try {
      await postInventoryMovement({
        id: `ret-${item.id}-${Date.now()}`,
        barang_id: item.barang_id,
        tanggal: new Date().toISOString().split("T")[0],
        movement_type: "PURCHASE_RETURN",
        qty_delta: -qtyBaseRetur,
        unit_cost: unitCost,
        source_type: "PURCHASE_RETURN",
        source_id: input.purchase_id,
        source_line_id: item.id,
        reversal_of_id: original?.id || null,
        roll_variant_id: (original as any)?.roll_variant_id || null,
        roll_width_m: (original as any)?.roll_width_m || null,
        linear_delta_m:
          (original as any)?.linear_delta_m && positiveNumber(item.jumlah) > 0
            ? -Math.abs(Number((original as any).linear_delta_m || 0)) *
              (reqLine.qty / positiveNumber(item.jumlah))
            : null,
        catatan: `Retur ke vendor: ${input.reason.trim()}`,
        dibuat_oleh: input.actor_id || null,
      });
      totalReturValue += qtyBaseRetur * unitCost;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Retur ${item.id}: stok tidak cukup. ${msg}. Stok dari pembelian ini sudah dipakai untuk penjualan; batalkan transaksi penjualan terkait dulu, atau retur lebih sedikit.`
      );
    }
  }

  await recalculateCashbookIfAvailable();
  return { ok: true, total_retur_value: totalReturValue };
}

