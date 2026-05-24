import "server-only";

import { db } from "@/lib/db-unified";

export type AuditEventKind =
  | "PURCHASE_VOID"
  | "SALE_VOID"
  | "ADJUSTMENT"
  | "WASTE"
  | "NSFP_CANCEL";

export interface AuditEvent {
  id: string;
  kind: AuditEventKind;
  /** ISO timestamp when the event was recorded */
  occurred_at: string;
  /** Display title for list view */
  title: string;
  /** Free-text description from user (alasan, keterangan) */
  reason?: string | null;
  /** Actor user id who performed the action, when available */
  actor_id?: string | null;
  /** Generic reference for click-through (mis. pembelian.id, penjualan.id) */
  ref_id?: string | null;
  /** Numeric value associated (qty, total, dst) */
  amount?: number | null;
  amount_label?: string | null;
}

/**
 * Audit log adalah query gabungan, bukan tabel terpisah. Sumbernya:
 *   - pembelian.voided_at IS NOT NULL → PURCHASE_VOID
 *   - penjualan.voided_at IS NOT NULL → SALE_VOID
 *   - inventory_movements.movement_type IN ('ADJUSTMENT', 'WASTE')
 *   - nsfp_pool.status = 'BATAL'
 *
 * Pendekatan ini menjaga normalisasi: kita tidak duplikasi data di audit
 * table, tapi tetap bisa nampilkan timeline aktivitas yang mudah dibaca.
 *
 * Untuk performa, query dilimit per source dan digabung + sort di TS.
 * Skala 1000 baris per source masih oke; kalau nanti audit log jadi
 * fitur paling sering di-query, pertimbangkan materialized view.
 */
export async function getAuditLog(filters: {
  limit?: number;
  /** Mulai dari tanggal (YYYY-MM-DD inclusive). */
  from?: string;
  /** Sampai tanggal (YYYY-MM-DD inclusive). */
  to?: string;
} = {}): Promise<AuditEvent[]> {
  const limit = Math.max(1, Math.min(1000, filters.limit ?? 200));
  const events: AuditEvent[] = [];

  // 1. Voided purchases
  const voidedPurchases = await db.query<any>("pembelian", {});
  if (voidedPurchases.error) throw voidedPurchases.error;
  for (const row of voidedPurchases.data || []) {
    if (!row.voided_at) continue;
    events.push({
      id: `pv-${row.id}`,
      kind: "PURCHASE_VOID",
      occurred_at: row.voided_at,
      title: `Pembelian dibatalkan: ${row.nomor_faktur || row.nomor_pembelian || row.id}`,
      reason: row.void_reason,
      actor_id: row.voided_by,
      ref_id: row.id,
      amount: Number(row.total_jumlah || 0),
      amount_label: "Total",
    });
  }

  // 2. Voided sales
  const voidedSales = await db.query<any>("penjualan", {});
  if (voidedSales.error) throw voidedSales.error;
  for (const row of voidedSales.data || []) {
    if (!row.voided_at) continue;
    events.push({
      id: `sv-${row.id}`,
      kind: "SALE_VOID",
      occurred_at: row.voided_at,
      title: `Penjualan dibatalkan: ${row.nomor_invoice || row.id}`,
      reason: row.void_reason,
      actor_id: row.voided_by,
      ref_id: row.id,
      amount: Number(row.total_jumlah || 0),
      amount_label: "Total",
    });
  }

  // 3. Inventory movements: ADJUSTMENT + WASTE only (events lain seperti
  //    PURCHASE_RECEIPT/SALE_ISSUE bukan audit event, mereka workflow normal)
  const movs = await db.query<any>("inventory_movements", {
    orderBy: { column: "dibuat_pada", ascending: false },
    limit: limit * 2,
  });
  if (movs.error) throw movs.error;
  // Resolve barang names in one batch — query individu per row akan slow.
  const barangIds = Array.from(
    new Set(
      (movs.data || [])
        .filter(
          (m: any) => m.movement_type === "ADJUSTMENT" || m.movement_type === "WASTE"
        )
        .map((m: any) => m.barang_id)
    )
  );
  const namaMap = new Map<string, string>();
  for (const bid of barangIds) {
    const b = await db.queryOne<any>("barang", { where: { id: bid } });
    if (b.data) namaMap.set(bid, b.data.nama || bid);
  }
  for (const row of movs.data || []) {
    if (row.movement_type !== "ADJUSTMENT" && row.movement_type !== "WASTE") {
      continue;
    }
    const nama = namaMap.get(row.barang_id) || row.barang_id;
    const qtyAbs = Math.abs(Number(row.qty_delta || 0));
    const direction = Number(row.qty_delta) >= 0 ? "+" : "−";
    events.push({
      id: `inv-${row.id}`,
      kind: row.movement_type === "WASTE" ? "WASTE" : "ADJUSTMENT",
      occurred_at: row.dibuat_pada,
      title:
        row.movement_type === "WASTE"
          ? `Material rusak: ${nama}`
          : `Adjustment stok: ${nama}`,
      reason: row.catatan,
      actor_id: row.dibuat_oleh,
      ref_id: row.barang_id,
      amount: qtyAbs,
      amount_label: `Qty ${direction}${qtyAbs}`,
    });
  }

  // 4. NSFP cancellations
  try {
    const nsfp = await db.query<any>("nsfp_pool", { where: { status: "BATAL" } });
    if (!nsfp.error) {
      for (const row of nsfp.data || []) {
        events.push({
          id: `nsfp-${row.id}`,
          kind: "NSFP_CANCEL",
          occurred_at: row.diperbarui_pada || row.dibuat_pada,
          title: `NSFP dibatalkan: ${row.kode_transaksi}.${row.tahun}.${row.nomor_seri}`,
          reason: row.catatan,
          ref_id: row.id,
        });
      }
    }
  } catch {
    // nsfp_pool mungkin belum ada (DB lama yang belum migrate). Aman skip.
  }

  // Apply date filters
  const fromMs = filters.from ? new Date(filters.from + "T00:00:00").getTime() : null;
  const toMs = filters.to ? new Date(filters.to + "T23:59:59").getTime() : null;
  let filtered = events;
  if (fromMs != null || toMs != null) {
    filtered = events.filter((e) => {
      const ms = new Date(e.occurred_at).getTime();
      if (Number.isNaN(ms)) return false;
      if (fromMs != null && ms < fromMs) return false;
      if (toMs != null && ms > toMs) return false;
      return true;
    });
  }

  // Sort by occurred_at DESC and trim
  filtered.sort((a, b) => {
    const da = new Date(a.occurred_at).getTime();
    const dbt = new Date(b.occurred_at).getTime();
    return dbt - da;
  });
  return filtered.slice(0, limit);
}
