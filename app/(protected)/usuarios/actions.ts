"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import {
  CreateUserInputSchema,
  UpdateUserInputSchema,
  ResetPasswordInputSchema,
} from "@/lib/schemas";
import {
  createUserFromInput,
  updateUserFromInput,
  resetUserPassword,
  setUserActive,
  removeUser,
} from "@/lib/services/user.service";

export interface UserFormState {
  error?: string;
  success?: boolean;
}

function revalidateUsers() {
  revalidatePath("/usuarios");
}

export async function createUserAction(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  await requireRole("ADMIN");

  const parsed = CreateUserInputSchema.safeParse({
    nombre: formData.get("nombre"),
    correo: formData.get("correo"),
    password: formData.get("password"),
    rol: formData.get("rol"),
    activo: formData.get("activo") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    const companyId = await getDefaultCompanyId();
    await createUserFromInput({
      companyId,
      name: parsed.data.nombre,
      email: parsed.data.correo,
      password: parsed.data.password,
      role: parsed.data.rol,
      active: parsed.data.activo,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidateUsers();
  return { success: true };
}

export async function updateUserAction(
  id: string,
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  await requireRole("ADMIN");

  const parsed = UpdateUserInputSchema.safeParse({
    nombre: formData.get("nombre"),
    correo: formData.get("correo"),
    rol: formData.get("rol"),
    activo: formData.get("activo") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    await updateUserFromInput(id, {
      name: parsed.data.nombre,
      email: parsed.data.correo,
      role: parsed.data.rol,
      active: parsed.data.activo,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidateUsers();
  return { success: true };
}

export async function toggleUserAction(id: string, activo: boolean): Promise<void> {
  await requireRole("ADMIN");
  try {
    await setUserActive(id, activo);
  } catch {
    return;
  }
  revalidateUsers();
}

export async function resetPasswordAction(
  id: string,
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  await requireRole("ADMIN");

  const parsed = ResetPasswordInputSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Contraseña inválida." };
  }

  try {
    await resetUserPassword(id, parsed.data.password);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidateUsers();
  return { success: true };
}

export async function deleteUserAction(id: string): Promise<void> {
  const currentUser = await requireRole("ADMIN");
  if (currentUser.id === id) return; // never let an admin delete their own account this way
  try {
    await removeUser(id);
  } catch {
    return;
  }
  revalidateUsers();
}
