"use server";

/**
 * Server Actions for Settings Page
 */

import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  getUnits,
  createUnit,
  updateUnit,
  deleteUnit,
  getQuickSpecs,
  createQuickSpec,
  updateQuickSpec,
  deleteQuickSpec,
  reorderCategories,
  reorderSubcategories,
  reorderUnits,
  reorderQuickSpecs,
} from "@/lib/services/master-service";

import {
  getFinishingOptions,
  createFinishingOption,
  updateFinishingOption,
  deleteFinishingOption,
  reorderFinishingOptions,
} from "@/lib/services/finishing-options-service";

import {
  startAutoSync,
  stopAutoSync,
  updateAutoSyncInterval,
  triggerManualSync,
  getSyncStatus,
} from "@/lib/services/sync-operations-service";

import {
  startAutoBackup,
  stopAutoBackup,
  updateBackupInterval,
  createBackup,
  getBackupStatus,
  getBackupSettings,
} from "@/lib/services/backup-service";

// Master Data Actions
export async function getCategoriesAction() {
  try {
    return await getCategories();
  } catch (error) {
    console.error("Error in getCategoriesAction:", error);
    throw error;
  }
}

export async function createCategoryAction(data: any) {
  try {
    return await createCategory(data);
  } catch (error) {
    console.error("Error in createCategoryAction:", error);
    throw error;
  }
}

export async function updateCategoryAction(id: string, data: any) {
  try {
    return await updateCategory(id, data);
  } catch (error) {
    console.error("Error in updateCategoryAction:", error);
    throw error;
  }
}

export async function deleteCategoryAction(id: string) {
  try {
    return await deleteCategory(id);
  } catch (error) {
    console.error("Error in deleteCategoryAction:", error);
    throw error;
  }
}

export async function getSubcategoriesAction(kategori_id?: string) {
  try {
    return await getSubcategories(kategori_id);
  } catch (error) {
    console.error("Error in getSubcategoriesAction:", error);
    throw error;
  }
}

export async function createSubcategoryAction(data: any) {
  try {
    return await createSubcategory(data);
  } catch (error) {
    console.error("Error in createSubcategoryAction:", error);
    throw error;
  }
}

export async function updateSubcategoryAction(id: string, data: any) {
  try {
    return await updateSubcategory(id, data);
  } catch (error) {
    console.error("Error in updateSubcategoryAction:", error);
    throw error;
  }
}

export async function deleteSubcategoryAction(id: string) {
  try {
    return await deleteSubcategory(id);
  } catch (error) {
    console.error("Error in deleteSubcategoryAction:", error);
    throw error;
  }
}

export async function getUnitsAction() {
  try {
    return await getUnits();
  } catch (error) {
    console.error("Error in getUnitsAction:", error);
    throw error;
  }
}

export async function createUnitAction(data: any) {
  try {
    return await createUnit(data);
  } catch (error) {
    console.error("Error in createUnitAction:", error);
    throw error;
  }
}

export async function updateUnitAction(id: string, data: any) {
  try {
    return await updateUnit(id, data);
  } catch (error) {
    console.error("Error in updateUnitAction:", error);
    throw error;
  }
}

export async function deleteUnitAction(id: string) {
  try {
    return await deleteUnit(id);
  } catch (error) {
    console.error("Error in deleteUnitAction:", error);
    throw error;
  }
}

// Quick Specs Actions
export async function getQuickSpecsAction(kategori_id?: string) {
  try {
    return await getQuickSpecs(kategori_id);
  } catch (error) {
    console.error("Error in getQuickSpecsAction:", error);
    throw error;
  }
}

export async function createQuickSpecAction(data: any) {
  try {
    return await createQuickSpec(data);
  } catch (error) {
    console.error("Error in createQuickSpecAction:", error);
    throw error;
  }
}

export async function updateQuickSpecAction(id: string, data: any) {
  try {
    return await updateQuickSpec(id, data);
  } catch (error) {
    console.error("Error in updateQuickSpecAction:", error);
    throw error;
  }
}

export async function deleteQuickSpecAction(id: string) {
  try {
    return await deleteQuickSpec(id);
  } catch (error) {
    console.error("Error in deleteQuickSpecAction:", error);
    throw error;
  }
}

// Reorder Actions
export async function reorderCategoriesAction(
  updates: Array<{ id: string; urutan_tampilan: number }>
) {
  try {
    return await reorderCategories(updates);
  } catch (error) {
    console.error("Error in reorderCategoriesAction:", error);
    throw error;
  }
}

export async function reorderSubcategoriesAction(
  updates: Array<{ id: string; urutan_tampilan: number }>
) {
  try {
    return await reorderSubcategories(updates);
  } catch (error) {
    console.error("Error in reorderSubcategoriesAction:", error);
    throw error;
  }
}

