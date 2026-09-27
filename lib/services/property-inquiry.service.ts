import "server-only";
import { prisma } from "@/lib/db";
import { mexicoCityDateKey } from "@/lib/timezone";

/** Métodos de identificación, de mayor a menor certeza (no se degrada uno ya registrado). */
const METHOD_RANK: Record<string, number> = {
  code_in_message: 10,
  code_in_url: 9,
  easybroker_link: 9,
  portal_listing: 8,
  portal_page_code: 8,
  internal_code: 7,
  lead_property_code: 7,
  confirmed_candidate: 5,
  handoff: 5,
  get_property: 3,
};

export interface InquiryInput {
  companyId: string;
  publicId: string;
  /** Teléfono E.164 o, si no hay, `mc:<subscriberId>`. */
  contactKey: string;
  conversationId?: string | null;
  leadId?: string | null;
  method: string;
  evidence?: string | null;
  linkPortal?: string | null;
  declaredSource?: string | null;
  acquisitionSource?: string | null;
  messageCount: number;
  source: "assistant" | "lead_webhook";
  isTest: boolean;
  at?: Date;
}

export function contactKeyFor(input: { phone: string | null; manyChatSubscriberId: string }): string {
  return input.phone || `mc:${input.manyChatSubscriberId}`;
}

/**
 * Registra (o suma a) la consulta de un contacto por una propiedad en el
 * día de Ciudad de México. Idempotente por (contacto, propiedad, día):
 * cinco mensajes el mismo día siguen siendo UNA consulta; los reportes
 * cuentan contactos distintos por periodo.
 */
export async function recordPropertyInquiry(input: InquiryInput): Promise<void> {
  const at = input.at ?? new Date();
  const day = mexicoCityDateKey(at);
  const publicId = input.publicId.toUpperCase();
  const where = { companyId_publicId_contactKey_day: { companyId: input.companyId, publicId, contactKey: input.contactKey, day } };
  const existing = await prisma.propertyInquiry.findUnique({ where });
  const evidence = input.evidence?.slice(0, 500) ?? null;
  if (!existing) {
    try {
      await prisma.propertyInquiry.create({
        data: {
          companyId: input.companyId,
          publicId,
          contactKey: input.contactKey,
          day,
          conversationId: input.conversationId ?? null,
          leadId: input.leadId ?? null,
          method: input.method,
          evidence,
          linkPortal: input.linkPortal ?? null,
          declaredSource: input.declaredSource?.slice(0, 200) ?? null,
          acquisitionSource: input.acquisitionSource?.slice(0, 200) ?? null,
          messageCount: Math.max(1, input.messageCount),
          source: input.source,
          isTest: input.isTest,
          firstAt: at,
          lastAt: at,
        },
      });
      return;
    } catch {
      // Carrera con otro registro del mismo día: se suma abajo.
    }
  }
  const current = existing ?? (await prisma.propertyInquiry.findUnique({ where }));
  if (!current) return;
  const better = (METHOD_RANK[input.method] ?? 0) > (METHOD_RANK[current.method] ?? 0);
  await prisma.propertyInquiry.update({
    where: { id: current.id },
    data: {
      messageCount: { increment: Math.max(0, input.messageCount) },
      lastAt: at,
      ...(better ? { method: input.method, evidence } : {}),
      ...(!current.leadId && input.leadId ? { leadId: input.leadId } : {}),
      ...(!current.conversationId && input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(!current.linkPortal && input.linkPortal ? { linkPortal: input.linkPortal } : {}),
      ...(!current.declaredSource && input.declaredSource ? { declaredSource: input.declaredSource.slice(0, 200) } : {}),
      ...(!current.acquisitionSource && input.acquisitionSource ? { acquisitionSource: input.acquisitionSource.slice(0, 200) } : {}),
    },
  });
}

/** Nunca rompe el flujo que la llama: una métrica perdida es mejor que un mensaje sin responder. */
export async function recordPropertyInquirySafe(input: InquiryInput): Promise<void> {
  try {
    await recordPropertyInquiry(input);
  } catch (error) {
    console.error("[INQUIRY] no se pudo registrar la consulta", input.publicId, error instanceof Error ? error.message : error);
  }
}
