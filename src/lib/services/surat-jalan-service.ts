/**
 * Surat Jalan (Delivery Note) Service
 *
 * Two creation modes:
 *  1. From a sale (penjualan_id set) — items copied from sale lines.
 *  2. Manual (penjualan_id null) — free-form, no source sale.
 *
 * Status flow: DRAFT → TERKIRIM → DITERIMA. BATAL is a dead-end.
 */

import "server-only";

import {
  db,
  generateId,
  getCurrentTimestamp,
  getServerSupabaseClient,
} from "../db-unified";

// ============================================================================
// TYPES
// ============================================================================

export type SuratJalanStatus = "DRAFT" | "TERKIRIM" | "DITERIMA" | "BATAL";

export interface SuratJalanItem {
  id?: string;
  surat_jalan_id?: string;
  nama_barang: string;
  keterangan?: string | null;
  ukuran?: string | null;
  qty: number;
  satuan?: string | null;
  urutan?: number;
}

export interface SuratJalan {
  id: string;
  nomor_sj: string;
  penjualan_id?: string | null;
  pelanggan_nama?: string | null;
  pelanggan_alamat?: string | null;
  pelanggan_telepon?: string | null;
  tanggal: string; // YYYY-MM-DD
  nomor_kendaraan?: string | null;
  pengirim_nama?: string | null;
  status: SuratJalanStatus;
  catatan?: string | null;
  dibuat_oleh?: string | null;
  dibuat_pada?: string;
  diperbarui_pada?: string;
  tanggal_terkirim?: string | null;
  tanggal_diterima?: string | null;
  diterima_oleh?: string | null;
  // Enriched
  nomor_invoice?: string | null;
  dibuat_oleh_nama?: string | null;
  items?: SuratJalanItem[];
}

export interface CreateSuratJalanData {
  penjualan_id?: string | null;
  pelanggan_nama?: string | null;
  pelanggan_alamat?: string | null;
  pelanggan_telepon?: string | null;
  tanggal?: string;
  nomor_kendaraan?: string | null;
  pengirim_nama?: string | null;
  catatan?: string | null;
  dibuat_oleh?: string | null;
  items: Array<Omit<SuratJalanItem, "id" | "surat_jalan_id">>;
}

export interface UpdateSuratJalanStatusData {
  id: string;
  status: SuratJalanStatus;
  diterima_oleh?: string | null;
}

// ============================================================================
// HELPERS
// ============================================================================

