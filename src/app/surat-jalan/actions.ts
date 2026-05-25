"use server";

/**
 * Server Actions for Surat Jalan page.
 */

import {
  getSuratJalan,
  getSuratJalanById,
  createSuratJalan,
  updateSuratJalan,
  updateSuratJalanStatus,
  deleteSuratJalan,
  buildItemsFromSale,
  type CreateSuratJalanData,
  type UpdateSuratJalanStatusData,
  type SuratJalan,
} from "@/lib/services/surat-jalan-service";
import { getShopSettings } from "@/lib/services/shop-settings-service";

export async function listSuratJalanAction(limit: number = 200) {
  try {
    return await getSuratJalan(limit);
  } catch (error) {
    console.error("listSuratJalanAction error:", error);
    throw error;
  }
}

export async function getSuratJalanByIdAction(
  id: string
): Promise<SuratJalan | null> {
  try {
    return await getSuratJalanById(id);
  } catch (error) {
    console.error("getSuratJalanByIdAction error:", error);
    throw error;
  }
}

export async function createSuratJalanAction(data: CreateSuratJalanData) {
  try {
    return await createSuratJalan(data);
  } catch (error) {
    console.error("createSuratJalanAction error:", error);
    throw error;
  }
}

export async function updateSuratJalanAction(
  id: string,
  data: Partial<CreateSuratJalanData>
) {
  try {
    await updateSuratJalan(id, data);
    return { success: true };
  } catch (error) {
    console.error("updateSuratJalanAction error:", error);
    throw error;
  }
}

export async function updateSuratJalanStatusAction(
  data: UpdateSuratJalanStatusData
) {
  try {
    await updateSuratJalanStatus(data);
    return { success: true };
  } catch (error) {
    console.error("updateSuratJalanStatusAction error:", error);
    throw error;
  }
}

export async function deleteSuratJalanAction(id: string) {
  try {
    await deleteSuratJalan(id);
    return { success: true };
  } catch (error) {
    console.error("deleteSuratJalanAction error:", error);
    throw error;
  }
}

export async function buildSJItemsFromSaleAction(saleId: string) {
  try {
    return await buildItemsFromSale(saleId);
  } catch (error) {
    console.error("buildSJItemsFromSaleAction error:", error);
    throw error;
  }
}

/**
 * Get shop settings for SJ print header (subset of fields).
 */
export async function getShopSettingsForSJAction() {
  try {
    const s = await getShopSettings();
    return {
      nama_toko: s.nama_toko,
      slogan: s.slogan,
      alamat: s.alamat,
      telepon: s.telepon,
      email: s.email,
      website: s.website,
    };
  } catch (error) {
    console.error("getShopSettingsForSJAction error:", error);
    return undefined;
  }
}
