/**
 * In-memory db-unified mock used by the commercial-workflow service tests.
 *
 * Why a hand-rolled mock instead of better-sqlite3:
 *   - Service code threads through `db.query`, `db.queryOne`, `db.insert`,
 *     `db.update`, `db.delete`, and `db.transaction` from db-unified. We want
 *     deterministic in-memory behaviour without spinning up SQLite or
 *     stubbing every individual call site.
 *
 * The mock supports the subset of features used by the commercial workflow
 * services: equality `where` filters, optional `select`, ordering, limit,
 * `queryOne`, transaction emulation (no rollback semantics — assume tests
 * don't intentionally throw mid-tx), insert/update/delete by primary key,
 * and a configurable `generateId` so tests can assert deterministic ids.
 */

export type DbStore = Record<string, Map<string, any>>;

let store: DbStore = {};
let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `id-${idCounter.toString().padStart(6, "0")}`;
}

function rowsOf(table: string): Map<string, any> {
  let map = store[table];
  if (!map) {
    map = new Map();
    store[table] = map;
  }
  return map;
}

function matchesWhere(row: any, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    // mock-db hanya mendukung filter equality. Operator IN/LIKE/range (array
    // atau objek operator seperti { gte, in, like }) belum didukung — lempar
    // error eksplisit daripada diam mengembalikan hasil salah (O-I3).
    if (value !== null && typeof value === "object") {
      throw new Error(
        `mock-db: operator where belum didukung untuk kolom "${key}" (hanya equality). ` +
          `Nilai: ${JSON.stringify(value)}`
      );
    }
    if (row[key] !== value) return false;
  }
  return true;
}

function applyOrder(
  rows: any[],
  orderBy?: { column: string; ascending?: boolean }
): any[] {
  if (!orderBy) return rows;
  const dir = orderBy.ascending === false ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[orderBy.column] ?? "";
    const bv = b[orderBy.column] ?? "";
    if (av === bv) return 0;
    return av < bv ? -1 * dir : 1 * dir;
  });
}

function ensureTimestamps(row: any) {
  if (!row.dibuat_pada) row.dibuat_pada = new Date().toISOString();
  if (!row.diperbarui_pada) row.diperbarui_pada = row.dibuat_pada;
}

const db = {
  query: jest.fn(async (table: string, opts: any = {}) => {
    const rows = Array.from(rowsOf(table).values()).filter((row) =>
      matchesWhere(row, opts.where)
    );
    const ordered = applyOrder(rows, opts.orderBy);
    const limited =
      typeof opts.limit === "number" ? ordered.slice(0, opts.limit) : ordered;
    const projected = opts.select
      ? limited.map((row) => {
          const out: any = {};
          for (const col of String(opts.select).split(",")) {
            const trimmed = col.trim();
            out[trimmed] = row[trimmed];
          }
          return out;
        })
      : limited.map((row) => ({ ...row }));
    return { data: projected, error: null };
  }),
  queryOne: jest.fn(async (table: string, opts: any = {}) => {
    const rows = Array.from(rowsOf(table).values()).filter((row) =>
      matchesWhere(row, opts.where)
    );
    const ordered = applyOrder(rows, opts.orderBy);
    return { data: ordered[0] ? { ...ordered[0] } : null, error: null };
  }),
  insert: jest.fn(async (table: string, row: any) => {
    const id = row.id || nextId();
    const inserted = { ...row, id };
    ensureTimestamps(inserted);
    rowsOf(table).set(id, inserted);
    return { data: { ...inserted }, error: null };
  }),
  update: jest.fn(async (table: string, id: string, patch: any) => {
    const map = rowsOf(table);
    const existing = map.get(id);
    if (!existing) return { data: null, error: new Error(`row ${id} not found in ${table}`) };
    const updated = { ...existing, ...patch, diperbarui_pada: new Date().toISOString() };
    map.set(id, updated);
    return { data: { ...updated }, error: null };
  }),
  delete: jest.fn(async (table: string, id: string) => {
    rowsOf(table).delete(id);
    return { data: null, error: null };
  }),
  transaction: jest.fn(async (fn: () => Promise<any>) => {
    return fn();
  }),
};

const generateId = jest.fn(() => nextId());
const getCurrentTimestamp = jest.fn(() => new Date("2026-05-25T00:00:00.000Z").toISOString());

export function resetMockDb(initial: DbStore = {}) {
  store = {};
  idCounter = 0;
  for (const [table, rows] of Object.entries(initial)) {
    const map = rowsOf(table);
    for (const [id, row] of rows.entries()) {
      map.set(id, { ...row });
    }
  }
  for (const fn of [
    db.query,
    db.queryOne,
    db.insert,
    db.update,
    db.delete,
    db.transaction,
    generateId,
    getCurrentTimestamp,
  ]) {
    fn.mockClear();
  }
}

export function mockTable(table: string): Map<string, any> {
  return rowsOf(table);
}

export function getStore(): DbStore {
  return store;
}

export function setIdCounter(value: number) {
  idCounter = value;
}

export const __mock = { db, generateId, getCurrentTimestamp };