function getTodayJakarta(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Generate next SJ number — format SJ-YYYYMMDD-NNN, daily reset.
 */
async function generateSJNumber(tanggal: string): Promise<string> {
  const datePart = tanggal.replace(/-/g, ""); // YYYYMMDD
  const prefix = `SJ-${datePart}-`;

  const supabase = getServerSupabaseClient();
  let lastNumber = "";
  if (supabase) {
    const { data } = await supabase
      .from("surat_jalan")
      .select("nomor_sj")
      .like("nomor_sj", `${prefix}%`)
      .order("nomor_sj", { ascending: false })
      .limit(1);
    if (data && data.length > 0) lastNumber = data[0].nomor_sj;
  } else {
    const res = await db.query<any>("surat_jalan", {
      orderBy: { column: "nomor_sj", ascending: false },
      limit: 1,
    });
    if (res.data && res.data.length > 0 && res.data[0].nomor_sj?.startsWith(prefix)) {
      lastNumber = res.data[0].nomor_sj;
    }
  }

  let nextSeq = 1;
  if (lastNumber) {
    const seqStr = lastNumber.slice(prefix.length);
    const seq = parseInt(seqStr, 10);
    if (!Number.isNaN(seq)) nextSeq = seq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * List surat jalan with enrichment. Uses Supabase batch fast-path when
 * available; falls back to per-row queries on Tauri/SQLite.
 */
export async function getSuratJalan(limit: number = 200): Promise<SuratJalan[]> {
  try {
    const supabase = getServerSupabaseClient();

    if (supabase) {
      const { data: sjs, error: sjErr } = await supabase
        .from("surat_jalan")
        .select("*")
        .order("dibuat_pada", { ascending: false })
        .limit(limit);
      if (sjErr) throw sjErr;
      if (!sjs || sjs.length === 0) return [];

      const sjIds = sjs.map((s: any) => s.id);
      const penjualanIds = [
        ...new Set(sjs.map((s: any) => s.penjualan_id).filter(Boolean)),
      ];
      const userIds = [
        ...new Set(sjs.map((s: any) => s.dibuat_oleh).filter(Boolean)),
      ];

      const [itemsRes, penjualanRes, usersRes] = await Promise.all([
        supabase.from("item_surat_jalan").select("*").in("surat_jalan_id", sjIds),
        penjualanIds.length > 0
          ? supabase.from("penjualan").select("id,nomor_invoice").in("id", penjualanIds)
          : Promise.resolve({ data: [], error: null }),
        userIds.length > 0
          ? supabase.from("profil").select("id,nama_lengkap,nama_pengguna").in("id", userIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (itemsRes.error) throw itemsRes.error;

      const itemsBySj = new Map<string, any[]>();
      for (const it of itemsRes.data || []) {
        const list = itemsBySj.get(it.surat_jalan_id) || [];
        list.push(it);
        itemsBySj.set(it.surat_jalan_id, list);
      }

      const penjualanMap = new Map<string, any>();
      for (const p of penjualanRes.data || []) penjualanMap.set(p.id, p);

      const userMap = new Map<string, any>();
      for (const u of usersRes.data || []) userMap.set(u.id, u);

      return sjs.map((sj: any) => {
        const items = (itemsBySj.get(sj.id) || []).sort(
          (a, b) => (a.urutan ?? 0) - (b.urutan ?? 0)
        );
        const penjualan = sj.penjualan_id ? penjualanMap.get(sj.penjualan_id) : null;
        const user = sj.dibuat_oleh ? userMap.get(sj.dibuat_oleh) : null;
        return {
          ...sj,
          items,
          nomor_invoice: penjualan?.nomor_invoice || null,
          dibuat_oleh_nama: user?.nama_lengkap || user?.nama_pengguna || null,
        } as SuratJalan;
      });
    }

    // SQLite fallback
    const sjsRes = await db.query<SuratJalan>("surat_jalan", {
      orderBy: { column: "dibuat_pada", ascending: false },
      limit,
    });
    const sjs = sjsRes.data || [];

    return await Promise.all(
      sjs.map(async (sj) => {
        const itemsRes = await db.query<SuratJalanItem>("item_surat_jalan", {
          where: { surat_jalan_id: sj.id },
        });
        const items = (itemsRes.data || []).sort(
          (a, b) => (a.urutan ?? 0) - (b.urutan ?? 0)
        );

        let nomor_invoice: string | null = null;
        if (sj.penjualan_id) {
          const p = await db.queryOne<{ nomor_invoice: string }>("penjualan", {
            where: { id: sj.penjualan_id },
          });
          nomor_invoice = p.data?.nomor_invoice || null;
        }
        let dibuat_oleh_nama: string | null = null;
        if (sj.dibuat_oleh) {
          const u = await db.queryOne<{ nama_lengkap?: string; nama_pengguna?: string }>(
            "profil",
            { where: { id: sj.dibuat_oleh } }
          );
          dibuat_oleh_nama = u.data?.nama_lengkap || u.data?.nama_pengguna || null;
        }

        return { ...sj, items, nomor_invoice, dibuat_oleh_nama };
      })
    );
  } catch (error) {
    console.error("Error fetching surat jalan:", error);
    throw error;
  }
}

export async function getSuratJalanById(id: string): Promise<SuratJalan | null> {
  try {
    const sjRes = await db.queryOne<SuratJalan>("surat_jalan", {
      where: { id },
    });
    if (!sjRes.data) return null;

    const itemsRes = await db.query<SuratJalanItem>("item_surat_jalan", {
      where: { surat_jalan_id: id },
    });
    const items = (itemsRes.data || []).sort(
      (a, b) => (a.urutan ?? 0) - (b.urutan ?? 0)
    );

    return { ...sjRes.data, items };
  } catch (error) {
    console.error("Error fetching surat jalan by id:", error);
    throw error;
  }
}

/**
 * Create a new surat jalan.
 */
export async function createSuratJalan(
  data: CreateSuratJalanData
): Promise<{ id: string; nomor_sj: string }> {
  if (!data.items || data.items.length === 0) {
    throw new Error("Surat jalan harus punya minimal satu item");
  }

  const sjId = generateId();
  const tanggal = data.tanggal || getTodayJakarta();
  const nomor_sj = await generateSJNumber(tanggal);

  const sjRow = {
    id: sjId,
    nomor_sj,
    penjualan_id: data.penjualan_id || null,
    pelanggan_nama: data.pelanggan_nama?.trim() || null,
    pelanggan_alamat: data.pelanggan_alamat?.trim() || null,
    pelanggan_telepon: data.pelanggan_telepon?.trim() || null,
    tanggal,
    nomor_kendaraan: data.nomor_kendaraan?.trim() || null,
    pengirim_nama: data.pengirim_nama?.trim() || null,
    status: "DRAFT" as SuratJalanStatus,
    catatan: data.catatan?.trim() || null,
    dibuat_oleh: data.dibuat_oleh || null,
  };

  const insertRes = await db.insert("surat_jalan", sjRow);
  if (insertRes.error) throw insertRes.error;

  // Insert items
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    const itemRow = {
      id: generateId(),
      surat_jalan_id: sjId,
      nama_barang: item.nama_barang.trim(),
      keterangan: item.keterangan?.trim() || null,
      ukuran: item.ukuran?.trim() || null,
      qty: Number(item.qty) || 0,
      satuan: item.satuan?.trim() || null,
      urutan: item.urutan ?? i,
    };
    const r = await db.insert("item_surat_jalan", itemRow);
    if (r.error) throw r.error;
  }

  return { id: sjId, nomor_sj };
}

/**
 * Update SJ status (DRAFT → TERKIRIM → DITERIMA, or to BATAL).
 */
export async function updateSuratJalanStatus(
  data: UpdateSuratJalanStatusData
): Promise<void> {
  const now = getCurrentTimestamp();
  const patch: Record<string, any> = {
    status: data.status,
    diperbarui_pada: now,
  };

  if (data.status === "TERKIRIM") {
    patch.tanggal_terkirim = now;
  } else if (data.status === "DITERIMA") {
    patch.tanggal_diterima = now;
    if (data.diterima_oleh !== undefined) {
      patch.diterima_oleh = data.diterima_oleh?.trim() || null;
    }
  }

  const r = await db.update("surat_jalan", data.id, patch);
  if (r.error) throw r.error;
}

/**
 * Update SJ header + replace items (only allowed when status=DRAFT).
 */
export async function updateSuratJalan(
  id: string,
  data: Partial<CreateSuratJalanData>
): Promise<void> {
  const existing = await db.queryOne<SuratJalan>("surat_jalan", { where: { id } });
  if (!existing.data) throw new Error("Surat jalan tidak ditemukan");
  if (existing.data.status !== "DRAFT") {
    throw new Error("Hanya surat jalan berstatus DRAFT yang bisa diedit");
  }

  const patch: Record<string, any> = {
    diperbarui_pada: getCurrentTimestamp(),
  };
  if (data.pelanggan_nama !== undefined)
    patch.pelanggan_nama = data.pelanggan_nama?.trim() || null;
  if (data.pelanggan_alamat !== undefined)
    patch.pelanggan_alamat = data.pelanggan_alamat?.trim() || null;
  if (data.pelanggan_telepon !== undefined)
    patch.pelanggan_telepon = data.pelanggan_telepon?.trim() || null;
  if (data.tanggal !== undefined) patch.tanggal = data.tanggal;
  if (data.nomor_kendaraan !== undefined)
    patch.nomor_kendaraan = data.nomor_kendaraan?.trim() || null;
  if (data.pengirim_nama !== undefined)
    patch.pengirim_nama = data.pengirim_nama?.trim() || null;
  if (data.catatan !== undefined)
    patch.catatan = data.catatan?.trim() || null;

  const upd = await db.update("surat_jalan", id, patch);
  if (upd.error) throw upd.error;

  // Replace items if provided
  if (data.items) {
    // Delete existing items for this SJ
    const supabase = getServerSupabaseClient();
    if (supabase) {
      const del = await supabase
        .from("item_surat_jalan")
        .delete()
        .eq("surat_jalan_id", id);
      if (del.error) throw del.error;
    } else {
      const existingItems = await db.query<SuratJalanItem>("item_surat_jalan", {
        where: { surat_jalan_id: id },
      });
      for (const ei of existingItems.data || []) {
        if (ei.id) await db.delete("item_surat_jalan", ei.id);
      }
    }

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const itemRow = {
        id: generateId(),
        surat_jalan_id: id,
        nama_barang: item.nama_barang.trim(),
        keterangan: item.keterangan?.trim() || null,
        ukuran: item.ukuran?.trim() || null,
        qty: Number(item.qty) || 0,
        satuan: item.satuan?.trim() || null,
        urutan: item.urutan ?? i,
      };
      const r = await db.insert("item_surat_jalan", itemRow);
      if (r.error) throw r.error;
    }
  }
}

/**
 * Delete a surat jalan (only if DRAFT).
 */
export async function deleteSuratJalan(id: string): Promise<void> {
  const existing = await db.queryOne<SuratJalan>("surat_jalan", { where: { id } });
  if (!existing.data) return;
  if (existing.data.status !== "DRAFT") {
    throw new Error("Hanya surat jalan berstatus DRAFT yang bisa dihapus");
  }

  // Items cascade-delete via FK on Supabase; on SQLite ON DELETE CASCADE handles it.
  const r = await db.delete("surat_jalan", id);
  if (r.error) throw r.error;
}

/**
 * Build SJ items pre-fill from a sale's items, plus the sale header info
 * (customer name, address, phone, invoice ref) so the SJ modal can be
 * pre-filled completely from a single call.
 */
export async function buildItemsFromSale(
  saleId: string
): Promise<{
  penjualan_id: string;
  nomor_invoice: string | null;
  pelanggan_nama: string | null;
  pelanggan_alamat: string | null;
  pelanggan_telepon: string | null;
  items: Array<Omit<SuratJalanItem, "id" | "surat_jalan_id">>;
}> {
  // Fetch sale header
  const saleRes = await db.queryOne<any>("penjualan", { where: { id: saleId } });
  if (!saleRes.data) {
    throw new Error("Penjualan tidak ditemukan");
  }
  const sale = saleRes.data;

  // Fetch customer info if linked
  let pelangganNama: string | null = sale.pelanggan_nama_snapshot ?? null;
  let pelangganAlamat: string | null = null;
  let pelangganTelepon: string | null = null;
  if (sale.pelanggan_id) {
    const cRes = await db.queryOne<any>("pelanggan", {
      where: { id: sale.pelanggan_id },
    });
    if (cRes.data) {
      pelangganNama = cRes.data.nama || pelangganNama;
      pelangganAlamat = cRes.data.alamat || null;
      pelangganTelepon = cRes.data.telepon || null;
    }
  }

  const itemsRes = await db.query<any>("item_penjualan", {
    where: { penjualan_id: saleId },
  });
  const items = itemsRes.data || [];

  // Fetch barang names for non-maklon items
  const barangIds = [
    ...new Set(
      items
        .filter((i: any) => i.tipe_item !== "MAKLON")
        .map((i: any) => i.barang_id)
        .filter(Boolean)
    ),
  ] as string[];
  const barangMap = new Map<string, string>();
  for (const bid of barangIds) {
    const b = await db.queryOne<{ nama: string }>("barang", {
      where: { id: bid },
      select: "nama",
    });
    if (b.data?.nama) barangMap.set(bid, b.data.nama);
  }

  const sjItems = items.map((it: any, idx: number) => {
    const isMaklon = it.tipe_item === "MAKLON";
    const namaBarang = isMaklon
      ? it.deskripsi_pekerjaan || "Item maklon"
      : barangMap.get(it.barang_id) || "—";
    const ukuran =
      it.panjang && it.lebar
        ? `${Number(it.panjang).toFixed(2)} × ${Number(it.lebar).toFixed(2)} m`
        : null;
    return {
      nama_barang: namaBarang,
      keterangan: null,
      ukuran,
      qty: Number(it.jumlah) || 0,
      satuan: it.nama_satuan || null,
      urutan: idx,
    };
  });

  return {
    penjualan_id: saleId,
    nomor_invoice: sale.nomor_invoice || null,
    pelanggan_nama: pelangganNama,
    pelanggan_alamat: pelangganAlamat,
    pelanggan_telepon: pelangganTelepon,
    items: sjItems,
  };
}
