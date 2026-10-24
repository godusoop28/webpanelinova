"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { requestInventorySync, requestRestore } from "@/lib/services/inventory.service";

export interface InventoryActionState {
  error?: string;
  success?: string;
}

const PUBLIC_ID = z.string().trim().toUpperCase().regex(/^EB-[A-Z]{2}\d{3,6}$/, "Código de propiedad inválido.");

export async function syncInventoryAction(): Promise<InventoryActionState> {
  const user = await requireRole("ADMIN");
  try {
    await requestInventorySync(await getDefaultCompanyId(), user.email);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidatePath("/propiedades/inventario");
  return { success: "Sincronización solicitada: empieza en menos de un minuto." };
}

export async function restorePropertyAction(_prev: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  const user = await requireRole("ADMIN", "DIRECCION");
  const parsed = PUBLIC_ID.safeParse(formData.get("publicId"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Código inválido." };
  try {
    await requestRestore(await getDefaultCompanyId(), parsed.data, user.email);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidatePath("/propiedades/inventario");
  return { success: "Restauración en proceso: se vuelve a crear en EasyBroker en menos de un minuto." };
}
