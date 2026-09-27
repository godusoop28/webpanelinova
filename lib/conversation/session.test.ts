import { describe, expect, it } from "vitest";
import {
  buildAssignmentConfirmation,
  buildWaitNotice,
  computeReopenAt,
  decideSession,
  handoffInCurrentSession,
  isLowSignalMessage,
  mentionsAdvisor,
  remainingWaitMinutes,
  SESSION_IDLE_MS,
  shouldSendWaitNotice,
  WAIT_NOTICE_COOLDOWN_MS,
} from "@/lib/conversation/session";
import { ASSISTANT_GREETING, BRAND_NAME } from "@/lib/brand";
import { SYSTEM_PROMPT } from "@/lib/conversation/prompt";
import { mentionsInternalProcess } from "@/lib/conversation/policy";

const T0 = new Date("2026-09-28T18:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

describe("espera tras canalizar (10 minutos)", () => {
  const reopenAt = computeReopenAt(T0, 10)!;

  it("se cuenta desde la canalización", () => {
    expect(reopenAt.toISOString()).toBe(at(10).toISOString());
    expect(computeReopenAt(T0, 0)).toBeNull();
  });

  it("E: antes de 10 minutos el mensaje recibe aviso (espera)", () => {
    expect(decideSession({ now: at(3), reopenAt, lastInboundAt: at(1), hasHistory: true })).toBe("wait");
  });

  it("G: los mensajes durante la espera no la reinician (reopenAt no depende de ellos)", () => {
    // Mensajes en los minutos 2, 5 y 9: siguen en espera y el fin sigue siendo el minuto 10.
    for (const minute of [2, 5, 9]) {
      expect(decideSession({ now: at(minute), reopenAt, lastInboundAt: at(minute - 1), hasHistory: true })).toBe("wait");
    }
    expect(remainingWaitMinutes(reopenAt, at(9))).toBe(1);
    expect(decideSession({ now: at(10), reopenAt, lastInboundAt: at(9), hasHistory: true })).toBe("new_session");
  });

  it("F/H: después de 10 minutos (o al día siguiente) abre una sesión nueva", () => {
    expect(decideSession({ now: at(11), reopenAt, lastInboundAt: at(1), hasHistory: true })).toBe("new_session");
    expect(decideSession({ now: at(24 * 60), reopenAt, lastInboundAt: at(1), hasHistory: true })).toBe("new_session");
  });

  it("H: sin canalización, un 'Hola' horas después también abre sesión nueva (no se contesta un pedido viejo)", () => {
    const old = new Date(T0.getTime() - SESSION_IDLE_MS - 60_000);
    expect(decideSession({ now: T0, reopenAt: null, lastInboundAt: old, hasHistory: true })).toBe("new_session");
    expect(decideSession({ now: T0, reopenAt: null, lastInboundAt: at(-5), hasHistory: true })).toBe("continue");
    expect(decideSession({ now: T0, reopenAt: null, lastInboundAt: null, hasHistory: false })).toBe("continue");
  });

  it("E: el aviso no se repite en cada mensaje (máximo uno cada 5 minutos)", () => {
    expect(shouldSendWaitNotice({ now: at(1), waitNoticeAt: null })).toBe(true);
    expect(shouldSendWaitNotice({ now: at(2), waitNoticeAt: at(1) })).toBe(false);
    expect(shouldSendWaitNotice({ now: new Date(at(1).getTime() + WAIT_NOTICE_COOLDOWN_MS), waitNoticeAt: at(1) })).toBe(true);
  });

  it("la canalización de una sesión anterior no cuenta como de la sesión actual", () => {
    expect(handoffInCurrentSession({ handoffAt: at(0), sessionStartedAt: at(-30) })).toBe(true);
    expect(handoffInCurrentSession({ handoffAt: at(0), sessionStartedAt: at(20) })).toBe(false);
    expect(handoffInCurrentSession({ handoffAt: at(0), sessionStartedAt: null })).toBe(true);
    expect(handoffInCurrentSession({ handoffAt: null, sessionStartedAt: at(0) })).toBe(false);
  });
});

describe("mensajes fijos al cliente", () => {
  it("C/D: comunica el nombre real del asesor, sin 'ruleta' ni prometer el mismo número", () => {
    const text = buildAssignmentConfirmation({ status: "assigned", advisorName: "María López", advisorNotified: true });
    expect(text).toContain("María López");
    expect(text).toContain(BRAND_NAME);
    expect(mentionsInternalProcess(text)).toBe(false);
    expect(text).toMatch(/propio WhatsApp/);
  });

  it("no afirma que se avisó al asesor si el aviso falló", () => {
    const text = buildAssignmentConfirmation({ status: "assigned", advisorName: "María López", advisorNotified: false });
    expect(text).toContain("María López");
    expect(text).not.toMatch(/ya le enviamos/);
  });

  it("asesor vigente y falta de asesor disponible", () => {
    expect(buildAssignmentConfirmation({ status: "existing", advisorName: "Juan Pérez", advisorNotified: false })).toMatch(/Juan Pérez.*seguimiento/);
    const none = buildAssignmentConfirmation({ status: "no_advisor", advisorName: null, advisorNotified: false });
    expect(none).toMatch(/no hay un asesor disponible/);
  });

  it("aviso de espera: asesor, tiempo restante y sin atención inmediata", () => {
    const text = buildWaitNotice({
      reason: "commercial",
      assignment: { status: "assigned", advisorName: "María López", advisorNotified: true },
      minutesLeft: 7,
      savedForTeam: false,
    });
    expect(text).toBe(
      `Tu solicitud ya fue enviada a María López, del equipo de asesores de ${BRAND_NAME}. Si tienes otra duda o quieres iniciar una nueva conversación conmigo, espera 7 minutos y vuelve a escribir.`
    );
    const pending = buildWaitNotice({
      reason: "commercial",
      assignment: { status: "assigned", advisorName: "María López", advisorNotified: false },
      minutesLeft: 1,
      savedForTeam: true,
    });
    expect(pending).not.toMatch(/fue enviada/);
    expect(pending).toMatch(/espera 1 minuto y/);
    expect(pending).toMatch(/Guardé tu mensaje/);
    expect(buildWaitNotice({ reason: "human", assignment: null, minutesLeft: 10, savedForTeam: false })).toMatch(/una persona del equipo/);
  });

  it("detecta si la respuesta de la IA ya nombra al asesor (sin acentos)", () => {
    expect(mentionsAdvisor("Listo, te atenderá Maria Lopez.", "María López")).toBe(true);
    expect(mentionsAdvisor("Listo, un asesor te atenderá.", "María López")).toBe(false);
  });

  it("saludos y agradecimientos no se registran como pendiente", () => {
    for (const text of ["Hola", "holaaa", "ok gracias", "Muchas gracias!", "👍", "Buenas tardes"]) expect(isLowSignalMessage(text)).toBe(true);
    for (const text of ["mi presupuesto es de 3 millones", "¿tiene alberca?"]) expect(isLowSignalMessage(text)).toBe(false);
  });
});

describe("S: marca e identidad", () => {
  it("Century 21 Inova con una sola N y Centurion como asistente", () => {
    expect(BRAND_NAME).toBe("Century 21 Inova");
    expect(SYSTEM_PROMPT).not.toMatch(/Innova/);
    expect(SYSTEM_PROMPT).toMatch(/CENTURION IA/);
    expect(ASSISTANT_GREETING).toBe("¡Hola! Bienvenido a Century 21 Inova. Soy Centurion, tu asesor virtual. Cuéntame, ¿en qué puedo ayudarte?");
    expect(SYSTEM_PROMPT).toMatch(/Nunca finjas ser una persona/);
  });

  it("la palabra 'ruleta' se detecta para corregirla", () => {
    expect(mentionsInternalProcess("Te asignamos por ruleta a Juan")).toBe(true);
    expect(mentionsInternalProcess("Tu solicitud quedó asignada a Juan")).toBe(false);
  });
});
