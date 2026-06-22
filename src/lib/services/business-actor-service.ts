/**
 * business-actor-service
 *
 * CRUD untuk tabel orang/peran yang generik (tanpa nama hardcoded):
 *   • peran_pegawai      — katalog jabatan (Pemilik, Manajer, Sales, …)
 *   • pegawai  — setiap orang / entitas nyata yang muncul di keuangan
 *
 * Peran hanya label tampilan. Tipe formula yang diterima actor (bagi hasil,
 * kasbon, bonus) ditentukan independen oleh field calc mana yang non-null
 * di baris actor — kombinasi apa pun valid.
 */

import "server-only";

import {
  db,
  generateId,
  getCurrentTimestamp,
  getServerSupabaseClient,
} from "@/lib/db-unified";

/** Kategori tampilan untuk mengelompokkan jabatan di UI — bukan tipe formula. */
export type RoleGroup = "owner" | "management" | "sales" | "staff" | "other";

export interface ActorRole {
  id: string;
  role_code: string;
  role_label: string;
  /** Kategori tampilan (owner / management / sales / staff / other). */
  role_group: RoleGroup;
  description: string | null;
  display_order: number;
}

export interface BusinessActor {
  id: string;
  display_name: string;
  role_code: string;
  is_active: number;
  display_order: number;
  notes: string | null;
  /** Non-null → menghasilkan formula "bagi_hasil_<slug>". */
  profit_share_percent: number | null;
  /** Non-empty → menghasilkan formula "kasbon_<slug>". */
  cash_advance_categories: string[] | null;
  /** Persempit kasbon ke baris yang `keperluan`-nya mengandung substring ini. */
  keperluan_keyword: string | null;
  /** Non-null → menghasilkan formula "bonus_<slug>". */
  bonus_percent: number | null;
  /** Key formula yang dijadikan dasar bonus_percent (default "omzet"). */
  bonus_source_formula_key: string | null;
  /** Timestamp ISO. */
  created_at: string;
  /** Timestamp ISO. */
  updated_at: string;
}

export type BusinessActorInput = Omit<
  BusinessActor,
  "id" | "is_active" | "display_order" | "created_at" | "updated_at"
> & {
  is_active?: number;
  display_order?: number;
};

interface RawPegawaiRow {
  id: string;
  display_name: string;
  role_code: string;
  is_active: number;
  display_order: number;
  notes: string | null;
  profit_share_percent: number | null;
  cash_advance_categories: unknown;
  keperluan_keyword: string | null;
  bonus_percent: number | null;
  bonus_source_formula_key: string | null;
  created_at: string;
  updated_at: string;
}

function parseCategoriesField(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s)).filter(Boolean);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed))
        return parsed.map((s) => String(s)).filter(Boolean);
    } catch {
      // Anggap sebagai string yang dipisah koma.
      return trimmed
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return null;
}

