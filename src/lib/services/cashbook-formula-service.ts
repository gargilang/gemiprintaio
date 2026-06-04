/**
 * Layer persistensi untuk formula AST buku kas + partner.
 *
 * Berkomunikasi langsung dengan Supabase (kalau tersedia) atau koneksi
 * SQLite native (di Tauri / standalone server). Kita melewati helper generik
 * `db.insert/update/delete` karena helper itu menyuntikkan kolom timestamp
 * Indonesia yang tidak ada di tabel-tabel ini.
 */

import "server-only";

import {
  db,
  generateId,
  getServerSupabaseClient,
} from "@/lib/db-unified";
import {
  DEFAULT_FORMULAS,
  DEFAULT_PARTNERS,
  cloneDefaults,
} from "@/lib/ast/defaults";
import type {
  ASTNode,
  FormulaDefinition,
  PartnerDefinition,
} from "@/lib/ast/types";

interface FormulaRow {
  id: string;
  name: string;
  column_key: string;
  db_column: string | null;
  ast: string | object;
  enabled: number | boolean;
  is_system: number | boolean;
  display_order: number;
  description: string | null;
  // New (v2) columns. Optional because the migration backfills them lazily.
  formula_key?: string | null;
  actor_id?: string | null;
  formula_group?: string | null;
  is_visible_in_summary?: number | boolean | null;
}

interface PartnerRow {
  id: string;
  name: string;
  category: string | null;
  display_order: number;
}

function parseAst(raw: FormulaRow["ast"]): ASTNode {
  if (typeof raw === "string") return JSON.parse(raw) as ASTNode;
  return raw as ASTNode;
}

function rowToFormula(r: FormulaRow): FormulaDefinition {
  const validGroups = new Set([
    "summary",
    "profit_share",
    "cash_advance",
    "bonus",
    "custom",
  ]);
  const group =
    r.formula_group && validGroups.has(r.formula_group)
      ? (r.formula_group as FormulaDefinition["formulaGroup"])
      : "custom";
  // Default visibility mengikuti migrasi SQL: grup driven-by-actor terlihat
  // by default, summary + custom disembunyikan sampai di-opt-in.
  const visibleDefault =
    group === "profit_share" || group === "cash_advance" || group === "bonus";
  return {
    id: r.id,
    name: r.name,
    column: r.column_key,
    dbColumn: r.db_column,
    formulaKey: r.formula_key ?? r.db_column ?? r.column_key,
    actorId: r.actor_id ?? null,
    formulaGroup: group,
    isVisibleInSummary:
      r.is_visible_in_summary === undefined ||
      r.is_visible_in_summary === null
        ? visibleDefault
        : r.is_visible_in_summary === true ||
          r.is_visible_in_summary === 1,
    ast: parseAst(r.ast),
    enabled: r.enabled === true || r.enabled === 1,
    isSystem: r.is_system === true || r.is_system === 1,
    displayOrder: Number(r.display_order ?? 0),
    description: r.description ?? null,
  };
}

function rowToPartner(r: PartnerRow): PartnerDefinition {
  return {
    id: r.id,
    name: r.name,
    category: r.category ?? null,
    displayOrder: Number(r.display_order ?? 0),
  };
}

async function withSqlite<T>(
  fn: (sqlite: import("better-sqlite3").Database) => T | Promise<T>
): Promise<T | null> {
  try {
    const sqlite = await db.getNativeSQLite();
    if (!sqlite) return null;
    return await fn(sqlite);
  } catch (e) {
    console.warn("cashbook-formula-service SQLite error:", e);
    return null;
  }
}

// ── Formulas ───────────────────────────────────────────────────────────────

/**
 * Ambil formula dari DB tanpa memicu seedDefaultsIfEmpty.
 * Pakai ini saat pemanggil sudah melakukan seeding (mis. route summary-v2)
 * to avoid redundant DB writes on every request.
 */
