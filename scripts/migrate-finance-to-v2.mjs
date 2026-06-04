/**
 * migrate-finance-to-v2.mjs
 *
 * Migrasi data non-destruktif: seed business_actors dari finance_participants
 * legacy, taut cashbook_formula.actor_id, dan isi ulang transaction_computed
 * dari kolom hardcoded legacy di keuangan.
 *
 * Jalankan terhadap SQLite lokal:
 *   node scripts/migrate-finance-to-v2.mjs
 *
 * Jalankan terhadap Supabase (butuh DATABASE_URL atau DIRECT_URL di .env.local):
 *   node --env-file=.env.local scripts/migrate-finance-to-v2.mjs --supabase
 *
 * Flag:
 *   --dry-run   Cetak apa yang akan terjadi tanpa menulis apa pun
 *   --supabase  Terapkan ke Supabase juga (selain SQLite)
 *   --verbose   Logging tambahan
 */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const DRY_RUN = process.argv.includes("--dry-run");
const APPLY_SUPABASE = process.argv.includes("--supabase");
const VERBOSE = process.argv.includes("--verbose");

const log = (...a) => console.log(...a);
const verbose = (...a) => { if (VERBOSE) console.log("  [v]", ...a); };
const warn = (...a) => console.warn("  ⚠", ...a);

if (DRY_RUN) log("🔍 DRY RUN — nothing will be written.");

// ── SQLite ───────────────────────────────────────────────────────────────────

const sqlitePath = join(root, "database", "gemiprint.db");
if (!existsSync(sqlitePath)) {
  warn("SQLite database not found at", sqlitePath);
  warn("Running in Supabase-only mode (requires --supabase and DATABASE_URL).");
  if (!APPLY_SUPABASE) {
    console.error("No database target. Pass --supabase or ensure database/gemiprint.db exists.");
    process.exit(1);
  }
}

let sqliteDb = null;
if (existsSync(sqlitePath)) {
  const { default: Database } = await import("better-sqlite3");
  sqliteDb = new Database(sqlitePath);
  sqliteDb.pragma("foreign_keys = ON");
  log("✅ Opened SQLite:", sqlitePath);
}

// ── Supabase (optional) ───────────────────────────────────────────────────────

let pgClient = null;
if (APPLY_SUPABASE) {
  const connStr = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connStr) {
    console.error("--supabase requires DATABASE_URL or DIRECT_URL in environment.");
    process.exit(1);
  }
  const { default: pg } = await import("pg");
  pgClient = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await pgClient.connect();
  log("✅ Connected to Supabase Postgres");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

function slugify(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || `actor_${Date.now().toString(36)}`;
}

/** Map legacy role_type to actor_roles.role_code */
function roleCodeForType(roleType) {
  switch (roleType) {
    case "profit_share": return "PEMILIK";
    case "cash_advance": return "KARYAWAN";
    default: return "LAINNYA";
  }
}

// ── Legacy column → formula_key mapping ──────────────────────────────────────

const LEGACY_COMPUTED_COLUMNS = [
  "omzet",
  "biaya_operasional",
  "biaya_bahan",
  "saldo",
  "laba_bersih",
  "kasbon_anwar",
  "kasbon_suri",
  "kasbon_cahaya",
  "kasbon_dinil",
  "bagi_hasil_anwar",
  "bagi_hasil_suri",
  "bagi_hasil_gemi",
];

const LEGACY_OVERRIDE_COLUMNS = [
  "override_omzet",
  "override_biaya_operasional",
  "override_biaya_bahan",
  "override_saldo",
  "override_laba_bersih",
  "override_kasbon_anwar",
  "override_kasbon_suri",
  "override_kasbon_cahaya",
  "override_kasbon_dinil",
  "override_bagi_hasil_anwar",
  "override_bagi_hasil_suri",
  "override_bagi_hasil_gemi",
];

// ════════════════════════════════════════════════════════════════════════════
// STEP 1 — Seed business_actors from finance_participants
// ════════════════════════════════════════════════════════════════════════════