function normalizeActorRow(raw: RawPegawaiRow): BusinessActor {
  return {
    id: raw.id,
    display_name: raw.display_name,
    role_code: raw.role_code,
    is_active: Number(raw.is_active ?? 1),
    display_order: Number(raw.display_order ?? 0),
    notes: raw.notes ?? null,
    profit_share_percent:
      raw.profit_share_percent === null ||
      raw.profit_share_percent === undefined
        ? null
        : Number(raw.profit_share_percent),
    cash_advance_categories: parseCategoriesField(raw.cash_advance_categories),
    keperluan_keyword: raw.keperluan_keyword ?? null,
    bonus_percent:
      raw.bonus_percent === null || raw.bonus_percent === undefined
        ? null
        : Number(raw.bonus_percent),
    bonus_source_formula_key: raw.bonus_source_formula_key ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

// ── peran_pegawai ─────────────────────────────────────────────────────────────

export async function listActorRoles(): Promise<ActorRole[]> {
  const result = await db.query<ActorRole>("peran_pegawai", {
    orderBy: { column: "display_order", ascending: true },
  });
  if (result.error || !result.data) return [];
  return result.data.map((r) => ({
    id: r.id,
    role_code: r.role_code,
    role_label: r.role_label,
    role_group: (r.role_group as RoleGroup) || "other",
    description: r.description ?? null,
    display_order: Number(r.display_order ?? 0),
  }));
}

export async function getActorRoleByCode(
  roleCode: string,
): Promise<ActorRole | null> {
  const result = await db.queryOne<ActorRole>("peran_pegawai", {
    where: { role_code: roleCode },
  });
  if (result.error || !result.data) return null;
  return {
    id: result.data.id,
    role_code: result.data.role_code,
    role_label: result.data.role_label,
    role_group: (result.data.role_group as RoleGroup) || "other",
    description: result.data.description ?? null,
    display_order: Number(result.data.display_order ?? 0),
  };
}

export async function createActorRole(input: {
  role_code: string;
  role_label: string;
  role_group: RoleGroup;
  description?: string | null;
}): Promise<{ id: string; error: Error | null }> {
  const id = `role-${input.role_code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const code = input.role_code.toUpperCase().trim();
  if (!code) {
    return { id: "", error: new Error("Kode peran wajib diisi") };
  }
  const existing = await getActorRoleByCode(code);
  if (existing) {
    return { id: existing.id, error: new Error("Kode peran sudah dipakai") };
  }
  const nextOrder = await nextRoleDisplayOrder();
  const res = await db.insert("peran_pegawai", {
    id,
    role_code: code,
    role_label: input.role_label.trim() || code,
    role_group: input.role_group,
    description: input.description?.trim() || null,
    display_order: nextOrder,
  });
  return { id, error: res.error };
}

async function nextRoleDisplayOrder(): Promise<number> {
  const rows = await db.queryRaw<{ m: number }>(
    "SELECT COALESCE(MAX(display_order), 0) AS m FROM peran_pegawai",
  );
  return (rows[0]?.m ?? 0) + 10;
}

// ── pegawai ─────────────────────────────────────────────────────────

export async function listBusinessActors(
  opts: {
    includeInactive?: boolean;
  } = {},
): Promise<BusinessActor[]> {
  const where: Record<string, unknown> = {};
  if (!opts.includeInactive) where.is_active = 1;
  const result = await db.query<RawPegawaiRow>("pegawai", {
    where,
    orderBy: { column: "display_order", ascending: true },
  });
  if (result.error || !result.data) return [];
  return result.data.map(normalizeActorRow);
}

export async function getBusinessActor(
  id: string,
): Promise<BusinessActor | null> {
  const result = await db.queryOne<RawPegawaiRow>("pegawai", {
    where: { id },
  });
  if (result.error || !result.data) return null;
  return normalizeActorRow(result.data);
}

async function nextActorDisplayOrder(): Promise<number> {
  const rows = await db.queryRaw<{ m: number }>(
    "SELECT COALESCE(MAX(display_order), 0) AS m FROM pegawai",
  );
  return (rows[0]?.m ?? 0) + 10;
}

function serializeCategories(cats: string[] | null | undefined): string | null {
  if (!cats || cats.length === 0) return null;
  return JSON.stringify(
    cats.map((c) => c.toUpperCase().trim()).filter(Boolean),
  );
}

// slugifyActorName diekstrak ke src/lib/slug-utils.ts (pure util, aman untuk komponen klien).
import { slugifyActorName } from "@/lib/slug-utils";
export { slugifyActorName } from "@/lib/slug-utils";

export async function createBusinessActor(
  input: BusinessActorInput,
): Promise<{ data: BusinessActor | null; error: Error | null }> {
  const name = input.display_name.trim();
  if (!name) {
    return { data: null, error: new Error("Nama orang wajib diisi") };
  }
  const id = `actor-${slugifyActorName(name)}-${Date.now().toString(36)}`;
  const order = input.display_order ?? (await nextActorDisplayOrder());
  const now = getCurrentTimestamp();

  const payload = {
    id,
    display_name: name,
    role_code: input.role_code,
    is_active: input.is_active ?? 1,
    display_order: order,
    notes: input.notes?.trim() || null,
    profit_share_percent:
      input.profit_share_percent !== null &&
      input.profit_share_percent !== undefined
        ? Number(input.profit_share_percent)
        : null,
    cash_advance_categories: serializeCategories(
      input.cash_advance_categories ?? null,
    ),
    keperluan_keyword: input.keperluan_keyword?.trim() || null,
    bonus_percent:
      input.bonus_percent !== null && input.bonus_percent !== undefined
        ? Number(input.bonus_percent)
        : null,
    bonus_source_formula_key: input.bonus_source_formula_key?.trim() || null,
    created_at: now,
    updated_at: now,
  };

  const sb = getServerSupabaseClient();
  if (sb) {
    // Supabase butuh array JSONB, bukan string yang sudah di-serialisasi.
    const supaPayload = {
      ...payload,
      cash_advance_categories: input.cash_advance_categories ?? null,
    };
    const { error } = await sb.from("pegawai").insert(supaPayload);
    if (error && !error.message.includes("does not exist")) {
      return { data: null, error: new Error(error.message) };
    }
  }

  const localRes = await db.insert("pegawai", payload);
  if (localRes.error) return { data: null, error: localRes.error };

  const created = await getBusinessActor(id);
  return { data: created, error: null };
}

export async function updateBusinessActor(
  id: string,
  patch: Partial<BusinessActorInput>,
): Promise<{ data: BusinessActor | null; error: Error | null }> {
  const fields: Record<string, unknown> = {
    updated_at: getCurrentTimestamp(),
  };
  if (patch.display_name !== undefined)
    fields.display_name = patch.display_name.trim();
  if (patch.role_code !== undefined) fields.role_code = patch.role_code;
  if (patch.notes !== undefined) fields.notes = patch.notes?.trim() || null;
  if (patch.is_active !== undefined) fields.is_active = patch.is_active;
  if (patch.display_order !== undefined)
    fields.display_order = patch.display_order;
  if (patch.profit_share_percent !== undefined) {
    fields.profit_share_percent =
      patch.profit_share_percent === null
        ? null
        : Number(patch.profit_share_percent);
  }
  if (patch.cash_advance_categories !== undefined) {
    fields.cash_advance_categories = serializeCategories(
      patch.cash_advance_categories ?? null,
    );
  }
  if (patch.keperluan_keyword !== undefined) {
    fields.keperluan_keyword = patch.keperluan_keyword?.trim() || null;
  }
  if (patch.bonus_percent !== undefined) {
    fields.bonus_percent =
      patch.bonus_percent === null ? null : Number(patch.bonus_percent);
  }
  if (patch.bonus_source_formula_key !== undefined) {
    fields.bonus_source_formula_key =
      patch.bonus_source_formula_key?.trim() || null;
  }

  const sb = getServerSupabaseClient();
  if (sb) {
    const supaFields = { ...fields };
    // Supabase butuh array JSONB, bukan string yang sudah di-serialisasi.
    if (patch.cash_advance_categories !== undefined) {
      supaFields.cash_advance_categories =
        patch.cash_advance_categories ?? null;
    }
    const { error } = await sb.from("pegawai").update(supaFields).eq("id", id);
    if (error && !error.message.includes("does not exist")) {
      return { data: null, error: new Error(error.message) };
    }
  }

  const localRes = await db.update("pegawai", id, fields);
  if (localRes.error) return { data: null, error: localRes.error };

  const updated = await getBusinessActor(id);
  return { data: updated, error: null };
}

/**
 * Soft delete (nonaktifkan): mempertahankan semua nilai computed historis.
 * Hard delete hanya boleh saat tidak ada baris transaksi_terhitung yang merujuk
 * ke actor ini.
 * any formula owned by this actor.
 */
export async function deactivateBusinessActor(
  id: string,
): Promise<{ error: Error | null }> {
  const res = await updateBusinessActor(id, { is_active: 0 });
  if (res.error) return { error: res.error };
  return { error: null };
}

export async function reactivateBusinessActor(
  id: string,
): Promise<{ error: Error | null }> {
  const res = await updateBusinessActor(id, { is_active: 1 });
  if (res.error) return { error: res.error };
  return { error: null };
}

/**
 * Hapus permanen. Menolak kalau ada nilai computed historis supaya tidak
 * pernah diam-diam kehilangan data audit.
 */
export async function deleteBusinessActor(
  id: string,
): Promise<{ error: Error | null }> {
  // Cari key formula yang tertaut.
  let linkedKeys: string[] = [];
  try {
    const rows = await db.queryRaw<{ formula_key: string }>(
      "SELECT DISTINCT formula_key FROM rumus_buku_kas WHERE actor_id = ?",
      [id],
    );
    linkedKeys = rows.map((r) => r.formula_key).filter(Boolean);
  } catch {
    // Instalasi lama tanpa kolom actor_id — anggap tidak ada baris terkait.
  }

  if (linkedKeys.length > 0) {
    const placeholders = linkedKeys.map(() => "?").join(",");
    try {
      const hits = await db.queryRaw<{ c: number }>(
        `SELECT COUNT(*) AS c FROM transaksi_terhitung WHERE formula_key IN (${placeholders})`,
        linkedKeys,
      );
      if ((hits[0]?.c ?? 0) > 0) {
        return {
          error: new Error(
            "Orang ini sudah punya catatan transaksi tersimpan. Pakai tombol Nonaktifkan untuk menyembunyikan tanpa kehilangan data.",
          ),
        };
      }
    } catch {
      // transaksi_terhitung missing — proceed with delete.
    }
  }

  // Hapus formula tertaut dulu supaya constraint FK tidak memblokir.
  try {
    const sb = getServerSupabaseClient();
    if (sb) {
      await sb.from("rumus_buku_kas").delete().eq("actor_id", id);
    }
    await db.executeRaw("DELETE FROM rumus_buku_kas WHERE actor_id = ?", [id]);
  } catch {
    // Best-effort; akan tertangkap di delete actor di bawah kalau benar-benar gagal.
  }

  const sb = getServerSupabaseClient();
  if (sb) {
    const { error } = await sb.from("pegawai").delete().eq("id", id);
    if (error && !error.message.includes("does not exist")) {
      return { error: new Error(error.message) };
    }
  }
  const res = await db.delete("pegawai", id);
  return { error: res.error };
}
