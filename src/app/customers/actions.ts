"use server";

/**
 * Server Actions for Customers Page
 */

import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  type Customer,
} from "@/lib/services/customers-service";

export async function getCustomersAction() {
  try {
    return await getCustomers();
  } catch (error) {
    console.error("Error in getCustomersAction:", error);
    throw error;
  }
}

export async function createCustomerAction(data: any) {
  try {
    return await createCustomer(data);
  } catch (error) {
    console.error("Error in createCustomerAction:", error);
    throw error;
  }
}

export async function updateCustomerAction(id: string, data: any) {
  try {
    return await updateCustomer(id, data);
  } catch (error) {
    console.error("Error in updateCustomerAction:", error);
    throw error;
  }
}

export async function deleteCustomerAction(id: string) {
  try {
    return await deleteCustomer(id);
  } catch (error) {
    console.error("Error in deleteCustomerAction:", error);
    throw error;
  }
}
