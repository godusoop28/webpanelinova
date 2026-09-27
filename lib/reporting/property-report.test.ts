import { describe, expect, it } from "vitest";
import {
  aggregatePropertyInquiries,
  buildOwnerEventNotice,
  buildOwnerWeeklyReport,
  isWeeklyDue,
  NOT_IDENTIFIED,
  previousWeeklyPeriod,
  recipientBlockers,
  weeklyPeriodFor,
  type InquiryRow,
} from "@/lib/reporting/property-report";

function row(overrides: Partial<InquiryRow>): InquiryRow {
  return {
    publicId: "EB-AA0001",
    contactKey: "+523300000001",
    day: "2026-09-22",
    messageCount: 1,
    channel: "whatsapp",
    linkPortal: null,
    acquisitionSource: null,
    declaredSource: null,
    isTest: false,
    lastAt: new Date("2026-09-22T18:00:00Z"),
    ...overrides,
  };
}

describe("periodo semanal (viernes a jueves, Ciudad de México)", () => {
  it("el viernes reporta los 7 días anteriores; periodos contiguos sin huecos ni solapamientos", () => {
    // Viernes 25-sep-2026 10:00 en CDMX = 16:00 UTC.
    const period = weeklyPeriodFor(new Date("2026-09-25T16:00:00Z"));
    expect(period.startKey).toBe("2026-09-18");
    expect(period.endKey).toBe("2026-09-24");
    expect(period.start.toISOString()).toBe("2026-09-18T06:00:00.000Z");
    expect(period.endExclusive.toISOString()).toBe("2026-09-25T06:00:00.000Z");
    const previous = previousWeeklyPeriod(period);
    expect(previous.endExclusive.getTime()).toBe(period.start.getTime());
    expect(previous.startKey).toBe("2026-09-11");
  });

  it("entre semana apunta al último viernes; el jueves 23:59 CDMX todavía es la semana anterior", () => {
    expect(weeklyPeriodFor(new Date("2026-09-30T18:00:00Z")).startKey).toBe("2026-09-18");
    // Jueves 01-oct 23:59 CDMX = viernes 02-oct 05:59 UTC.
    expect(weeklyPeriodFor(new Date("2026-10-02T05:59:00Z")).endKey).toBe("2026-09-24");
    expect(weeklyPeriodFor(new Date("2026-10-02T06:00:00Z")).endKey).toBe("2026-10-01");
  });

  it("solo toca enviar el día y la hora configurados en la zona de CDMX; sin hora no se programa", () => {
    const schedule = { weekday: 5, hour: 10, minute: 0 };
    expect(isWeeklyDue(new Date("2026-09-25T15:59:00Z"), schedule)).toBe(false); // 09:59 CDMX
    expect(isWeeklyDue(new Date("2026-09-25T16:00:00Z"), schedule)).toBe(true); // 10:00 CDMX
    expect(isWeeklyDue(new Date("2026-09-26T16:00:00Z"), schedule)).toBe(false); // sábado
    expect(isWeeklyDue(new Date("2026-09-25T16:00:00Z"), { ...schedule, hour: null })).toBe(false);
  });
});

describe("conteos por propiedad", () => {
  it("L: un contacto con cinco mensajes cuenta como un lead en la propiedad y el periodo", () => {
    const rows = [row({ messageCount: 3 }), row({ day: "2026-09-23", messageCount: 2 })];
    const [metrics] = aggregatePropertyInquiries(rows, "2026-09-18", "2026-09-24");
    expect(metrics.periodLeads).toBe(1);
    expect(metrics.periodInquiries).toBe(2);
    expect(metrics.periodMessages).toBe(5);
  });

  it("M: un contacto con dos propiedades aparece en ambas", () => {
    const rows = [row({}), row({ publicId: "EB-BB0002" })];
    const metrics = aggregatePropertyInquiries(rows, "2026-09-18", "2026-09-24");
    expect(metrics.map((m) => [m.publicId, m.periodLeads])).toEqual([
      ["EB-AA0001", 1],
      ["EB-BB0002", 1],
    ]);
  });

  it("acumulado = contactos distintos hasta el fin del periodo (no la suma de semanas); pruebas excluidas", () => {
    const rows = [
      row({ day: "2026-09-01" }),
      row({ day: "2026-09-20" }), // mismo contacto, otra semana
      row({ contactKey: "+523300000002", day: "2026-09-02" }),
      row({ contactKey: "+523300000003", day: "2026-09-21", isTest: true }),
      row({ contactKey: "+523300000004", day: "2026-10-01" }), // después del periodo
    ];
    const [metrics] = aggregatePropertyInquiries(rows, "2026-09-18", "2026-09-24");
    expect(metrics.periodLeads).toBe(1);
    expect(metrics.cumulativeLeads).toBe(2);
  });

  it("N: WhatsApp es el canal; el portal del enlace no se toma como fuente de adquisición", () => {
    const rows = [row({ linkPortal: "inmuebles24" }), row({ contactKey: "+523300000002", declaredSource: "Facebook" })];
    const [metrics] = aggregatePropertyInquiries(rows, "2026-09-18", "2026-09-24");
    expect(metrics.channels).toEqual([{ label: "WhatsApp", contacts: 2 }]);
    expect(metrics.linkPortals).toEqual([
      { label: "Inmuebles24", contacts: 1 },
      { label: NOT_IDENTIFIED, contacts: 1 },
    ]);
    expect(metrics.acquisition).toEqual([{ label: NOT_IDENTIFIED, contacts: 2 }]);
    expect(metrics.declared.find((s) => s.label === "Facebook")?.contacts).toBe(1);
  });
});

