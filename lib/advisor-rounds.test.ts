import { describe, expect, it } from "vitest";
import { advisorsOnRound, applyRounds, describeRound, isRoundActiveAt, mexicoCityClock, parseTimeToMinute, type AdvisorRoundSchedule } from "./advisor-rounds";

// Ciudad de México es UTC-6 todo el año (sin horario de verano desde 2022).
const mx = (iso: string) => new Date(`${iso}-06:00`);

const round = (overrides: Partial<AdvisorRoundSchedule> = {}): AdvisorRoundSchedule => ({
  advisorId: "a1",
  weekdays: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 11 * 60,
  active: true,
  ...overrides,
});

describe("mexicoCityClock", () => {
  it("devuelve día ISO y minuto local", () => {
    // 2026-10-05 es lunes.
    expect(mexicoCityClock(mx("2026-10-05T09:30:00"))).toEqual({ weekday: 1, minute: 570 });
    expect(mexicoCityClock(mx("2026-10-11T00:00:00"))).toEqual({ weekday: 7, minute: 0 });
  });
});

describe("isRoundActiveAt", () => {
  it("cubre de inicio inclusivo a fin exclusivo", () => {
    expect(isRoundActiveAt(round(), mx("2026-10-05T09:00:00"))).toBe(true);
    expect(isRoundActiveAt(round(), mx("2026-10-05T10:59:00"))).toBe(true);
    expect(isRoundActiveAt(round(), mx("2026-10-05T11:00:00"))).toBe(false);
    expect(isRoundActiveAt(round(), mx("2026-10-05T08:59:00"))).toBe(false);
  });

  it("respeta los días", () => {
    expect(isRoundActiveAt(round(), mx("2026-10-10T10:00:00"))).toBe(false); // sábado
  });

  it("ignora rondas inactivas", () => {
    expect(isRoundActiveAt(round({ active: false }), mx("2026-10-05T10:00:00"))).toBe(false);
  });

  it("maneja rondas que cruzan medianoche desde el día de inicio", () => {
    const night = round({ weekdays: [5], startMinute: 22 * 60, endMinute: 2 * 60 }); // viernes 22:00–02:00
    expect(isRoundActiveAt(night, mx("2026-10-09T23:00:00"))).toBe(true); // viernes
    expect(isRoundActiveAt(night, mx("2026-10-10T01:30:00"))).toBe(true); // madrugada del sábado
    expect(isRoundActiveAt(night, mx("2026-10-10T02:00:00"))).toBe(false);
    expect(isRoundActiveAt(night, mx("2026-10-09T01:00:00"))).toBe(false); // madrugada del viernes: era ronda del jueves
  });

  it("acepta fin a las 24:00", () => {
    expect(isRoundActiveAt(round({ startMinute: 20 * 60, endMinute: 1440 }), mx("2026-10-05T23:59:00"))).toBe(true);
  });
});

describe("applyRounds", () => {
  const candidates = [
    { id: "a1", dailyLimit: null },
    { id: "a2", dailyLimit: 2 },
    { id: "a3", dailyLimit: null },
  ];

  it("sin rondas activas deja la ruleta igual", () => {
    expect(applyRounds(candidates, new Map(), new Set())).toEqual({ pool: candidates, roundApplied: false });
  });

  it("restringe a los asesores en ronda", () => {
    const result = applyRounds(candidates, new Map(), new Set(["a2"]));
    expect(result.roundApplied).toBe(true);
    expect(result.pool.map((a) => a.id)).toEqual(["a2"]);
  });

  it("si el asesor en ronda llegó a su límite, vuelve a la ruleta normal", () => {
    const result = applyRounds(candidates, new Map([["a2", 2]]), new Set(["a2"]));
    expect(result.roundApplied).toBe(false);
    expect(result.pool).toBe(candidates);
  });

  it("ignora asesores en ronda que no son elegibles (no están entre los candidatos)", () => {
    expect(applyRounds(candidates, new Map(), new Set(["fuera"])).roundApplied).toBe(false);
  });

  it("advisorsOnRound junta varias rondas", () => {
    const now = mx("2026-10-05T10:00:00");
    const on = advisorsOnRound([round({ advisorId: "a1" }), round({ advisorId: "a3", startMinute: 600, endMinute: 660 }), round({ advisorId: "a2", weekdays: [6] })], now);
    expect([...on].sort()).toEqual(["a1", "a3"]);
  });
});

describe("formato", () => {
  it("parsea horas", () => {
    expect(parseTimeToMinute("09:30")).toBe(570);
    expect(parseTimeToMinute("24:00")).toBe(1440);
    expect(parseTimeToMinute("24:30")).toBeNull();
    expect(parseTimeToMinute("9:5")).toBeNull();
  });

  it("describe rondas", () => {
    expect(describeRound({ weekdays: [1, 2, 3, 4, 5], startMinute: 540, endMinute: 660 })).toBe("Lunes a viernes · 09:00–11:00");
    expect(describeRound({ weekdays: [5], startMinute: 1320, endMinute: 120 })).toBe("Vie · 22:00–02:00 (cruza medianoche)");
  });
});
