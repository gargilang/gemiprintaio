import "server-only";

import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { recalculateCashbookIfAvailable } from "@/lib/services/finance-service";
import {
  getInventoryMovements,
  postInventoryMovement,
} from "@/lib/services/inventory-service";
import {
  generateDailyDocumentNumber,
  numeric,
  positiveNumber,
  todayJakarta,
} from "./document-number-service";

async function nextCashbookOrder() {
  const result = await db.query<any>("keuangan", {
    orderBy: { column: "urutan_tampilan", ascending: false },
    limit: 1,
  });
  if (result.error) throw result.error;
  return Number(result.data?.[0]?.urutan_tampilan || 0) + 1;
}

async function insertCashbookEntry(input: {
  tanggal: string;
  kategori_transaksi: string;
  debit?: number;
  kredit?: number;
  keperluan: string;
  catatan?: string | null;
  dibuat_oleh?: string | null;
  reference_type: string;
  reference_id: string;
}) {
  const res = await db.insert("keuangan", {
    id: generateId(),
    tanggal: input.tanggal,
    kategori_transaksi: input.kategori_transaksi,
    debit: input.debit || 0,
    kredit: input.kredit || 0,
    keperluan: input.keperluan,
    catatan: input.catatan || null,
    dibuat_oleh: input.dibuat_oleh || null,
    urutan_tampilan: await nextCashbookOrder(),
    reference_type: input.reference_type,
    reference_id: input.reference_id,
  });
  if (res.error) throw res.error;
}

async function enrichReturns(table: "retur_penjualan" | "retur_pembelian", rows: any[]) {
  const sourceTable = table === "retur_penjualan" ? "penjualan" : "pembelian";
  const sourceKey = table === "retur_penjualan" ? "penjualan_id" : "pembelian_id";
  const ids = [...new Set(rows.map((row) => row[sourceKey]).filter(Boolean))];
  const sourceMap = new Map<string, any>();
  await Promise.all(
    ids.map(async (id) => {
      const res = await db.queryOne<any>(sourceTable, { where: { id } });
      if (res.data) sourceMap.set(id, res.data);
    })
  );
  return rows.map((row) => ({
    ...row,
    source: sourceMap.get(row[sourceKey]) || null,
  }));
}

export async function getSalesReturns(limit = 200) {
  const result = await db.query<any>("retur_penjualan", {
    orderBy: { column: "dibuat_pada", ascending: false },
    limit,
  });
  if (result.error) throw result.error;
  return enrichReturns("retur_penjualan", result.data || []);
}

export async function getPurchaseReturns(limit = 200) {
  const result = await db.query<any>("retur_pembelian", {
    orderBy: { column: "dibuat_pada", ascending: false },
    limit,
  });
  if (result.error) throw result.error;
  return enrichReturns("retur_pembelian", result.data || []);
}

async function getReturnedQtyByItem(table: "item_retur_penjualan" | "item_retur_pembelian", itemKey: string) {
  const result = await db.query<any>(table, {});
  if (result.error) throw result.error;
  const map = new Map<string, number>();
  for (const row of result.data || []) {
    map.set(row[itemKey], (map.get(row[itemKey]) || 0) + numeric(row.qty));
  }
  return map;
}

export async function getSalesReturnInit() {
  const { getSales } = await import("@/lib/services/pos-service");
  const [sales, returns] = await Promise.all([getSales(200), getSalesReturns(100)]);
  return { sales, returns };
}

export async function getPurchaseReturnInit() {
  const { getPurchases } = await import("@/lib/services/purchases-service");
  const [purchases, returns] = await Promise.all([getPurchases(), getPurchaseReturns(100)]);
  return { purchases, returns };
}

