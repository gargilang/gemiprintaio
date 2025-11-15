"use server";

/**
 * Server Actions for Vendors Page
 */

import {
  getVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  type Vendor,
} from "@/lib/services/vendors-service";

export async function getVendorsAction() {
  try {
    return await getVendors();
  } catch (error) {
    console.error("Error in getVendorsAction:", error);
    throw error;
  }
}

export async function createVendorAction(data: any) {
  try {
    return await createVendor(data);
  } catch (error) {
    console.error("Error in createVendorAction:", error);
    throw error;
  }
}

export async function updateVendorAction(id: string, data: any) {
  try {
    return await updateVendor(id, data);
  } catch (error) {
    console.error("Error in updateVendorAction:", error);
    throw error;
  }
}

export async function deleteVendorAction(id: string) {
  try {
    return await deleteVendor(id);
  } catch (error) {
    console.error("Error in deleteVendorAction:", error);
    throw error;
  }
}
