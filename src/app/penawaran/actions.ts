"use server";

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import { getPOSInitData } from "@/lib/services/pos-service";
import { getShopSettings } from "@/lib/services/shop-settings-service";
import {
  convertQuotationToSale,
  createQuotation,
  getQuotations,
  updateQuotation,
  updateQuotationStatus,
  type QuotationStatus,
  type UpsertQuotationInput,
} from "@/lib/services/quotation-service";

export async function getPenawaranInitAction() {
  const [pos, quotations, shop] = await Promise.all([
    getPOSInitData(),
    getQuotations(),
    getShopSettings(),
  ]);
  return {
    customers: pos.customers,
    materials: pos.materials,
    subkontraktor: pos.subkontraktor,
    quotations,
    shop,
  };
}

export async function createQuotationAction(input: UpsertQuotationInput) {
  const s = await requireAdminOrManager();
  return createQuotation({ ...input, dibuat_oleh: s.uid });
}

export async function updateQuotationAction(id: string, input: UpsertQuotationInput) {
  await requireAdminOrManager();
  return updateQuotation(id, input);
}

export async function updateQuotationStatusAction(id: string, status: QuotationStatus) {
  await requireAdminOrManager();
  return updateQuotationStatus(id, status);
}

export async function convertQuotationToSaleAction(
  id: string,
  input: Parameters<typeof convertQuotationToSale>[1]
) {
  const s = await requireAdminOrManager();
  return convertQuotationToSale(id, { ...input, kasir_id: s.uid });
}