export async function reorderUnitsAction(
  updates: Array<{ id: string; urutan_tampilan: number }>
) {
  try {
    return await reorderUnits(updates);
  } catch (error) {
    console.error("Error in reorderUnitsAction:", error);
    throw error;
  }
}

export async function reorderQuickSpecsAction(
  updates: Array<{ id: string; urutan_tampilan: number }>
) {
  try {
    return await reorderQuickSpecs(updates);
  } catch (error) {
    console.error("Error in reorderQuickSpecsAction:", error);
    throw error;
  }
}

// Finishing Options Actions
export async function getFinishingOptionsAction() {
  try {
    return await getFinishingOptions();
  } catch (error) {
    console.error("Error in getFinishingOptionsAction:", error);
    throw error;
  }
}

export async function createFinishingOptionAction(data: any) {
  try {
    return await createFinishingOption(data);
  } catch (error) {
    console.error("Error in createFinishingOptionAction:", error);
    throw error;
  }
}

export async function updateFinishingOptionAction(id: string, data: any) {
  try {
    return await updateFinishingOption(id, data);
  } catch (error) {
    console.error("Error in updateFinishingOptionAction:", error);
    throw error;
  }
}

export async function deleteFinishingOptionAction(id: string) {
  try {
    return await deleteFinishingOption(id);
  } catch (error) {
    console.error("Error in deleteFinishingOptionAction:", error);
    throw error;
  }
}

export async function reorderFinishingOptionsAction(
  updates: Array<{ id: string; urutan_tampilan: number }>
) {
  try {
    return await reorderFinishingOptions(updates);
  } catch (error) {
    console.error("Error in reorderFinishingOptionsAction:", error);
    throw error;
  }
}

// Sync Operations Actions
export async function startAutoSyncAction(intervalMinutes: number = 20) {
  try {
    return startAutoSync(intervalMinutes);
  } catch (error) {
    console.error("Error in startAutoSyncAction:", error);
    throw error;
  }
}

export async function stopAutoSyncAction() {
  try {
    return await stopAutoSync();
  } catch (error) {
    console.error("Error in stopAutoSyncAction:", error);
    throw error;
  }
}

export async function updateAutoSyncIntervalAction(intervalMs: number) {
  try {
    return await updateAutoSyncInterval(intervalMs);
  } catch (error) {
    console.error("Error in updateAutoSyncIntervalAction:", error);
    throw error;
  }
}

export async function triggerManualSyncAction() {
  try {
    return await triggerManualSync();
  } catch (error) {
    console.error("Error in triggerManualSyncAction:", error);
    throw error;
  }
}

export async function getSyncStatusAction() {
  try {
    return await getSyncStatus();
  } catch (error) {
    console.error("Error in getSyncStatusAction:", error);
    throw error;
  }
}

// Backup Operations Actions
export async function startAutoBackupAction() {
  try {
    return await startAutoBackup();
  } catch (error) {
    console.error("Error in startAutoBackupAction:", error);
    throw error;
  }
}

export async function stopAutoBackupAction() {
  try {
    return await stopAutoBackup();
  } catch (error) {
    console.error("Error in stopAutoBackupAction:", error);
    throw error;
  }
}

export async function updateAutoBackupIntervalAction(intervalMs: number) {
  try {
    return await updateBackupInterval(intervalMs);
  } catch (error) {
    console.error("Error in updateAutoBackupIntervalAction:", error);
    throw error;
  }
}

export async function triggerManualBackupAction() {
  try {
    return await createBackup();
  } catch (error) {
    console.error("Error in triggerManualBackupAction:", error);
    throw error;
  }
}

export async function getBackupStatusAction() {
  try {
    return await getBackupStatus();
  } catch (error) {
    console.error("Error in getBackupStatusAction:", error);
    throw error;
  }
}

export async function getBackupSettingsAction() {
  try {
    return await getBackupSettings();
  } catch (error) {
    console.error("Error in getBackupSettingsAction:", error);
    throw error;
  }
}

// Database Operations for Sync Status
import { db } from "@/lib/db-unified";

export async function getPendingSyncCountAction() {
  try {
    return await db.getPendingSyncCount();
  } catch (error) {
    console.error("Error in getPendingSyncCountAction:", error);
    return 0;
  }
}

export async function syncToCloudAction() {
  try {
    return await db.syncToCloud();
  } catch (error) {
    console.error("Error in syncToCloudAction:", error);
    throw error;
  }
}

export async function processOfflineQueueAction() {
  try {
    return await db.processOfflineQueue();
  } catch (error) {
    console.error("Error in processOfflineQueueAction:", error);
    throw error;
  }
}