export async function createSalesReturn(input: {
  sale_id: string;
  tanggal?: string;
  reason: string;
  catatan?: string | null;
  actor_id?: string | null;
  items: Array<{ item_penjualan_id: string; qty: number }>;
}) {
  if (!input.reason?.trim()) throw new Error("Alasan retur wajib diisi");
  if (!input.items?.length) throw new Error("Minimal satu line retur");

  const saleRes = await db.queryOne<any>("penjualan", {
    where: { id: input.sale_id },
  });
  if (saleRes.error) throw saleRes.error;
  const sale = saleRes.data;
  if (!sale) throw new Error("Penjualan tidak ditemukan");
  if (sale.status_transaksi === "VOIDED") {
    throw new Error("Penjualan sudah dibatalkan, tidak bisa diretur");
  }

  const itemsRes = await db.query<any>("item_penjualan", {
    where: { penjualan_id: input.sale_id },
  });
  if (itemsRes.error) throw itemsRes.error;
  const saleItems = itemsRes.data || [];
  const returned = await getReturnedQtyByItem("item_retur_penjualan", "item_penjualan_id");
  const movements = await getInventoryMovements({
    source_type: "SALE",
    source_id: input.sale_id,
  });

  const tanggal = input.tanggal || todayJakarta();
  const returnId = generateId();
  const nomor = await generateDailyDocumentNumber(
    "retur_penjualan",
    "nomor_retur",
    "RJ",
    tanggal
  );

  let totalRetur = 0;
  let totalDpp = 0;
  let totalPpn = 0;
  let totalHpp = 0;
  const prepared: any[] = [];

  for (const line of input.items) {
    const qty = positiveNumber(line.qty);
    if (qty <= 0) continue;
    const item = saleItems.find((row: any) => row.id === line.item_penjualan_id);
    if (!item) throw new Error(`Item penjualan ${line.item_penjualan_id} tidak ditemukan`);
    const already = returned.get(item.id) || 0;
    const remaining = numeric(item.jumlah) - already;
    if (qty > remaining + 0.000001) {
      throw new Error(`Qty retur ${item.id} melebihi sisa qty yang bisa diretur`);
    }
    const faktor = positiveNumber(item.faktor_konversi) || 1;
    const qtyBase = qty * faktor;
    const ratio = numeric(item.jumlah) > 0 ? qty / numeric(item.jumlah) : 0;
    const subtotal = numeric(item.harga_satuan) * qty;
    const hppSatuan = numeric(item.hpp_satuan);
    const hppTotal = hppSatuan * qty;
    const dppTotal = numeric(item.dpp_total) ? numeric(item.dpp_total) * ratio : subtotal;
    const ppnTotal = numeric(item.ppn_total) * ratio;
    const original = movements.find(
      (movement) =>
        movement.source_line_id === item.id &&
        movement.movement_type === "SALE_ISSUE"
    );
    prepared.push({
      item,
      qty,
      qtyBase,
      subtotal,
      hppSatuan,
      hppTotal,
      dppTotal,
      ppnTotal,
      unitCost: numeric(original?.unit_cost) || hppSatuan / faktor,
      reversal_of_id: original?.id || null,
    });
    totalRetur += subtotal;
    totalDpp += dppTotal;
    totalPpn += ppnTotal;
    totalHpp += hppTotal;
  }

  if (prepared.length === 0) throw new Error("Qty retur harus lebih dari 0");

  const receivableRes = await db.queryOne<any>("piutang_penjualan", {
    where: { id_penjualan: input.sale_id },
  });
  const receivable = receivableRes.data;
  const receivableReduction = Math.min(totalRetur, numeric(receivable?.sisa_piutang));
  const refundAmount = Math.max(0, totalRetur - receivableReduction);
  // Non-cash reversal nilainya = sisa nilai retur yang tidak menghasilkan
  // refund kas. Termasuk kasus invoice unpaid (semuanya non-cash) atau
  // sebagian terbayar (refund untuk yang sudah dibayar, sisanya non-cash).
  const nonCashReversal = Math.max(0, totalRetur - refundAmount);

  await db.transaction(async () => {
    const header = await db.insert("retur_penjualan", {
      id: returnId,
      nomor_retur: nomor,
      penjualan_id: input.sale_id,
      tanggal,
      status: "POSTED",
      total_retur: totalRetur,
      dpp_total: totalDpp,
      ppn_total: totalPpn,
      total_hpp: totalHpp,
      receivable_reduction: receivableReduction,
      refund_amount: refundAmount,
      reason: input.reason.trim(),
      catatan: input.catatan?.trim() || null,
      dibuat_oleh: input.actor_id || null,
    });
    if (header.error) throw header.error;

    for (const line of prepared) {
      const itemId = generateId();
      const movement = await postInventoryMovement({
        id: `mov-${itemId}`,
        barang_id: line.item.barang_id,
        tanggal,
        movement_type: "SALE_RETURN",
        qty_delta: line.qtyBase,
        unit_cost: line.unitCost,
        source_type: "SALE_RETURN",
        source_id: returnId,
        source_line_id: itemId,
        reversal_of_id: line.reversal_of_id,
        catatan: `${nomor}: ${input.reason.trim()}`,
        dibuat_oleh: input.actor_id || null,
      });
      const row = await db.insert("item_retur_penjualan", {
        id: itemId,
        retur_penjualan_id: returnId,
        item_penjualan_id: line.item.id,
        barang_id: line.item.barang_id,
        qty: line.qty,
        qty_base: line.qtyBase,
        nama_satuan: line.item.nama_satuan,
        faktor_konversi: line.item.faktor_konversi,
        harga_satuan: line.item.harga_satuan,
        subtotal: line.subtotal,
        hpp_satuan: line.hppSatuan,
        hpp_total: line.hppTotal,
        dpp_total: line.dppTotal,
        ppn_total: line.ppnTotal,
        movement_id: movement?.id || null,
      });
      if (row.error) throw row.error;
    }

    if (receivable && receivableReduction > 0) {
      const nextSisa = Math.max(0, numeric(receivable.sisa_piutang) - receivableReduction);
      const nextJumlah = Math.max(0, numeric(receivable.jumlah_piutang) - receivableReduction);
      const upd = await db.update("piutang_penjualan", receivable.id, {
        jumlah_piutang: nextJumlah,
        sisa_piutang: nextSisa,
        status: nextSisa <= 0 ? "LUNAS" : numeric(receivable.jumlah_terbayar) > 0 ? "SEBAGIAN" : "AKTIF",
        catatan: `${receivable.catatan || ""} Retur ${nomor}`.trim(),
      });
      if (upd.error) throw upd.error;
    }

    if (refundAmount > 0) {
      await insertCashbookEntry({
        tanggal,
        kategori_transaksi: "RETUR_PENJUALAN",
        kredit: refundAmount,
        keperluan: `Refund retur penjualan ${nomor} (${sale.nomor_faktur}) [REF:${returnId}]`,
        catatan: input.catatan || input.reason,
        dibuat_oleh: input.actor_id || null,
        reference_type: "SALE_RETURN",
        reference_id: returnId,
      });
    }
    if (nonCashReversal > 0) {
      // Pengurangan piutang/omzet tanpa pergerakan kas. Kategori
      // RETUR_PENJUALAN_NONCASH dikonfigurasi untuk menurunkan omzet (-1)
      // tanpa menyentuh saldo (lihat migrasi
      // 20260525130000_return_non_cash_revenue.sql).
      await insertCashbookEntry({
        tanggal,
        kategori_transaksi: "RETUR_PENJUALAN_NONCASH",
        kredit: nonCashReversal,
        keperluan: `Pembalik omzet retur ${nomor} (${sale.nomor_faktur}) [REF:${returnId}]`,
        catatan: input.catatan || input.reason,
        dibuat_oleh: input.actor_id || null,
        reference_type: "SALE_RETURN_NONCASH",
        reference_id: returnId,
      });
    }
    if (totalHpp > 0) {
      await insertCashbookEntry({
        tanggal,
        kategori_transaksi: "RETUR_HPP",
        debit: totalHpp,
        keperluan: `Pembalik HPP retur ${nomor} (${sale.nomor_faktur}) [REF:${returnId}]`,
        catatan: input.catatan || input.reason,
        dibuat_oleh: input.actor_id || null,
        reference_type: "SALE_RETURN_HPP",
        reference_id: returnId,
      });
    }
  });

  await recalculateCashbookIfAvailable();
  return { id: returnId, nomor_retur: nomor, total_retur: totalRetur, refund_amount: refundAmount };
}

