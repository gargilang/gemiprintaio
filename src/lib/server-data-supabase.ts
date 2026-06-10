/**
 * Direct PostgREST access for server routes when SQLite file is unavailable (Vercel).
 * Use alongside db-unified mutations which already prefer Supabase on the server.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerSupabaseClient } from "./db-unified";

function clientOrNull(): SupabaseClient | null {
  return getServerSupabaseClient();
}

export async function fetchKeuanganCashBookListActive(): Promise<
  Record<string, unknown>[]
> {
  const sb = clientOrNull();
  if (!sb) return [];
  const { data, error } = await sb
    .from("keuangan")
    .select("*")
    .is("diarsipkan_pada", null)
    .or("status_transaksi.is.null,status_transaksi.neq.VOIDED")
    .order("urutan_tampilan", { ascending: false })
    .order("dibuat_pada", { ascending: false });
  if (error) throw error;
  return (data as Record<string, unknown>[]) || [];
}

export async function fetchKeuanganByArchiveLabel(
  label: string
): Promise<Record<string, unknown>[]> {
  const sb = clientOrNull();
  if (!sb) return [];
  const { data: exact, error: e1 } = await sb
    .from("keuangan")
    .select("*")
    .eq("label_arsip", label)
    .order("urutan_tampilan", { ascending: true })
    .order("tanggal", { ascending: false })
    .order("dibuat_pada", { ascending: false });
  if (e1) throw e1;
  if (exact && exact.length > 0) return exact as Record<string, unknown>[];

  const { data: likeRows, error: e2 } = await sb
    .from("keuangan")
    .select("*")
    .like("label_arsip", `%${label}%`)
    .order("urutan_tampilan", { ascending: true })
    .order("tanggal", { ascending: false })
    .order("dibuat_pada", { ascending: false });
  if (e2) throw e2;
  return (likeRows as Record<string, unknown>[]) || [];
}

export async function fetchKeuanganByArchiveLabelAndTime(
  label: string,
  archivedAt: string
): Promise<Record<string, unknown>[]> {
  const sb = clientOrNull();
  if (!sb) return [];
  const { data, error } = await sb
    .from("keuangan")
    .select("*")
    .eq("label_arsip", label)
    .eq("diarsipkan_pada", archivedAt)
    .order("urutan_tampilan", { ascending: true })
    .order("dibuat_pada", { ascending: true });
  if (error) throw error;
  return (data as Record<string, unknown>[]) || [];
}

export async function getMaxUrutanTampilanKeuangan(): Promise<number> {
  const sb = clientOrNull();
  if (!sb) return 0;
  const { data, error } = await sb
    .from("keuangan")
    .select("urutan_tampilan")
    .order("urutan_tampilan", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Number((data as { urutan_tampilan?: number })?.urutan_tampilan ?? 0);
}

export async function deleteKeuanganWhereNotArchived(): Promise<void> {
  const sb = clientOrNull();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("keuangan").delete().is("diarsipkan_pada", null);
  if (error) throw error;
}

/** Row exists with exact column match (optional exclude id). */
export async function existsTableRow(
  table: string,
  column: string,
  value: string | number,
  excludeId?: string
): Promise<boolean> {
  const sb = clientOrNull();
  if (!sb) return false;
  let q = sb.from(table).select("id").eq(column, value).limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function existsPenjualanForPelanggan(
  pelangganId: string
): Promise<boolean> {
  const sb = clientOrNull();
  if (!sb) return false;
  const { data, error } = await sb
    .from("penjualan")
    .select("id")
    .eq("pelanggan_id", pelangganId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function existsPembelianForVendor(
  vendorId: string
): Promise<boolean> {
  const sb = clientOrNull();
  if (!sb) return false;
  const { data, error } = await sb
    .from("pembelian")
    .select("id")
    .eq("vendor_id", vendorId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function countBarangWhere(
  column: "kategori_id" | "subkategori_id",
  id: string
): Promise<number> {
  const sb = clientOrNull();
  if (!sb) return 0;
  const { count, error } = await sb
    .from("barang")
    .select("*", { count: "exact", head: true })
    .eq(column, id);
  if (error) throw error;
  return count ?? 0;
}

export async function fetchLastNomorPembelian(): Promise<string | null> {
  const sb = clientOrNull();
  if (!sb) return null;
  const { data, error } = await sb
    .from("pembelian")
    .select("nomor_pembelian")
    .order("dibuat_pada", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { nomor_pembelian?: string } | null)?.nomor_pembelian ?? null;
}

/**
 * Ambil nomor pembelian maklon (`MK-NNNNN`) terakhir dari Supabase.
 * Diurutkan berdasarkan nomor_pembelian (zero-padded) supaya counter benar.
 */
export async function fetchLastNomorPembelianMaklon(): Promise<string | null> {
  const sb = clientOrNull();
  if (!sb) return null;
  const { data, error } = await sb
    .from("pembelian")
    .select("nomor_pembelian")
    .like("nomor_pembelian", "MK-%")
    .order("nomor_pembelian", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { nomor_pembelian?: string } | null)?.nomor_pembelian ?? null;
}

export async function getReferencedHargaSatuanIds(
  ids: string[]
): Promise<Set<string>> {
  const ref = new Set<string>();
  if (ids.length === 0) return ref;
  const sb = clientOrNull();
  if (!sb) return ref;

  const { data: pb } = await sb
    .from("item_pembelian")
    .select("harga_satuan_id")
    .in("harga_satuan_id", ids);
  for (const r of pb || []) {
    const id = (r as { harga_satuan_id?: string }).harga_satuan_id;
    if (id) ref.add(id);
  }
  const { data: pj } = await sb
    .from("item_penjualan")
    .select("harga_satuan_id")
    .in("harga_satuan_id", ids);
  for (const r of pj || []) {
    const id = (r as { harga_satuan_id?: string }).harga_satuan_id;
    if (id) ref.add(id);
  }
  return ref;
}
