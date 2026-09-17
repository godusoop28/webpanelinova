"use server";

import { requireRole } from "@/lib/dal";
import { isDatabaseConfigured } from "@/lib/db";
import { getDefaultCompanyId } from "@/lib/company";
import { processIncomingLead, type ProcessLeadResult } from "@/lib/services/lead.service";
import { buildLeadFingerprint } from "@/lib/services/webhook.service";

export interface SimulateLeadState {
  error?: string;
  result?: ProcessLeadResult;
}

/**
 * Fase 28: drives the exact same pipeline the real webhook uses
 * (processIncomingLead), but with automationMode forced to "shadow" no
 * matter what AUTOMATION_MODE is set to in this environment — this page
 * must never be able to trigger a real EasyBroker/ManyChat call (Fase 55).
 */
export async function simulateLeadAction(
  _prevState: SimulateLeadState,
  formData: FormData
): Promise<SimulateLeadState> {
  await requireRole("ADMIN");

  if (!isDatabaseConfigured()) {
    return { error: "DATABASE_URL no está configurada todavía — no hay a dónde escribir el lead de prueba." };
  }

  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();
  const interes = String(formData.get("interes") ?? "").trim();
  const datosPropiedad = String(formData.get("datosPropiedad") ?? "").trim();
  const origen = String(formData.get("origen") ?? "Prueba manual").trim();

  if (!nombre || !telefono || !interes) {
    return { error: "Nombre, teléfono e interés son obligatorios." };
  }

  try {
    const companyId = await getDefaultCompanyId();
    // Unique per submit (not day-bucketed like the real webhook's dedup) —
    // a tester resubmitting the same payload wants a fresh simulation
    // every time, not a "duplicate, skipped" response.
    const requestId = `test:${buildLeadFingerprint({ phone: telefono, interestType: interes, propertyData: datosPropiedad, origen })}:${Date.now()}`;

    const result = await processIncomingLead(
      companyId,
      { nombre, telefonoCliente: telefono, interesCliente: interes, datosPropiedad, origen, requestId },
      { source: "testing_ui", requestId, automationMode: "shadow" }
    );
    return { result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
}