export async function listFormulasRaw(): Promise<FormulaDefinition[]> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("cashbook_formula")
      .select("*")
      .order("display_order", { ascending: true });
    if (error) {
      console.warn("listFormulas Supabase:", error.message);
    } else if (data) {
      return (data as FormulaRow[]).map(rowToFormula);
    }
  }

  const sqliteRows = await withSqlite((sqlite) =>
    sqlite
      .prepare(
        "SELECT * FROM cashbook_formula ORDER BY display_order ASC"
      )
      .all() as FormulaRow[]
  );
  if (sqliteRows) {
    return sqliteRows.map(rowToFormula);
  }

  return cloneDefaults(DEFAULT_FORMULAS);
}

export async function listFormulas(): Promise<FormulaDefinition[]> {
  // Pastikan formula sistem ada sebelum membaca. seedDefaultsIfEmpty
  // bersifat idempoten — hanya menulis kalau baris benar-benar belum ada.
  await seedDefaultsIfEmpty();
  return listFormulasRaw();
}

export async function listActiveFormulas(): Promise<FormulaDefinition[]> {
  const all = await listFormulas();
  return all.filter((f) => f.enabled);
}

export async function getFormula(
  id: string
): Promise<FormulaDefinition | null> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("cashbook_formula")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!error && data) return rowToFormula(data as FormulaRow);
  }
  const row = await withSqlite((sqlite) =>
    sqlite
      .prepare("SELECT * FROM cashbook_formula WHERE id = ?")
      .get(id) as FormulaRow | undefined
  );
  return row ? rowToFormula(row) : null;
}

export async function upsertFormula(
  formula: Omit<FormulaDefinition, "id"> & { id?: string }
): Promise<FormulaDefinition> {
  const id = formula.id ?? `formula-${generateId()}`;
  // Resolve key semantik — jatuh balik ke db_column legacy untuk jalur kode lama.
  const formulaKey = formula.formulaKey || formula.dbColumn;
  const formulaGroup = formula.formulaGroup ?? "custom";
  const visibleDefault =
    formulaGroup === "profit_share" ||
    formulaGroup === "cash_advance" ||
    formulaGroup === "bonus";
  const isVisibleInSummary =
    formula.isVisibleInSummary === undefined
      ? visibleDefault
      : formula.isVisibleInSummary;
  const payload = {
    id,
    name: formula.name,
    column_key: formula.column,
    db_column: formula.dbColumn,
    formula_key: formulaKey,
    actor_id: formula.actorId ?? null,
    formula_group: formulaGroup,
    is_visible_in_summary: isVisibleInSummary,
    ast: typeof formula.ast === "string" ? formula.ast : JSON.stringify(formula.ast),
    enabled: formula.enabled,
    is_system: formula.isSystem,
    display_order: formula.displayOrder,
    description: formula.description ?? null,
  };

  const sb = getServerSupabaseClient();
  if (sb) {
    const { error } = await sb.from("cashbook_formula").upsert(
      {
        ...payload,
        ast:
          typeof payload.ast === "string" ? JSON.parse(payload.ast) : payload.ast,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw error;
  }

  await withSqlite((sqlite) => {
    const existing = sqlite
      .prepare("SELECT id FROM cashbook_formula WHERE id = ?")
      .get(id);
    if (existing) {
      sqlite
        .prepare(
          `UPDATE cashbook_formula SET
             name = @name,
             column_key = @column_key,
             db_column = @db_column,
             formula_key = @formula_key,
             actor_id = @actor_id,
             formula_group = @formula_group,
             is_visible_in_summary = @is_visible_in_summary,
             ast = @ast,
             enabled = @enabled,
             is_system = @is_system,
             display_order = @display_order,
             description = @description,
             updated_at = datetime('now')
           WHERE id = @id`
        )
        .run({
          ...payload,
          enabled: payload.enabled ? 1 : 0,
          is_system: payload.is_system ? 1 : 0,
          is_visible_in_summary: payload.is_visible_in_summary ? 1 : 0,
        });
    } else {
      sqlite
        .prepare(
          `INSERT INTO cashbook_formula
             (id, name, column_key, db_column, formula_key, actor_id, formula_group, is_visible_in_summary, ast, enabled, is_system, display_order, description)
           VALUES
             (@id, @name, @column_key, @db_column, @formula_key, @actor_id, @formula_group, @is_visible_in_summary, @ast, @enabled, @is_system, @display_order, @description)`
        )
        .run({
          ...payload,
          enabled: payload.enabled ? 1 : 0,
          is_system: payload.is_system ? 1 : 0,
          is_visible_in_summary: payload.is_visible_in_summary ? 1 : 0,
        });
    }
  });

  return { ...formula, id, formulaKey, formulaGroup, isVisibleInSummary } as FormulaDefinition;
}

export async function deleteFormula(id: string): Promise<void> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { error } = await sb.from("cashbook_formula").delete().eq("id", id);
    if (error) throw error;
  }
  await withSqlite((sqlite) =>
    sqlite.prepare("DELETE FROM cashbook_formula WHERE id = ?").run(id)
  );
}

