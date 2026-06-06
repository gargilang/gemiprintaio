import type { FormulaGroup } from "@/lib/ast/types";

// Tipe skema rumus bersama untuk ExpressionAssistant + sub-komponennya (Fase 6 B6).

export interface SchemaColumn {
  name: string;
  column: "C" | "D" | "E" | "F";
  label: string;
  description: string;
}

export interface SchemaFormulaKey {
  key: string;
  label: string;
  group: FormulaGroup;
  isSystem: boolean;
  actorId: string | null;
}

export interface SchemaHelper {
  signature: string;
  description: string;
}

export interface SchemaCategory {
  code: string;
  label: string;
}

export interface FormulaSchemaResponse {
  inputColumns: SchemaColumn[];
  formulaKeys: SchemaFormulaKey[];
  helpers: SchemaHelper[];
  /** Map huruf legacy → formula_key opsional (mis. "J" → "saldo"). */
  columnLetterMap?: Record<string, string>;
  /** Kategori transaksi aktif (mis. OMZET, BIAYA). */
  categories?: SchemaCategory[];
}
