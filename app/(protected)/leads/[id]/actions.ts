"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { UpdateLeadInputSchema, ReassignLeadInputSchema } from "@/lib/schemas";
import { updateLeadStatus, reassignLead } from "@/lib/services/lead-management.service";

export interface LeadActionState {
  error?: string;
  success?: boolean;
}

export async function changeLeadStatusAction(
  leadId: string,
  _prevState: LeadActionState,
  formData: FormData
): Promise<LeadActionState> {
  await requireRole("ADMIN", "DIRECCION");

  const parsed = UpdateLeadInputSchema.safeParse({ status: formData.get("status") });
  if (!parsed.success || !parsed.data.status) {
    return { error: "Estado inválido." };
  }

  try {
    await updateLeadStatus(leadId, parsed.data.status);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}

export async function reassignLeadAction(
  leadId: string,
  _prevState: LeadActionState,
  formData: FormData
): Promise<LeadActionState> {
  await requireRole("ADMIN", "DIRECCION");

  const parsed = ReassignLeadInputSchema.safeParse({
    advisorId: formData.get("advisorId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    const result = await reassignLead(leadId, parsed.data.advisorId, parsed.data.reason);
    if (!result.ok) return { error: result.error ?? "No se pudo reasignar." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}
