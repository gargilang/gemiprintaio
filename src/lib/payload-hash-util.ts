import { createHash } from "crypto";

/**
 * Hash SHA-256 dari payload mutasi untuk kolom `payload_hash` di
 * sync_mutation_registry. Dipisah ke util tanpa dependency supaya bisa
 * di-unit-test tanpa menarik rantai server-only db-unified.
 */
export function hashPayload(data: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