export async function createPurchaseReturn(input: {
  purchase_id: string;
  tanggal?: string;
  reason: string;
  catatan?: string | null;
  actor_id?: string | null;
  items: Array<{ item_pembelian_id: string; qty: number }>;
}) {
  if (!input.reason?.trim()) throw new Error("Alasan retur wajib diisi");
  if (!input.items?.length) throw new Error("Minimal satu line retur");

  const purchaseRes = await db.queryOne<any>("pembelian", {
    where: { id: input.purchase_id },
  });
  if (purchaseRes.error) throw purchaseRes.error;
  const purchase = purchaseRes.data;
  if (!purchase) throw new Error("Pembelian tidak ditemukan");
  if (purchase.status_transaksi === "VOIDED") {
    throw new Error("Pembelian sudah dibatalkan, tidak bisa diretur");
  }

  const itemsRes = await db.query<any>("item_pembelian", {
    where: { pembelian_id: input.purchase_id },
  });
  if (itemsRes.error) throw itemsRes.error;
  const purchaseItems = itemsRes.data || [];
  const returned = await getReturnedQtyByItem("item_retur_pembelian", "item_pembelian_id");
  const movements = await getInventoryMovements({
    source_type: "PURCHASE",
    source_id: input.purchase_id,
  });

  const tanggal = input.tanggal || todayJakarta();
  const returnId = generateId();
  const nomor = await generateDailyDocumentNumber(
    "retur_pembelian",
    "nomor_retur",
    "RP",
    tanggal
  );

  let totalRetur = 0;
  let totalDpp = 0;
  let totalPpn = 0;
  const prepared: any[] = [];

  for (const line of input.items) {
    const qty = positiveNumber(line.qty);
    if (qty <= 0) continue;
    const item = purchaseItems.find((row: any) => row.id === line.item_pembelian_id);
    if (!item) throw new Error(`Item pembelian ${line.item_pembelian_id} tidak ditemukan`);
    const already = returned.get(item.id) || 0;
    const remaining = numeric(item.jumlah) - already;
    if (qty > remaining + 0.000001) {
      throw new Error(`Qty retur ${item.id} melebihi sisa qty yang bisa diretur`);
    }
    const faktor = positiveNumber(item.faktor_konversi) || 1;
    const qtyBase = qty * faktor;
    const ratio = numeric(item.jumlah) > 0 ? qty / numeric(item.jumlah) : 0;
    const subtotal = numeric(item.harga_satuan) * qty;
    const dppTotal = numeric(item.dpp_total) ? numeric(item.dpp_total) * ratio : subtotal;
    const ppnTotal = numeric(item.ppn_total) * ratio;
    const original = movements.find(
      (movement) =>
        movement.source_line_id === item.id &&
        movement.movement_type === "PURCHASE_RECEIPT"
    );
    prepared.push({
      item,
      qty,
      qtyBase,
      subtotal,
      dppTotal,
      ppnTotal,
      unitCost: numeric(original?.unit_cost) || numeric(item.harga_satuan) / faktor,
      reversal_of_id: original?.id || null,
      roll_variant_id: (original as any)?.roll_variant_id || null,
      roll_width_m: (original as any)?.roll_width_m || null,
      linear_delta_m:
        (original as any)?.linear_delta_m && numeric(item.jumlah) > 0
          ? -Math.abs(Number((original as any).linear_delta_m || 0)) * ratio
          : null,
    });
    totalRetur += subtotal;
    totalDpp += dppTotal;
    totalPpn += ppnTotal;
  }

  if (prepared.length === 0) throw new Error("Qty retur harus lebih dari 0");

  const debtRes = await db.queryOne<any>("hutang_pembelian", {
    where: { id_pembelian: input.purchase_id },
  });
  const debt = debtRes.data;
  const debtReduction = Math.min(totalRetur, numeric(debt?.sisa_hutang));
  const refundAmount = Math.max(0, totalRetur - debtReduction);

  await db.transaction(async () => {
    const header = await db.insert("retur_pembelian", {
      id: returnId,
      nomor_retur: nomor,
      pembelian_id: input.purchase_id,
      tanggal,
      status: "POSTED",
      total_retur: totalRetur,
      dpp_total: totalDpp,
      ppn_total: totalPpn,
      debt_reduction: debtReduction,
      refund_amount: refundAmount,
      reason: input.reason.trim(),
      catatan: input.catatan?.trim() || null,
      dibuat_oleh: input.actor_id || null,
    });
    if (header.error) throw header.error;

    for (const line of prepared) {
      const itemId = generateId();
      const movement = await postInventoryMovement({
        id: `mov-${itemId}`,
        barang_id: line.item.barang_id,
        tanggal,
        movement_type: "PURCHASE_RETURN",
        qty_delta: -line.qtyBase,
        unit_cost: line.unitCost,
        source_type: "PURCHASE_RETURN",
        source_id: returnId,
        source_line_id: itemId,
        reversal_of_id: line.reversal_of_id,
        roll_variant_id: line.roll_variant_id || null,
        roll_width_m: line.roll_width_m || null,
        linear_delta_m: line.linear_delta_m || null,
        catatan: `${nomor}: ${input.reason.trim()}`,
        dibuat_oleh: input.actor_id || null,
      });
      const row = await db.insert("item_retur_pembelian", {
        id: itemId,
        retur_pembelian_id: returnId,
        item_pembelian_id: line.item.id,
        barang_id: line.item.barang_id,
        qty: line.qty,
        qty_base: line.qtyBase,
        nama_satuan: line.item.nama_satuan,
        faktor_konversi: line.item.faktor_konversi,
        harga_satuan: line.item.harga_satuan,
        subtotal: line.subtotal,
        dpp_total: line.dppTotal,
        ppn_total: line.ppnTotal,
        movement_id: movement?.id || null,
      });
      if (row.error) throw row.error;
    }

    if (debt && debtReduction > 0) {
      const nextSisa = Math.max(0, numeric(debt.sisa_hutang) - debtReduction);
      const nextJumlah = Math.max(0, numeric(debt.jumlah_hutang) - debtReduction);
      const updDebt = await db.update("hutang_pembelian", debt.id, {
        jumlah_hutang: nextJumlah,
        sisa_hutang: nextSisa,
        status: nextSisa <= 0 ? "LUNAS" : "AKTIF",
        catatan: `${debt.catatan || ""} Retur ${nomor}`.trim(),
      });
      if (updDebt.error) throw updDebt.error;
    }

    if (refundAmount > 0) {
      await insertCashbookEntry({
        tanggal,
        kategori_transaksi: "RETUR_PEMBELIAN",
        debit: refundAmount,
        keperluan: `Refund vendor retur pembelian ${nomor} (${purchase.nomor_faktur || purchase.nomor_pembelian}) [REF:${returnId}]`,
        catatan: input.catatan || input.reason,
        dibuat_oleh: input.actor_id || null,
        reference_type: "PURCHASE_RETURN",
        reference_id: returnId,
      });
    }
  });

  const newPaid = Math.max(0, numeric(purchase.jumlah_dibayar) - refundAmount);
  const newTotal = Math.max(0, numeric(purchase.total_jumlah) - totalRetur);
  await db.update("pembelian", input.purchase_id, {
    total_jumlah: newTotal,
    jumlah_dibayar: newPaid,
    status_pembayaran:
      newTotal <= 0 || newPaid >= newTotal
        ? "LUNAS"
        : newPaid > 0
          ? "SEBAGIAN"
          : "HUTANG",
    diperbarui_pada: getCurrentTimestamp(),
  });

  await recalculateCashbookIfAvailable();
  return { id: returnId, nomor_retur: nomor, total_retur: totalRetur, refund_amount: refundAmount };
}
