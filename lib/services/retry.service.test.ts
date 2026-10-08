/**
 * Cola de reintentos con dobles en memoria: ninguna llamada real a
 * ManyChat, EasyBroker ni a la base de datos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntegrationJob } from "@prisma/client";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => {
  const state = {
    jobs: new Map<string, Record<string, unknown>>(),
    seq: 0,
    lead: null as null | {
      leadId: string;
      leadStatus: string;
      assignedAdvisorId: string | null;
      assignedAdvisorName: string | null;
      assignedAdvisorSubscriberId: string | null;
      assignment: { id: string; advisorId: string; manyChatNotified: boolean } | null;
    },
    audit: [] as { eventType: string; status: string; message?: string }[],
    flowsSent: [] as { subscriberId: string; flowNs: string }[],
    fieldsSet: [] as { subscriberId: string }[],
    sendFlowImpl: null as null | (() => Promise<void>),
  };
  return { state };
});
const { state } = h;

vi.mock("@/lib/repositories/integration-job.repository", () => {
  const clone = (job: Record<string, unknown>) => ({ ...job }) as unknown as IntegrationJob;
  return {
    createIntegrationJob: async (data: Record<string, unknown>) => {
      const id = `job_${++h.state.seq}`;
      const job = {
        id,
        status: "PENDING",
        attempts: 0,
        lastError: null,
        errorKind: null,
        errorCode: null,
        lastAttemptAt: null,
        resolvedAt: null,
        createdAt: new Date(Date.now() + h.state.seq),
        ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
        nextRetryAt: data.nextRetryAt ?? new Date(),
      };
      h.state.jobs.set(id, job);
      return clone(job);
    },
    findDueJobs: async (now: Date) =>
      [...h.state.jobs.values()]
        .filter((job) => ["PENDING", "RETRYING"].includes(job.status as string) && (job.nextRetryAt as Date) <= now)
        .map(clone),
    claimJob: async (job: IntegrationJob, leaseUntil: Date) => {
      const current = h.state.jobs.get(job.id)!;
      if (current.status !== job.status || current.attempts !== job.attempts || (current.nextRetryAt as Date).getTime() !== job.nextRetryAt.getTime()) return false;
      current.nextRetryAt = leaseUntil;
      current.lastAttemptAt = new Date();
      return true;
    },
    markJobSucceeded: async (id: string, attempts: number) => Object.assign(h.state.jobs.get(id)!, { status: "SUCCESS", attempts, resolvedAt: new Date() }),
    markJobCancelled: async (id: string, reason: string) => Object.assign(h.state.jobs.get(id)!, { status: "CANCELLED", lastError: reason, errorKind: "SUPERSEDED" }),
    markJobFailed: async (id: string, outcome: Record<string, unknown>) => {
      const job = h.state.jobs.get(id)!;
      Object.assign(job, { ...outcome, nextRetryAt: outcome.nextRetryAt ?? job.nextRetryAt });
      return job;
    },
  };
});

vi.mock("@/lib/repositories/lead.repository", () => ({ updateLead: vi.fn(), createLead: vi.fn() }));
vi.mock("@/lib/repositories/assignment.repository", () => ({
  updateAssignmentStatus: vi.fn(),
  findLeadNoticeState: async () => (h.state.lead ? structuredClone(h.state.lead) : null),
  markAssignmentNotified: async (leadId: string, assignmentId: string) => {
    if (h.state.lead?.assignment?.id === assignmentId) h.state.lead.assignment.manyChatNotified = true;
    if (h.state.lead?.leadStatus === "NOTIFIED") h.state.lead.leadStatus = "COMPLETED";
  },
}));
vi.mock("@/lib/services/easybroker.service", () => ({
  createContactRequest: vi.fn(),
  assignContactToAdvisor: vi.fn(),
  findRecentContactRequest: vi.fn(),
}));
vi.mock("@/lib/services/manychat.service", () => ({
  setCustomFields: async (subscriberId: string) => {
    h.state.fieldsSet.push({ subscriberId });
  },
  sendFlow: async (subscriberId: string, flowNs: string) => {
    if (h.state.sendFlowImpl) await h.state.sendFlowImpl();
    h.state.flowsSent.push({ subscriberId, flowNs });
  },
}));
vi.mock("@/lib/services/audit.service", () => ({
  logAuditEvent: async (event: { eventType: string; status: string; message?: string }) => {
    h.state.audit.push(event);
  },
}));

const { processDueIntegrationJobs, enqueueManyChatFlow, BACKOFF_MINUTES } = await import("@/lib/services/retry.service");
const { ManyChatApiError, ManyChatTimeoutError } = await import("@/lib/integrations/manychat-errors");
const easybroker = await import("@/lib/services/easybroker.service");
const leadRepo = await import("@/lib/repositories/lead.repository");
const { currentIntegrationNotice } = await import("@/lib/integration-notice");

const SEND_FLOW = "POST /fb/sending/sendFlow";
const PAYLOAD = { subscriberId: "234838306", flowNs: "content_flow", fields: [{ fieldId: 1, value: "Cliente" }], advisorId: "adv_1", assignmentId: "asg_1" };
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000 + 1000);

function job(id = "job_1") {
  return state.jobs.get(id)!;
}

beforeEach(() => {
  state.jobs.clear();
  state.seq = 0;
  state.audit = [];
  state.flowsSent = [];
  state.fieldsSet = [];
  state.sendFlowImpl = null;
  state.lead = {
    leadId: "lead_1",
    leadStatus: "NOTIFIED",
    assignedAdvisorId: "adv_1",
    assignedAdvisorName: "Asesor Uno",
    assignedAdvisorSubscriberId: "234838306",
    assignment: { id: "asg_1", advisorId: "adv_1", manyChatNotified: false },
  };
  vi.clearAllMocks();
});

describe("aviso al asesor que falla con el lead ya asignado", () => {
  it("HTTP 200 con error en el cuerpo queda FAILED con su código, sin reintentos ni notificación confirmada", async () => {
    await enqueueManyChatFlow("co", "lead_1", PAYLOAD, new ManyChatApiError(200, "OK", { status: "error", message: "Flow not found" }, SEND_FLOW));
    expect(job()).toMatchObject({ status: "FAILED", attempts: 1, errorKind: "FLOW", errorCode: "BODY_ERROR_200" });
    const summary = await processDueIntegrationJobs(later(120));
    expect(summary.processed).toBe(0);
    expect(state.flowsSent).toHaveLength(0);
    expect(state.lead!.assignment!.manyChatNotified).toBe(false);
    expect(state.lead!.assignedAdvisorId).toBe("adv_1");
  });

  it("error permanente dentro de la cola no genera reintentos infinitos", async () => {
    await enqueueManyChatFlow("co", "lead_1", PAYLOAD, new ManyChatApiError(503, "Service Unavailable", null, SEND_FLOW));
    expect(job().status).toBe("RETRYING");
    state.sendFlowImpl = async () => {
      throw new ManyChatApiError(400, "Bad Request", { status: "error", message: "Subscriber is out of the 24 hour window" }, SEND_FLOW);
    };
    const summary = await processDueIntegrationJobs(later(2));
    expect(summary).toMatchObject({ processed: 1, failed: 1, rescheduled: 0 });
    expect(job()).toMatchObject({ status: "FAILED", attempts: 2, errorKind: "CHANNEL", errorCode: "HTTP_400" });
    expect((await processDueIntegrationJobs(later(600))).processed).toBe(0);
  });

  it("error temporal se reintenta con espera progresiva y se agota con límite", async () => {
    await enqueueManyChatFlow("co", "lead_1", PAYLOAD, new ManyChatApiError(502, "Bad Gateway", null, SEND_FLOW));
    state.sendFlowImpl = async () => {
      throw new ManyChatApiError(502, "Bad Gateway", null, SEND_FLOW);
    };
    let runs = 0;
    while (job().status === "RETRYING" && runs < 20) {
      await processDueIntegrationJobs(later(24 * 60 * (runs + 1)));
      runs += 1;
    }
    expect(job().status).toBe("FAILED");
    expect(job().attempts).toBe(BACKOFF_MINUTES.length + 1);
    expect(runs).toBe(BACKOFF_MINUTES.length);
  });

  it("respeta Retry-After cuando pide esperar más que el backoff", async () => {
    const before = Date.now();
    await enqueueManyChatFlow("co", "lead_1", PAYLOAD, new ManyChatApiError(429, "Too Many Requests", null, SEND_FLOW, 10 * 60_000));
    expect(job().status).toBe("RETRYING");
    expect((job().nextRetryAt as Date).getTime()).toBeGreaterThanOrEqual(before + 10 * 60_000);
  });

  it("timeout del envío queda UNCERTAIN y no se reintenta solo", async () => {
    await enqueueManyChatFlow("co", "lead_1", PAYLOAD, new ManyChatApiError(503, "x", null, SEND_FLOW));
    state.sendFlowImpl = async () => {
      throw new ManyChatTimeoutError(SEND_FLOW, 10000);
    };
    const summary = await processDueIntegrationJobs(later(2));
    expect(summary.uncertain).toBe(1);
    expect(job()).toMatchObject({ status: "UNCERTAIN", errorKind: "TIMEOUT" });
    expect((await processDueIntegrationJobs(later(600))).processed).toBe(0);
  });

  it("dos workers simultáneos no ejecutan el mismo trabajo", async () => {
    await enqueueManyChatFlow("co", "lead_1", PAYLOAD, new ManyChatApiError(503, "x", null, SEND_FLOW));
    state.sendFlowImpl = () => new Promise((resolve) => setTimeout(resolve, 20));
    const [a, b] = await Promise.all([processDueIntegrationJobs(later(2)), processDueIntegrationJobs(later(2))]);
    expect(a.processed + b.processed).toBe(1);
    expect(state.flowsSent).toHaveLength(1);
  });
});

describe("recuperación", () => {
  it("ejecuta solo el paso pendiente: sin nuevo lead, sin ruleta, sin EasyBroker y sin duplicar el aviso", async () => {
    await enqueueManyChatFlow("co", "lead_1", PAYLOAD, new ManyChatApiError(503, "x", null, SEND_FLOW));
    const summary = await processDueIntegrationJobs(later(2));
    expect(summary).toMatchObject({ processed: 1, succeeded: 1 });
    expect(state.fieldsSet).toHaveLength(1); // campos de ESTE lead antes del flow
    expect(state.flowsSent).toEqual([{ subscriberId: "234838306", flowNs: "content_flow" }]);
    expect(state.lead).toMatchObject({ assignedAdvisorId: "adv_1", leadStatus: "COMPLETED", assignment: { manyChatNotified: true } });
    expect(job()).toMatchObject({ status: "SUCCESS", attempts: 2 });
    expect(leadRepo.createLead).not.toHaveBeenCalled();
    expect(leadRepo.updateLead).not.toHaveBeenCalled();
    expect(easybroker.createContactRequest).not.toHaveBeenCalled();
    expect(easybroker.assignContactToAdvisor).not.toHaveBeenCalled();

    // Un trabajo confirmado no vuelve a correr, y otro aviso del mismo lead se descarta.
    await enqueueManyChatFlow("co", "lead_1", PAYLOAD, new ManyChatApiError(503, "x", null, SEND_FLOW));
    const again = await processDueIntegrationJobs(later(600));
    expect(again).toMatchObject({ processed: 1, cancelled: 1, succeeded: 0 });
    expect(state.flowsSent).toHaveLength(1);
  });

  it("si el lead cambió de asesor, el aviso al asesor anterior se descarta", async () => {
    await enqueueManyChatFlow("co", "lead_1", PAYLOAD, new ManyChatApiError(503, "x", null, SEND_FLOW));
    state.lead = { ...state.lead!, assignedAdvisorId: "adv_2", assignedAdvisorSubscriberId: "999", assignment: { id: "asg_2", advisorId: "adv_2", manyChatNotified: false } };
    const summary = await processDueIntegrationJobs(later(2));
    expect(summary.cancelled).toBe(1);
    expect(state.flowsSent).toHaveLength(0);
    expect(state.lead.assignedAdvisorId).toBe("adv_2");
  });

  it("falta de flujo configurado queda visible como configuración pendiente", async () => {
    const { ManyChatConfigError } = await import("@/lib/integrations/manychat-errors");
    await enqueueManyChatFlow("co", "lead_1", { ...PAYLOAD, flowNs: "" }, new ManyChatConfigError("MANYCHAT_ADVISOR_FLOW_ID", "Falta MANYCHAT_ADVISOR_FLOW_ID"));
    expect(job()).toMatchObject({ status: "FAILED", errorKind: "CONFIG", errorCode: "CONFIG_MANYCHAT_ADVISOR_FLOW_ID" });
    const notice = currentIntegrationNotice([job() as never]);
    expect(notice?.title).toBe("Requiere revisar la configuración");
  });

  it("el aviso del panel desaparece al recuperarse, sin borrar el historial", async () => {
    await enqueueManyChatFlow("co", "lead_1", PAYLOAD, new ManyChatApiError(503, "x", null, SEND_FLOW));
    expect(currentIntegrationNotice([job() as never])?.title).toBe("Reintento programado");
    await processDueIntegrationJobs(later(2));
    expect(currentIntegrationNotice([job() as never])).toBeNull();
    expect(state.audit.some((e) => e.eventType === "RETRY_SCHEDULED")).toBe(true);
    expect(state.audit.at(-1)).toMatchObject({ eventType: "MANYCHAT_NOTIFICATION_SENT", status: "ok" });
  });
});