// ── Partners ───────────────────────────────────────────────────────────────

export async function listPartners(): Promise<PartnerDefinition[]> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("cashbook_partner")
      .select("*")
      .order("display_order", { ascending: true });
    if (!error && data && data.length > 0) {
      return (data as PartnerRow[]).map(rowToPartner);
    }
    if (!error) {
      await seedDefaultsIfEmpty();
      const { data: seeded } = await sb
        .from("cashbook_partner")
        .select("*")
        .order("display_order", { ascending: true });
      if (seeded && seeded.length > 0) {
        return (seeded as PartnerRow[]).map(rowToPartner);
      }
    }
  }

  const rows = await withSqlite((sqlite) =>
    sqlite
      .prepare("SELECT * FROM cashbook_partner ORDER BY display_order ASC")
      .all() as PartnerRow[]
  );
  if (rows && rows.length > 0) return rows.map(rowToPartner);
  if (rows && rows.length === 0) {
    await seedDefaultsIfEmpty();
    const reread = await withSqlite((sqlite) =>
      sqlite
        .prepare("SELECT * FROM cashbook_partner ORDER BY display_order ASC")
        .all() as PartnerRow[]
    );
    if (reread && reread.length > 0) return reread.map(rowToPartner);
  }

  return cloneDefaults(DEFAULT_PARTNERS);
}

export async function upsertPartner(
  partner: Omit<PartnerDefinition, "id"> & { id?: string }
): Promise<PartnerDefinition> {
  const id =
    partner.id ??
    `partner-${partner.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")}-${Date.now()}`;
  const payload = {
    id,
    name: partner.name,
    category: partner.category ?? null,
    display_order: partner.displayOrder,
  };

  const sb = getServerSupabaseClient();
  if (sb) {
    const { error } = await sb.from("cashbook_partner").upsert(
      { ...payload, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
    if (error) throw error;
  }
  await withSqlite((sqlite) => {
    const existing = sqlite
      .prepare("SELECT id FROM cashbook_partner WHERE id = ?")
      .get(id);
    if (existing) {
      sqlite
        .prepare(
          `UPDATE cashbook_partner SET
             name = @name,
             category = @category,
             display_order = @display_order,
             updated_at = datetime('now')
           WHERE id = @id`
        )
        .run(payload);
    } else {
      sqlite
        .prepare(
          `INSERT INTO cashbook_partner (id, name, category, display_order)
           VALUES (@id, @name, @category, @display_order)`
        )
        .run(payload);
    }
  });

  return { ...partner, id } as PartnerDefinition;
}

export async function deletePartner(id: string): Promise<void> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { error } = await sb.from("cashbook_partner").delete().eq("id", id);
    if (error) throw error;
  }
  await withSqlite((sqlite) =>
    sqlite.prepare("DELETE FROM cashbook_partner WHERE id = ?").run(id)
  );
}

// ── Seeding ────────────────────────────────────────────────────────────────

