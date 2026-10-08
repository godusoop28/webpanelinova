import { describe, expect, it } from "vitest";
import { currentIntegrationNotice, noticeTarget, uncoveredAuditError, type NoticeJob } from "@/lib/integration-notice";
import { categorizeRecovery } from "@/lib/integration-recovery";

function job(overrides: Partial<NoticeJob>): NoticeJob {
  return {
    id: "j1",
    type: "MANYCHAT_FLOW",
    status: "FAILED",
    attempts: 5,
    lastError: "ManyChat API error 400 Bad Request",
    errorKind: "REJECTED",
    errorCode: "HTTP_400",
    lastAttemptAt: "2026-10-08T08:15:09.112Z",
    nextRetryAt: "2026-10-08T08:15:09.112Z",
    createdAt: "2026-10-08T06:35:04.380Z",
    ...overrides,
  };
}

describe("currentIntegrationNotice", () => {
  it("resume un fallo antiguo con detalle completo, sin texto técnico recortado", () => {
    const notice = currentIntegrationNotice([job({})], { targetFor: () => "Asesor Hector (ManyChat)" });
    expect(notice).toMatchObject({
      title: "No se pudo ejecutar la automatización",
      action: "Aviso al asesor por WhatsApp (flujo de ManyChat)",
      target: "Asesor Hector (ManyChat)",
      attempts: 5,
      code: "HTTP_400",
      nextRetryAt: null,
    });
    expect(notice!.reason).toContain("ManyChat rechazó la solicitud.");
  });

  it("estados: reintento programado, incierto y configuración", () => {
    expect(currentIntegrationNotice([job({ status: "RETRYING" })])).toMatchObject({ title: "Reintento programado", tone: "warning", nextRetryAt: "2026-10-08T08:15:09.112Z" });
    expect(currentIntegrationNotice([job({ status: "UNCERTAIN", errorKind: "TIMEOUT" })])?.title).toBe("Resultado de envío incierto");
    expect(currentIntegrationNotice([job({ errorKind: "FLOW" })])?.title).toBe("Requiere revisar la configuración");
  });

  it("un trabajo posterior confirmado oculta el fallo antiguo del mismo tipo", () => {
    const old = job({ id: "old" });
    const recovered = job({ id: "new", status: "SUCCESS", createdAt: "2026-10-09T00:00:00Z" });
    expect(currentIntegrationNotice([old, recovered])).toBeNull();
  });

  it("si la asignación ya tiene el aviso confirmado, el fallo antiguo deja de mostrarse", () => {
    expect(currentIntegrationNotice([job({})], { confirmedTypes: ["MANYCHAT_FLOW"] })).toBeNull();
  });

  it("destino: asesor vigente por nombre, nunca el ID completo", () => {
    const advisor = { name: "Farid", manyChatSubscriberId: "234838306" };
    expect(noticeTarget({ type: "MANYCHAT_FLOW", payload: { subscriberId: "234838306" } }, advisor)).toBe("Asesor Farid (ManyChat)");
    expect(noticeTarget({ type: "MANYCHAT_FLOW", payload: { subscriberId: "111222333" } }, advisor)).toBe("Contacto ManyChat de un asesor anterior (…2333)");
  });
});

describe("uncoveredAuditError", () => {
  const logs = [
    { eventType: "INTEGRATION_JOB_FAILED", message: "Reintento de MANYCHAT_FLOW falló (intento 5, máximo de intentos alcanzado).", createdAt: "2026-10-08T08:15:09Z" },
    { eventType: "MANYCHAT_NOTIFICATION_FAILED", message: "ManyChat API error 400 Bad Request", createdAt: "2026-10-08T06:35:04Z" },
    { eventType: "PROPERTY_FETCH_FAILED", message: "EasyBroker no respondió", createdAt: "2026-10-08T06:34:00Z" },
  ];

  it("los errores explicados por el trabajo no se repiten como texto suelto", () => {
    expect(uncoveredAuditError(logs, [{ type: "MANYCHAT_FLOW", createdAt: "2026-10-08T06:35:04.380Z" }], false)).toBe("EasyBroker no respondió");
  });

  it("sin trabajo asociado, el fallo de notificación sigue visible", () => {
    expect(uncoveredAuditError(logs.slice(1), [], false)).toBe("ManyChat API error 400 Bad Request");
  });
});

describe("categorizeRecovery", () => {
  const assigned = { exists: true, assignedAdvisorId: "a1", assignedAdvisorSubscriberId: "s1", noticeConfirmed: false };
  it("separa pendientes, permanentes, inciertos, sin asignación, recuperados y de otro asesor", () => {
    expect(categorizeRecovery({ status: "RETRYING", subscriberId: "s1" }, assigned).category).toBe("ASSIGNED_NOTICE_PENDING");
    expect(categorizeRecovery({ status: "FAILED", subscriberId: "s1" }, assigned)).toEqual({ category: "PERMANENT_FAILURE", action: "review_then_requeue" });
    expect(categorizeRecovery({ status: "UNCERTAIN", subscriberId: "s1" }, assigned).category).toBe("UNCERTAIN");
    expect(categorizeRecovery({ status: "FAILED", subscriberId: "s1" }, { ...assigned, assignedAdvisorId: null }).category).toBe("UNASSIGNED");
    expect(categorizeRecovery({ status: "FAILED", subscriberId: "s1" }, { ...assigned, noticeConfirmed: true })).toEqual({ category: "RECOVERED_STALE_NOTICE", action: "close" });
    expect(categorizeRecovery({ status: "FAILED", subscriberId: "s0" }, assigned).category).toBe("SUPERSEDED");
  });
});
