/**
 * Persistence layer for AST cashbook formulas + partners.
 *
 * Talks directly to Supabase (when available) or the native SQLite
 * connection (in Tauri / standalone server). We bypass the generic
 * `db.insert/update/delete` helpers because those auto-inject Indonesian
 * timestamp columns that don't exist on these tables.
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
  db_column: string;
  ast: string | object;
  enabled: number | boolean;
  is_system: number | boolean;
  display_order: number;
  description: string | null;
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
  return {
    id: r.id,
    name: r.name,
    column: r.column_key,
    dbColumn: r.db_column,
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

export async function listFormulas(): Promise<FormulaDefinition[]> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { data, error } = await sb
      .from("cashbook_formula")
      .select("*")
      .order("display_order", { ascending: true });
    if (error) {
      console.warn("listFormulas Supabase:", error.message);
    } else if (data && data.length > 0) {
      return (data as FormulaRow[]).map(rowToFormula);
    } else {
      await seedDefaultsIfEmpty();
      const { data: seeded } = await sb
        .from("cashbook_formula")
        .select("*")
        .order("display_order", { ascending: true });
      if (seeded && seeded.length > 0) {
        return (seeded as FormulaRow[]).map(rowToFormula);
      }
    }
  }

  const sqliteRows = await withSqlite((sqlite) =>
    sqlite
      .prepare(
        "SELECT * FROM cashbook_formula ORDER BY display_order ASC"
      )
      .all() as FormulaRow[]
  );
  if (sqliteRows && sqliteRows.length > 0) {
    return sqliteRows.map(rowToFormula);
  }
  if (sqliteRows && sqliteRows.length === 0) {
    await seedDefaultsIfEmpty();
    const reread = await withSqlite((sqlite) =>
      sqlite
        .prepare("SELECT * FROM cashbook_formula ORDER BY display_order ASC")
        .all() as FormulaRow[]
    );
    if (reread && reread.length > 0) return reread.map(rowToFormula);
  }

  return cloneDefaults(DEFAULT_FORMULAS);
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
  const payload = {
    id,
    name: formula.name,
    column_key: formula.column,
    db_column: formula.dbColumn,
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
        });
    } else {
      sqlite
        .prepare(
          `INSERT INTO cashbook_formula
             (id, name, column_key, db_column, ast, enabled, is_system, display_order, description)
           VALUES
             (@id, @name, @column_key, @db_column, @ast, @enabled, @is_system, @display_order, @description)`
        )
        .run({
          ...payload,
          enabled: payload.enabled ? 1 : 0,
          is_system: payload.is_system ? 1 : 0,
        });
    }
  });

  return { ...formula, id } as FormulaDefinition;
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

export async function seedDefaultsIfEmpty(): Promise<{
  formulasInserted: number;
  partnersInserted: number;
}> {
  let formulasInserted = 0;
  let partnersInserted = 0;

  const sb = getServerSupabaseClient();
  if (sb) {
    const { count: fCount } = await sb
      .from("cashbook_formula")
      .select("*", { count: "exact", head: true });
    if ((fCount ?? 0) === 0) {
      const { error } = await sb.from("cashbook_formula").insert(
        DEFAULT_FORMULAS.map((f) => ({
          id: f.id,
          name: f.name,
          column_key: f.column,
          db_column: f.dbColumn,
          ast: f.ast,
          enabled: f.enabled,
          is_system: f.isSystem,
          display_order: f.displayOrder,
          description: f.description ?? null,
        }))
      );
      if (!error) formulasInserted = DEFAULT_FORMULAS.length;
    }
    const { count: pCount } = await sb
      .from("cashbook_partner")
      .select("*", { count: "exact", head: true });
    if ((pCount ?? 0) === 0) {
      const { error } = await sb.from("cashbook_partner").insert(
        DEFAULT_PARTNERS.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category ?? null,
          display_order: p.displayOrder,
        }))
      );
      if (!error) partnersInserted = DEFAULT_PARTNERS.length;
    }
    return { formulasInserted, partnersInserted };
  }

  await withSqlite((sqlite) => {
    const fCount = (
      sqlite
        .prepare("SELECT COUNT(*) AS c FROM cashbook_formula")
        .get() as { c: number }
    ).c;
    if (fCount === 0) {
      const stmt = sqlite.prepare(
        `INSERT OR IGNORE INTO cashbook_formula
           (id, name, column_key, db_column, ast, enabled, is_system, display_order, description)
         VALUES
           (@id, @name, @column_key, @db_column, @ast, @enabled, @is_system, @display_order, @description)`
      );
      const tx = sqlite.transaction((rows: typeof DEFAULT_FORMULAS) => {
        for (const f of rows) {
          stmt.run({
            id: f.id,
            name: f.name,
            column_key: f.column,
            db_column: f.dbColumn,
            ast: JSON.stringify(f.ast),
            enabled: f.enabled ? 1 : 0,
            is_system: f.isSystem ? 1 : 0,
            display_order: f.displayOrder,
            description: f.description ?? null,
          });
          formulasInserted += 1;
        }
      });
      tx(DEFAULT_FORMULAS);
    }

    const pCount = (
      sqlite
        .prepare("SELECT COUNT(*) AS c FROM cashbook_partner")
        .get() as { c: number }
    ).c;
    if (pCount === 0) {
      const stmt = sqlite.prepare(
        `INSERT OR IGNORE INTO cashbook_partner (id, name, category, display_order)
         VALUES (@id, @name, @category, @display_order)`
      );
      const tx = sqlite.transaction((rows: typeof DEFAULT_PARTNERS) => {
        for (const p of rows) {
          stmt.run({
            id: p.id,
            name: p.name,
            category: p.category ?? null,
            display_order: p.displayOrder,
          });
          partnersInserted += 1;
        }
      });
      tx(DEFAULT_PARTNERS);
    }
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