/**
 * Pastikan 5 formula sistem default ada. Idempoten — aman dipanggil di setiap
 * list / formula write. Memakai semantik upsert supaya instalasi yang
 * kehilangan formula sistem (karena cleanup yang bermasalah, penghapusan
 * manual, dll) bisa dipulihkan di pemanggilan API berikutnya.
 *
 * Formula per-actor (kasbon, bagi hasil, bonus) TIDAK di-seed di sini —
 * itu di-generate dinamis lewat `syncFormulasForActor` dari tab Pengurus.
 */
export async function seedDefaultsIfEmpty(): Promise<{
  formulasInserted: number;
  partnersInserted: number;
}> {
  let formulasInserted = 0;
  const partnersInserted = 0;

  const sb = getServerSupabaseClient();
  if (sb) {
    // Cari formula sistem mana yang hilang dan hanya insert yang itu.
    const ids = DEFAULT_FORMULAS.map((f) => f.id);
    const { data: existing } = await sb
      .from("cashbook_formula")
      .select("id")
      .in("id", ids);
    const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));
    // Upsert semua formula sistem supaya perubahan AST di defaults.ts menyebar
    // ke instalasi yang sudah ada tanpa perlu migrasi DB manual.
    const { error } = await sb.from("cashbook_formula").upsert(
      DEFAULT_FORMULAS.map((f) => ({
        id: f.id,
        name: f.name,
        column_key: f.column,
        db_column: f.dbColumn,
        formula_key: f.formulaKey ?? f.dbColumn,
        actor_id: f.actorId ?? null,
        formula_group: f.formulaGroup ?? "custom",
        is_visible_in_summary:
          f.isVisibleInSummary ??
          (f.formulaGroup === "profit_share" ||
            f.formulaGroup === "cash_advance" ||
            f.formulaGroup === "bonus"),
        ast: f.ast,
        enabled: f.enabled,
        is_system: f.isSystem,
        display_order: f.displayOrder,
        description: f.description ?? null,
      })),
      { onConflict: "id" }
    );
    if (!error) formulasInserted = DEFAULT_FORMULAS.length;
    return { formulasInserted, partnersInserted };
  }

  // SQLite path — same logic, plain SQL.
  await withSqlite((sqlite) => {
    const stmt = sqlite.prepare(
      `INSERT OR REPLACE INTO cashbook_formula
         (id, name, column_key, db_column, formula_key, actor_id, formula_group,
          is_visible_in_summary, ast, enabled, is_system, display_order, description)
       VALUES
         (@id, @name, @column_key, @db_column, @formula_key, @actor_id, @formula_group,
          @is_visible_in_summary, @ast, @enabled, @is_system, @display_order, @description)`
    );
    const tx = sqlite.transaction((rows: typeof DEFAULT_FORMULAS) => {
      for (const f of rows) {
        const result = stmt.run({
          id: f.id,
          name: f.name,
          column_key: f.column,
          db_column: f.dbColumn,
          formula_key: f.formulaKey ?? f.dbColumn,
          actor_id: f.actorId ?? null,
          formula_group: f.formulaGroup ?? "custom",
          is_visible_in_summary:
            (f.isVisibleInSummary ??
              (f.formulaGroup === "profit_share" ||
                f.formulaGroup === "cash_advance" ||
                f.formulaGroup === "bonus"))
              ? 1
              : 0,
          ast: JSON.stringify(f.ast),
          enabled: f.enabled ? 1 : 0,
          is_system: f.isSystem ? 1 : 0,
          display_order: f.displayOrder,
          description: f.description ?? null,
        });
        if (result.changes > 0) formulasInserted += 1;
      }
    });
    tx(DEFAULT_FORMULAS);
  });

  return { formulasInserted, partnersInserted };
}

export async function resetFormulasToDefaults(): Promise<void> {
  const sb = getServerSupabaseClient();
  if (sb) {
    await sb.from("cashbook_formula").delete().neq("id", "");
    await sb.from("cashbook_partner").delete().neq("id", "");
  }
  await withSqlite((sqlite) => {
    sqlite.exec(
      "DELETE FROM cashbook_formula; DELETE FROM cashbook_partner;"
    );
  });
  await seedDefaultsIfEmpty();
}