describe("textos al propietario", () => {
  const property = { publicId: "EB-AA0001", title: "Casa en Valle Real" };
  const period = { label: "vie, 18 sept 2026 al jue, 24 sept 2026" };

  it("sin leads ni eventos lo dice, sin inventar actividad; sin datos personales", () => {
    const report = buildOwnerWeeklyReport({ property, period, metrics: null, dataSinceKey: "2026-07-13", events: [] });
    expect(report.text).toMatch(/no se registraron personas interesadas/);
    expect(report.text).toMatch(/Sin actividades registradas/);
    expect(report.text).toMatch(/desde el 13\/07\/2026/);
    expect(report.text).toMatch(/^\*PULSO INOVA \| Casa en Valle Real \(EB-AA0001\)\*/);
    for (const value of Object.values(report.variables)) expect(value).not.toMatch(/\n/);
  });

  it("con métricas incluye conteos y procedencia, nunca teléfonos de prospectos", () => {
    const [metrics] = aggregatePropertyInquiries([row({ linkPortal: "inmuebles24" }), row({ contactKey: "+523300000002" })], "2026-09-18", "2026-09-24");
    const report = buildOwnerWeeklyReport({ property, period, metrics, dataSinceKey: null, events: [] });
    expect(report.variables.weekLeads).toBe("2 personas interesadas");
    expect(report.text).toMatch(/enlace compartido de Inmuebles24 \(1\)/);
    expect(report.text).not.toMatch(/\+52/);
  });

  it("Q: una cita programada no se comunica como realizada; la realizada usa solo lo registrado", () => {
    const scheduledAt = new Date("2026-09-27T17:00:00Z");
    const scheduled = buildOwnerEventNotice({
      property,
      event: { type: "OPEN_HOUSE", status: "SCHEDULED", title: "Open House", description: "Open House de 11 a 14 h", scheduledAt, completedAt: null, outcome: null, version: 1 },
    });
    expect(scheduled.variables.headline).toMatch(/^Open House programada para/);
    expect(scheduled.text).not.toMatch(/realizad/i);
    const done = buildOwnerEventNotice({
      property,
      event: { type: "SHOWING", status: "DONE", title: "Visita", description: null, scheduledAt, completedAt: scheduledAt, outcome: "Visitaron 2 familias.", version: 2 },
    });
    expect(done.variables.headline).toMatch(/^Visita realizada/);
    expect(done.variables.detail).toBe("Registro del equipo: Visitaron 2 familias.");
    const rescheduled = buildOwnerEventNotice({
      property,
      event: { type: "SHOWING", status: "SCHEDULED", title: "Visita", description: null, scheduledAt, completedAt: null, outcome: null, version: 2 },
    });
    expect(rescheduled.variables.headline).toMatch(/reprogramada/);
  });
});

describe("R: a quién se le puede enviar", () => {
  const ok = { active: true, consentStatus: "GRANTED" as const, verifiedAt: new Date(), manyChatSubscriberId: "123", weeklyReport: true, eventNotifications: false };
  it("destinatario verificado y autorizado", () => {
    expect(recipientBlockers(ok, "weekly")).toEqual([]);
    expect(recipientBlockers(ok, "event")).toEqual(["avisos de actividad no habilitados"]);
  });
  it("sin autorización, sin verificar o sin contacto de ManyChat no sale nada (ni prueba)", () => {
    expect(recipientBlockers({ ...ok, consentStatus: "PENDING" }, "test")).toContain("sin autorización registrada");
    expect(recipientBlockers({ ...ok, verifiedAt: null }, "test")).toContain("sin verificar en ManyChat");
    expect(recipientBlockers({ ...ok, manyChatSubscriberId: null }, "weekly")).toContain("sin contacto de ManyChat");
  });
});
