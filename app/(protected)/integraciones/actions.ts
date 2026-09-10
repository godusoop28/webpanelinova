"use server";

import { revalidateTag } from "next/cache";
import { requireRole } from "@/lib/dal";
import { appendMakeEvent } from "@/lib/google-sheets";
import { env, isDemoModeActive } from "@/lib/env";

export interface SyncState {
  status: "idle" | "success" | "error";
  message?: string;
}

const SYNC_SCENARIO = "Sincronización manual";

export async function runSyncAction(): Promise<SyncState> {
  const user = await requireRole("ADMIN");

  if (isDemoModeActive()) {
    return {
      status: "error",
      message: "Modo demostración: la sincronización no se ejecuta realmente.",
    };
  }

  let webhookUrl: string | undefined;
  try {
    webhookUrl = env.make.syncWebhookUrl;
  } catch {
    webhookUrl = undefined;
  }

  if (!webhookUrl) {
    return {
      status: "error",
      message: "MAKE_SYNC_WEBHOOK_URL no está configurado. Agrega la variable de entorno.",
    };
  }

  const executionId = crypto.randomUUID();

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "inovapanel",
        triggeredBy: user.email,
        executionId,
        triggeredAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Make respondió ${response.status}`);
    }

    await appendMakeEvent({
      fecha: new Date().toISOString(),
      escenario: SYNC_SCENARIO,
      evento: "Disparo manual desde el panel",
      estado: "ejecutado",
      asesor: user.email,
      ejecucionId: executionId,
    });
    revalidateTag("make-events", { expire: 0 });

    return { status: "success", message: "Sincronización enviada correctamente." };
  } catch (error) {
    await appendMakeEvent({
      fecha: new Date().toISOString(),
      escenario: SYNC_SCENARIO,
      evento: "Disparo manual desde el panel",
      estado: "error",
      asesor: user.email,
      ejecucionId: executionId,
      mensaje: error instanceof Error ? error.message : "Error desconocido",
    });
    revalidateTag("make-events", { expire: 0 });

    return {
      status: "error",
      message: error instanceof Error ? error.message : "No se pudo contactar a Make.",
    };
  }
}
