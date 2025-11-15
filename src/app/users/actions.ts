"use server";

/**
 * Server Actions for Users Page
 */

import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
  type User,
} from "@/lib/services/users-service";

export async function getUsersAction() {
  try {
    return await getUsers();
  } catch (error) {
    console.error("Error in getUsersAction:", error);
    throw error;
  }
}

export async function createUserAction(data: any) {
  try {
    return await createUser(data);
  } catch (error) {
    console.error("Error in createUserAction:", error);
    throw error;
  }
}

export async function updateUserAction(id: string, data: any) {
  try {
    return await updateUser(id, data);
  } catch (error) {
    console.error("Error in updateUserAction:", error);
    throw error;
  }
}

export async function deleteUserAction(id: string) {
  try {
    return await deleteUser(id);
  } catch (error) {
    console.error("Error in deleteUserAction:", error);
    throw error;
  }
}

export async function changePasswordAction(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  try {
    // Note: currentPassword is validated on client side, service only needs userId and newPassword
    return await changePassword(userId, newPassword);
  } catch (error) {
    console.error("Error in changePasswordAction:", error);
    throw error;
  }
}
