"use server";

import { revalidateTag } from "next/cache";
import { requireRole } from "@/lib/dal";
import {
  addAuthorizedUser,
  toggleAuthorizedUser,
  updateAuthorizedUser,
} from "@/lib/google-sheets";
import { AuthorizedUserInputSchema } from "@/lib/schemas";

export interface UserFormState {
  error?: string;
  success?: boolean;
}

export async function createUserAction(
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  await requireRole("ADMIN");

  const parsed = AuthorizedUserInputSchema.safeParse({
    nombre: formData.get("nombre"),
    correo: formData.get("correo"),
    rol: formData.get("rol"),
    activo: formData.get("activo") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    await addAuthorizedUser(parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidateTag("authorized-users", { expire: 0 });
  return { success: true };
}

export async function updateUserAction(
  rowNumber: number,
  _prevState: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  await requireRole("ADMIN");

  const parsed = AuthorizedUserInputSchema.safeParse({
    nombre: formData.get("nombre"),
    correo: formData.get("correo"),
    rol: formData.get("rol"),
    activo: formData.get("activo") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    await updateAuthorizedUser(rowNumber, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidateTag("authorized-users", { expire: 0 });
  return { success: true };
}

export async function toggleUserAction(rowNumber: number, activo: boolean) {
  await requireRole("ADMIN");
  try {
    await toggleAuthorizedUser(rowNumber, activo);
  } catch {
    return;
  }
  revalidateTag("authorized-users", { expire: 0 });
}
