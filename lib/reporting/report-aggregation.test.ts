import { describe, expect, it } from "vitest";
import { aggregateReportData, type RawGroupInputs } from "@/lib/reporting/report-aggregation";

const statusLabel = (status: string) => `Label(${status})`;

function baseInput(overrides: Partial<RawGroupInputs> = {}): RawGroupInputs {
  return {
    total: 0,
    routeGroups: [],
    originGroups: [],
    statusGroups: [],
    advisorRouteGroups: [],
    advisorNames: [],
    methodGroups: [],
    uniquePhoneCount: 0,
    statusLabel,
    ...overrides,
  };
}

describe("aggregateReportData — route breakdown", () => {
  it("maps PROPERTY/EXPLORE/CAMPAIGN/TIMEOUT straight through and folds NO_RESPONSE into TIMEOUT", () => {
    const result = aggregateReportData(
      baseInput({
        total: 10,
        routeGroups: [
          { interestType: "PROPERTY", count: 4 },
          { interestType: "EXPLORE", count: 2 },
          { interestType: "CAMPAIGN", count: 1 },
          { interestType: "TIMEOUT", count: 1 },
          { interestType: "NO_RESPONSE", count: 1 },
          { interestType: "OTHER", count: 1 },
        ],
      })
    );
    const byRoute = Object.fromEntries(result.byRoute.map((r) => [r.route, r.count]));
    expect(byRoute.PROPERTY).toBe(4);
    expect(byRoute.EXPLORE).toBe(2);
    expect(byRoute.CAMPAIGN).toBe(1);
    expect(byRoute.TIMEOUT).toBe(2); // TIMEOUT + NO_RESPONSE
    expect(byRoute.OTHER).toBe(1);
    expect(result.summary.byRoute.TIMEOUT).toBe(2);
  });

  it("the route breakdown always sums to the period total", () => {
    const result = aggregateReportData(
      baseInput({
        total: 7,
        routeGroups: [
          { interestType: "PROPERTY", count: 3 },
          { interestType: "EXPLORE", count: 4 },
        ],
      })
    );
    const sum = result.byRoute.reduce((acc, r) => acc + r.count, 0);
    expect(sum).toBe(7);
  });

  it("omits routes with zero leads instead of showing empty rows", () => {
    const result = aggregateReportData(baseInput({ total: 3, routeGroups: [{ interestType: "PROPERTY", count: 3 }] }));
    expect(result.byRoute).toHaveLength(1);
    expect(result.byRoute[0].route).toBe("PROPERTY");
  });

  it("computes percentages relative to the total, rounded to one decimal", () => {
    const result = aggregateReportData(
      baseInput({
        total: 3,
        routeGroups: [
          { interestType: "PROPERTY", count: 1 },
          { interestType: "EXPLORE", count: 2 },
        ],
      })
    );
    const property = result.byRoute.find((r) => r.route === "PROPERTY")!;
    expect(property.percent).toBeCloseTo(33.3, 1);
  });

  it("returns zero percentages instead of dividing by zero for an empty period", () => {
    const result = aggregateReportData(baseInput({ total: 0 }));
    expect(result.byRoute).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });
});

describe("aggregateReportData — origin breakdown", () => {
  it("groups by origin and labels null/blank as 'Sin especificar'", () => {
    const result = aggregateReportData(
      baseInput({
        total: 5,
        originGroups: [
          { origin: "WhatsApp ManyChat", count: 3 },
          { origin: null, count: 1 },
          { origin: "  ", count: 1 },
        ],
      })
    );
    const byOrigin = Object.fromEntries(result.byOrigin.map((r) => [r.origin, r.count]));
    expect(byOrigin["WhatsApp ManyChat"]).toBe(3);
    expect(byOrigin["Sin especificar"]).toBe(2);
  });

  it("sorts origins by count descending", () => {
    const result = aggregateReportData(
      baseInput({
        total: 6,
        originGroups: [
          { origin: "Meta", count: 1 },
          { origin: "ManyChat", count: 5 },
        ],
      })
    );
    expect(result.byOrigin[0].origin).toBe("ManyChat");
  });

  it("the origin breakdown always sums to the period total", () => {
    const result = aggregateReportData(
      baseInput({
        total: 9,
        originGroups: [
          { origin: "A", count: 2 },
          { origin: "B", count: 3 },
          { origin: null, count: 4 },
        ],
      })
    );
    expect(result.byOrigin.reduce((acc, r) => acc + r.count, 0)).toBe(9);
  });
});