async function step1_seedBusinessActors() {
  log("\n── Step 1: Seed business_actors from finance_participants ──");

  let participants = [];

  if (sqliteDb) {
    try {
      participants = sqliteDb.prepare("SELECT * FROM finance_participants ORDER BY display_order").all();
      verbose("SQLite finance_participants:", participants.length, "rows");
    } catch (e) {
      warn("finance_participants table not found in SQLite:", e.message);
    }
  } else if (pgClient) {
    try {
      const { rows } = await pgClient.query("SELECT * FROM finance_participants ORDER BY display_order");
      participants = rows;
      verbose("Supabase finance_participants:", participants.length, "rows");
    } catch (e) {
      warn("finance_participants table not found in Supabase:", e.message);
    }
  }

  if (participants.length === 0) {
    log("  No finance_participants found — skipping actor seed.");
    return [];
  }

  const created = [];

  for (const p of participants) {
    const slug = slugify(p.display_name);
    const actorId = `actor-${slug}-migrated`;
    const roleCode = roleCodeForType(p.role_type);
    const ts = now();

    const actorPayload = {
      id: actorId,
      display_name: p.display_name,
      role_code: roleCode,
      is_active: p.is_active ?? 1,
      display_order: p.display_order ?? 0,
      notes: `Migrated from finance_participants (${p.participant_code})`,
      profit_share_percent: p.role_type === "profit_share" ? null : null, // will be updated manually
      cash_advance_categories: null,
      keperluan_keyword: null,
      bonus_percent: null,
      bonus_source_formula_key: null,
      created_at: p.created_at || ts,
      updated_at: ts,
    };

    if (DRY_RUN) {
      log(`  [dry-run] Would create business_actor: ${actorId} (${p.display_name}, ${roleCode})`);
    } else {
      if (sqliteDb) {
        try {
          sqliteDb.prepare(`
            INSERT OR IGNORE INTO business_actors
              (id, display_name, role_code, is_active, display_order, notes,
               profit_share_percent, cash_advance_categories, keperluan_keyword,
               bonus_percent, bonus_source_formula_key, created_at, updated_at)
            VALUES
              (@id, @display_name, @role_code, @is_active, @display_order, @notes,
               @profit_share_percent, @cash_advance_categories, @keperluan_keyword,
               @bonus_percent, @bonus_source_formula_key, @created_at, @updated_at)
          `).run(actorPayload);
          verbose("SQLite: upserted actor", actorId);
        } catch (e) {
          warn("SQLite insert business_actor failed:", e.message);
        }
      }

      if (pgClient) {
        try {
          await pgClient.query(`
            INSERT INTO business_actors
              (id, display_name, role_code, is_active, display_order, notes,
               profit_share_percent, cash_advance_categories, keperluan_keyword,
               bonus_percent, bonus_source_formula_key, created_at, updated_at)
            VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO NOTHING
          `, [
            actorPayload.id, actorPayload.display_name, actorPayload.role_code,
            actorPayload.is_active, actorPayload.display_order, actorPayload.notes,
            null, null, null, null, null,
            actorPayload.created_at, actorPayload.updated_at,
          ]);
          verbose("Supabase: upserted actor", actorId);
        } catch (e) {
          warn("Supabase insert business_actor failed:", e.message);
        }
      }
    }

    log(`  ✓ Actor: ${p.display_name} → ${actorId} (${roleCode})`);
    created.push({ ...actorPayload, slug });
  }

  return created;
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 2 — Link cashbook_formula.actor_id by matching formula_key suffix
// ════════════════════════════════════════════════════════════════════════════

async function step2_linkFormulaActors(migratedActors) {
  log("\n── Step 2: Link cashbook_formula.actor_id ──");

  let formulas = [];
  if (sqliteDb) {
    try {
      formulas = sqliteDb.prepare(`
        SELECT id, name, formula_key, db_column, actor_id, formula_group
        FROM cashbook_formula
        WHERE actor_id IS NULL
          AND formula_group IN ('profit_share', 'cash_advance', 'bonus')
      `).all();
    } catch (e) {
      warn("cashbook_formula query failed:", e.message);
      return;
    }
  } else if (pgClient) {
    try {
      const { rows } = await pgClient.query(`
        SELECT id, name, formula_key, db_column, actor_id, formula_group
        FROM cashbook_formula
        WHERE actor_id IS NULL
          AND formula_group IN ('profit_share', 'cash_advance', 'bonus')
      `);
      formulas = rows;
    } catch (e) {
      warn("cashbook_formula query failed:", e.message);
      return;
    }
  }

  if (formulas.length === 0) {
    log("  No unlinked actor formulas found.");
    return;
  }

  // Build a lookup: slug → actorId from migrated actors + anything already in DB.
  let allActors = [...migratedActors];
  if (sqliteDb) {
    try {
      const existing = sqliteDb.prepare("SELECT id, display_name FROM business_actors").all();
      for (const a of existing) {
        if (!allActors.some(x => x.id === a.id)) {
          allActors.push({ ...a, slug: slugify(a.display_name) });
        }
      }
    } catch {}
  }

  const slugToActorId = new Map(allActors.map(a => [a.slug, a.id]));

  let linked = 0;
  for (const f of formulas) {
    const key = f.formula_key || f.db_column || "";
    // Extract actor slug from formula_key, e.g. "bagi_hasil_suri" → "suri"
    let actorSlug = null;
    if (key.startsWith("bagi_hasil_")) actorSlug = key.replace("bagi_hasil_", "");
    else if (key.startsWith("kasbon_")) actorSlug = key.replace("kasbon_", "");
    else if (key.startsWith("bonus_")) actorSlug = key.replace("bonus_", "");

    if (!actorSlug) continue;
    const actorId = slugToActorId.get(actorSlug);
    if (!actorId) {
      verbose(`No actor found for slug "${actorSlug}" (formula ${key})`);
      continue;
    }

    if (DRY_RUN) {
      log(`  [dry-run] Would link formula ${f.id} (${key}) → actor ${actorId}`);
    } else {
      if (sqliteDb) {
        try {
          sqliteDb.prepare(
            "UPDATE cashbook_formula SET actor_id = ? WHERE id = ? AND actor_id IS NULL"
          ).run(actorId, f.id);
        } catch (e) {
          warn("SQLite link formula failed:", e.message);
        }
      }
      if (pgClient) {
        try {
          await pgClient.query(
            "UPDATE cashbook_formula SET actor_id = $1 WHERE id = $2 AND actor_id IS NULL",
            [actorId, f.id]
          );
        } catch (e) {
          warn("Supabase link formula failed:", e.message);
        }
      }
    }

    log(`  ✓ Formula ${key} → actor ${actorId}`);
    linked++;
  }

  log(`  Linked ${linked} formula(s).`);
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 3 — Backfill transaction_computed from legacy keuangan columns
// ════════════════════════════════════════════════════════════════════════════

async function step3_backfillTransactionComputed() {
  log("\n── Step 3: Backfill transaction_computed from keuangan legacy columns ──");

  // Detect which legacy columns actually exist in the table.
  let existingColumns = [];
  if (sqliteDb) {
    try {
      const cols = sqliteDb.prepare("PRAGMA table_info(keuangan)").all();
      existingColumns = cols.map(c => c.name);
    } catch (e) {
      warn("Could not inspect keuangan schema:", e.message);
      return;
    }
  } else if (pgClient) {
    try {
      const { rows } = await pgClient.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'keuangan' AND table_schema = 'public'
      `);
      existingColumns = rows.map(r => r.column_name);
    } catch (e) {
      warn("Could not inspect keuangan schema:", e.message);
      return;
    }
  }

  const columnsToMigrate = LEGACY_COMPUTED_COLUMNS.filter(c => existingColumns.includes(c));
  const overridesToMigrate = LEGACY_OVERRIDE_COLUMNS.filter(c => existingColumns.includes(c));

  verbose("Columns to backfill:", columnsToMigrate);

  if (columnsToMigrate.length === 0) {
    log("  No legacy computed columns found in keuangan — already migrated or clean install.");
    return;
  }

  // Count existing transaction_computed rows to detect if already backfilled.
  let existingCount = 0;
  if (sqliteDb) {
    try {
      existingCount = sqliteDb.prepare("SELECT COUNT(*) AS c FROM transaction_computed").get()?.c ?? 0;
    } catch {}
  } else if (pgClient) {
    try {
      const { rows } = await pgClient.query("SELECT COUNT(*) AS c FROM transaction_computed");
      existingCount = parseInt(rows[0]?.c ?? 0, 10);
    } catch {}
  }

  if (existingCount > 0) {
    log(`  transaction_computed already has ${existingCount} rows.`);
    log("  Will INSERT OR IGNORE to add only missing rows (idempotent).");
  }

  if (DRY_RUN) {
    log(`  [dry-run] Would backfill ${columnsToMigrate.length} column(s) from keuangan into transaction_computed`);
    return;
  }

  const tsNow = now();

  if (sqliteDb) {
    const insertStmt = sqliteDb.prepare(`
      INSERT OR IGNORE INTO transaction_computed
        (transaction_id, formula_key, value, computed_at)
      VALUES (?, ?, ?, ?)
    `);

    const rows = sqliteDb.prepare(`
      SELECT id, ${columnsToMigrate.map(c => `"${c}"`).join(", ")}
      FROM keuangan
    `).all();

    let inserted = 0;
    const bulkInsert = sqliteDb.transaction((rows) => {
      for (const row of rows) {
        for (const col of columnsToMigrate) {
          const val = row[col];
          if (val === null || val === undefined) continue;
          insertStmt.run(row.id, col, Number(val), tsNow);
          inserted++;
        }
      }
    });

    bulkInsert(rows);
    log(`  SQLite: inserted/skipped ${inserted} computed rows from ${rows.length} transactions.`);
  }

  if (pgClient) {
    // Build one large INSERT ... SELECT UNION ALL for efficiency.
    const unionParts = columnsToMigrate.map(col =>
      `SELECT id AS transaction_id, '${col}' AS formula_key, COALESCE("${col}", 0) AS value, NOW() AS computed_at FROM keuangan`
    );
    const sql = `
      INSERT INTO transaction_computed (transaction_id, formula_key, value, computed_at)
      ${unionParts.join("\nUNION ALL\n")}
      ON CONFLICT (transaction_id, formula_key) DO NOTHING
    `;
    try {
      const { rowCount } = await pgClient.query(sql);
      log(`  Supabase: ${rowCount} rows inserted into transaction_computed.`);
    } catch (e) {
      warn("Supabase backfill failed:", e.message);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 4 — Backfill transaction_overrides from legacy override_* columns
// ════════════════════════════════════════════════════════════════════════════

async function step4_backfillOverrides() {
  log("\n── Step 4: Backfill transaction_overrides from override_* columns ──");

  let existingColumns = [];
  if (sqliteDb) {
    try {
      const cols = sqliteDb.prepare("PRAGMA table_info(keuangan)").all();
      existingColumns = cols.map(c => c.name);
    } catch {}
  }

  const overrideCols = LEGACY_OVERRIDE_COLUMNS.filter(c => existingColumns.includes(c));
  if (overrideCols.length === 0) {
    log("  No override_* columns found — skipping.");
    return;
  }

  if (DRY_RUN) {
    log(`  [dry-run] Would backfill ${overrideCols.length} override column(s).`);
    return;
  }

  if (sqliteDb) {
    const insertStmt = sqliteDb.prepare(`
      INSERT OR IGNORE INTO transaction_overrides
        (transaction_id, formula_key, override_value, overridden_at)
      VALUES (?, ?, ?, ?)
    `);

    const rows = sqliteDb.prepare(`
      SELECT id, ${overrideCols.map(c => `"${c}"`).join(", ")}
      FROM keuangan
    `).all();

    let inserted = 0;
    const bulkInsert = sqliteDb.transaction((rows) => {
      for (const row of rows) {
        for (const col of overrideCols) {
          const flag = row[col];
          if (!flag || flag === 0) continue;
          // The legacy override columns are boolean flags, not the override value.
          // The actual overridden value lives in the matching computed column.
          // We record that the override flag was set; the value itself was
          // already written by step 3 (the stored computed value IS the override).
          const formulaKey = col.replace(/^override_/, "");
          insertStmt.run(row.id, formulaKey, 0, new Date().toISOString());
          inserted++;
        }
      }
    });
    bulkInsert(rows);
    log(`  SQLite: ${inserted} override flag(s) recorded in transaction_overrides.`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 5 — Disable legacy orphan formulas (no Kelola Orang link)
// ════════════════════════════════════════════════════════════════════════════

async function step5_disableLegacyOrphanFormulas() {
  log("\n── Step 5: Nonaktifkan rumus lama tanpa actor_id ──");

  const sql = `
    UPDATE cashbook_formula SET enabled = 0
    WHERE actor_id IS NULL
      AND formula_group IN ('profit_share', 'cash_advance', 'bonus')
      AND enabled = 1
  `;

  if (DRY_RUN) {
    log("  [dry-run] Would disable orphan profit_share / cash_advance / bonus formulas.");
    return;
  }

  if (sqliteDb) {
    const r = sqliteDb.prepare(sql).run();
    log(`  SQLite: ${r.changes} rumus lama dinonaktifkan.`);
  }
  if (pgClient) {
    try {
      const r = await pgClient.query(sql);
      log(`  Supabase: ${r.rowCount} rumus lama dinonaktifkan.`);
    } catch (e) {
      warn("Supabase disable orphans failed:", e.message);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 6 — Verify and summarise
// ════════════════════════════════════════════════════════════════════════════

async function step6_verify() {
  log("\n── Step 6: Verification ──");

  if (sqliteDb) {
    const actorCount = sqliteDb.prepare("SELECT COUNT(*) AS c FROM business_actors").get()?.c ?? 0;
    const formulaCount = sqliteDb.prepare(
      "SELECT COUNT(*) AS c FROM cashbook_formula WHERE actor_id IS NOT NULL"
    ).get()?.c ?? 0;
    const computedCount = sqliteDb.prepare("SELECT COUNT(*) AS c FROM transaction_computed").get()?.c ?? 0;
    const orphanCount = sqliteDb.prepare(`
      SELECT COUNT(*) AS c FROM cashbook_formula
      WHERE actor_id IS NULL
        AND formula_group IN ('profit_share', 'cash_advance', 'bonus')
        AND enabled = 1
    `).get()?.c ?? 0;

    log("  SQLite summary:");
    log(`    business_actors:              ${actorCount} rows`);
    log(`    cashbook_formula with actor:  ${formulaCount} rows`);
    log(`    transaction_computed:         ${computedCount} rows`);
    log(`    orphan actor formulas:        ${orphanCount} (target = 0)`);

    if (orphanCount === 0) {
      log("  ✅ No active orphan formulas — halaman Keuangan hanya pakai Kelola Orang.");
    } else {
      log(`  ⚠  ${orphanCount} rumus lama masih aktif — jalankan ulang step 5 atau buka halaman Keuangan.`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════════

try {
  const migratedActors = await step1_seedBusinessActors();
  await step2_linkFormulaActors(migratedActors);
  await step3_backfillTransactionComputed();
  await step4_backfillOverrides();
  await step5_disableLegacyOrphanFormulas();
  await step6_verify();
  log("\n🎉 Migration complete.");
} catch (e) {
  console.error("\n❌ Migration failed:", e);
  process.exit(1);
} finally {
  if (sqliteDb) sqliteDb.close();
  if (pgClient) await pgClient.end();
}