describe("aggregateReportData — advisor breakdown", () => {
  it("groups leads by assigned advisor with a per-route breakdown", () => {
    const result = aggregateReportData(
      baseInput({
        total: 5,
        advisorNames: [{ id: "adv-1", name: "Ana" }, { id: "adv-2", name: "Beto" }],
        advisorRouteGroups: [
          { assignedAdvisorId: "adv-1", interestType: "PROPERTY", count: 2 },
          { assignedAdvisorId: "adv-1", interestType: "EXPLORE", count: 1 },
          { assignedAdvisorId: "adv-2", interestType: "CAMPAIGN", count: 1 },
          { assignedAdvisorId: null, interestType: "TIMEOUT", count: 1 },
        ],
      })
    );
    const ana = result.byAdvisor.find((a) => a.advisorId === "adv-1")!;
    expect(ana.advisorName).toBe("Ana");
    expect(ana.total).toBe(3);
    expect(ana.byRoute.PROPERTY).toBe(2);
    expect(ana.byRoute.EXPLORE).toBe(1);

    const unassigned = result.byAdvisor.find((a) => a.advisorId === null)!;
    expect(unassigned.advisorName).toBe("Sin asignar");
    expect(unassigned.total).toBe(1);

    expect(result.summary.advisorsWithLeads).toBe(2); // Ana + Beto, not "Sin asignar"
    expect(result.summary.assignedLeads).toBe(4); // excludes the unassigned lead
  });

  it("the advisor breakdown (including 'Sin asignar') always sums to the period total", () => {
    const result = aggregateReportData(
      baseInput({
        total: 8,
        advisorNames: [{ id: "adv-1", name: "Ana" }],
        advisorRouteGroups: [
          { assignedAdvisorId: "adv-1", interestType: "PROPERTY", count: 5 },
          { assignedAdvisorId: null, interestType: "EXPLORE", count: 3 },
        ],
      })
    );
    expect(result.byAdvisor.reduce((acc, a) => acc + a.total, 0)).toBe(8);
  });

  it("labels an advisor id with no matching Advisor row as 'Asesor eliminado'", () => {
    const result = aggregateReportData(
      baseInput({
        total: 1,
        advisorNames: [],
        advisorRouteGroups: [{ assignedAdvisorId: "gone", interestType: "PROPERTY", count: 1 }],
      })
    );
    expect(result.byAdvisor[0].advisorName).toBe("Asesor eliminado");
  });

  it("classifies assignment method events into automatic/exclusive/manual buckets", () => {
    const result = aggregateReportData(
      baseInput({
        total: 4,
        advisorNames: [{ id: "adv-1", name: "Ana" }],
        advisorRouteGroups: [{ assignedAdvisorId: "adv-1", interestType: "PROPERTY", count: 4 }],
        methodGroups: [
          { advisorId: "adv-1", method: "WEIGHTED_ROTATION", count: 2 },
          { advisorId: "adv-1", method: "DIRECT_PROPERTY_ADVISOR", count: 1 },
          { advisorId: "adv-1", method: "CAMPAIGN_DIRECT", count: 1 },
          { advisorId: "adv-1", method: "MANUAL", count: 3 },
          { advisorId: "adv-1", method: "FALLBACK", count: 1 },
        ],
      })
    );
    const ana = result.byAdvisor[0];
    expect(ana.automatic).toBe(3); // WEIGHTED_ROTATION + FALLBACK
    expect(ana.exclusive).toBe(2); // DIRECT_PROPERTY_ADVISOR + CAMPAIGN_DIRECT
    expect(ana.manual).toBe(3);
  });

  it("ignores assignment-method events for advisors with no leads in the period (defensive)", () => {
    const result = aggregateReportData(
      baseInput({
        total: 0,
        methodGroups: [{ advisorId: "ghost", method: "MANUAL", count: 1 }],
      })
    );
    expect(result.byAdvisor).toHaveLength(0);
  });
});

describe("aggregateReportData — status / pending / integration errors", () => {
  it("pendingLeads excludes terminal statuses (COMPLETED, FAILED)", () => {
    const result = aggregateReportData(
      baseInput({
        total: 10,
        statusGroups: [
          { status: "RECEIVED", count: 2 },
          { status: "ASSIGNED", count: 3 },
          { status: "COMPLETED", count: 4 },
          { status: "FAILED", count: 1 },
        ],
      })
    );
    expect(result.summary.pendingLeads).toBe(5);
    expect(result.summary.integrationErrors).toBe(1);
  });

  it("integrationErrors is zero when there are no FAILED leads", () => {
    const result = aggregateReportData(baseInput({ total: 2, statusGroups: [{ status: "COMPLETED", count: 2 }] }));
    expect(result.summary.integrationErrors).toBe(0);
  });

  it("the status breakdown always sums to the period total", () => {
    const result = aggregateReportData(
      baseInput({
        total: 6,
        statusGroups: [
          { status: "RECEIVED", count: 1 },
          { status: "COMPLETED", count: 5 },
        ],
      })
    );
    expect(result.byStatus.reduce((acc, s) => acc + s.count, 0)).toBe(6);
  });
});

describe("aggregateReportData — report total consistency", () => {
  it("route, origin, status, and advisor breakdowns all reconcile to the same total for a mixed period", () => {
    const total = 12;
    const result = aggregateReportData({
      total,
      routeGroups: [
        { interestType: "PROPERTY", count: 5 },
        { interestType: "EXPLORE", count: 4 },
        { interestType: "CAMPAIGN", count: 3 },
      ],
      originGroups: [
        { origin: "WhatsApp ManyChat", count: 8 },
        { origin: "Meta", count: 4 },
      ],
      statusGroups: [
        { status: "COMPLETED", count: 9 },
        { status: "FAILED", count: 2 },
        { status: "ASSIGNED", count: 1 },
      ],
      advisorRouteGroups: [
        { assignedAdvisorId: "adv-1", interestType: "PROPERTY", count: 5 },
        { assignedAdvisorId: "adv-2", interestType: "EXPLORE", count: 4 },
        { assignedAdvisorId: null, interestType: "CAMPAIGN", count: 3 },
      ],
      advisorNames: [{ id: "adv-1", name: "Ana" }, { id: "adv-2", name: "Beto" }],
      methodGroups: [],
      uniquePhoneCount: 10,
      statusLabel,
    });

    expect(result.byRoute.reduce((a, r) => a + r.count, 0)).toBe(total);
    expect(result.byOrigin.reduce((a, r) => a + r.count, 0)).toBe(total);
    expect(result.byStatus.reduce((a, r) => a + r.count, 0)).toBe(total);
    expect(result.byAdvisor.reduce((a, r) => a + r.total, 0)).toBe(total);
    expect(result.summary.total).toBe(total);
  });
});
