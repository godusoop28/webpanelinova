/**
 * Texto del aviso de nuevo lead que recibe el asesor por WhatsApp (campo
 * "relatedInfo" del flujo de ManyChat). Puro: sin red ni base de datos.
 *
 * Objetivo: que el asesor tenga TODO en el mismo mensaje (ficha de la
 * propiedad con su enlace de EasyBroker y lo que busca el cliente), sin
 * tener que entrar al panel. Solo datos públicos de la propiedad: nunca
 * correo/teléfono del agente, comisiones, notas privadas ni dirección exacta.
 */

export interface NoticeOperation {
  type?: string;
  formatted_amount?: string;
}

export interface NoticeProperty {
  public_id: string;
  title?: string | null;
  property_type?: string | null;
  location?: string | null;
  public_url?: string | null;
  operations?: NoticeOperation[] | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  half_bathrooms?: number | null;
  parking_spaces?: number | null;
  construction_size?: number | null;
  lot_size?: number | null;
  features?: { name?: string }[] | null;
  description?: string | null;
  show_prices?: boolean | null;
}

export interface NoticeClientContext {
  reason?: string | null;
  operation?: string | null;
  zone?: string | null;
  budget?: string | null;
  additionalNeeds?: string[];
  summary?: string | null;
  /** Otras propiedades que el cliente mencionó en la conversación. */
  otherProperties?: { publicId: string; title?: string | null; url?: string | null }[];
}

/**
 * Tope por defecto del texto. Lo que no cabe es la parte final de la
 * descripción, nunca la ficha ni el enlace. Para el aviso real manda
 * advisorNoticeBudget(): el límite es del cuerpo completo de la plantilla.
 */
export const ADVISOR_NOTICE_MAX = 1000;

// Campos usados por el flow de ManyChat "Aviso asesor nuevo lead".
// Estos IDs corresponden a la cuenta actual de Century 21 Inova.
export const ADVISOR_LEAD_FIELD_IDS = {
  name: 14780313,
  phone: 14780314,
  requestType: 14780316,
  relatedInfo: 14780317,
  reference: 14780318,
  contactUrl: 14780319,
} as const;

/**
 * WhatsApp rechaza una plantilla cuyo cuerpo, YA con las variables
 * sustituidas, pasa de 1024 caracteres. El flujo del asesor mete todos los
 * campos en el mismo mensaje más su texto fijo, que no se conoce desde aquí:
 * se reserva margen para él. Con la ficha completa (~990 caracteres solo en
 * relatedInfo) todos los avisos de propiedad empezaron a fallar con HTTP 400.
 */
export const TEMPLATE_BODY_LIMIT = 1024;
export const TEMPLATE_STATIC_RESERVE = 300;
const MIN_RELATED_INFO = 250;

/** Caracteres disponibles para relatedInfo según lo que ocupan los demás campos. */
export function advisorNoticeBudget(otherValues: string[]): number {
  const used = otherValues.reduce((sum, value) => sum + value.length, 0);
  return Math.max(MIN_RELATED_INFO, TEMPLATE_BODY_LIMIT - TEMPLATE_STATIC_RESERVE - used);
}

/** Recorta un aviso ya armado: primero quita la descripción, luego recorta el final. */
export function shrinkNoticeText(text: string, max: number): string {
  if (text.length <= max) return text;
  const withoutDescription = text
    .split("\n")
    .filter((line) => !line.startsWith("Descripción: "))
    .join("\n");
  return withoutDescription.length <= max ? withoutDescription : truncate(withoutDescription, max);
}

/**
 * Ajusta los campos del aviso al presupuesto de la plantilla. Se aplica
 * también a trabajos antiguos de la cola, cuyo texto se armó con el tope
 * anterior. Solo toca relatedInfo; los demás campos se envían tal cual.
 */
export function fitAdvisorLeadFields<T extends { fieldId: number; value: string }>(fields: T[]): T[] {
  const related = fields.find((field) => field.fieldId === ADVISOR_LEAD_FIELD_IDS.relatedInfo);
  if (!related) return fields;
  const budget = advisorNoticeBudget(fields.filter((field) => field !== related).map((field) => field.value));
  if (related.value.length <= budget) return fields;
  return fields.map((field) => (field === related ? { ...field, value: shrinkNoticeText(field.value, budget) } : field));
}

const OPERATION_LABELS: Record<string, string> = { sale: "Venta", rental: "Renta", temporary_rental: "Renta temporal" };

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("es-MX", { maximumFractionDigits: 1 });
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return "";
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function operationsLine(property: NoticeProperty): string | null {
  const operations = (property.operations ?? []).filter((op) => op.type || op.formatted_amount);
  if (operations.length === 0) return null;
  const hidePrices = property.show_prices === false;
  return operations
    .map((op) => {
      const label = OPERATION_LABELS[op.type ?? ""] ?? op.type ?? "Operación";
      return hidePrices || !op.formatted_amount ? `${label} (precio a consultar)` : `${label} ${op.formatted_amount}`;
    })
    .join(" · ");
}

/** Líneas de la ficha técnica (sin la descripción, que se agrega aparte según el espacio). */
export function propertySheetLines(property: NoticeProperty): string[] {
  const baths =
    property.bathrooms != null
      ? `${formatNumber(property.bathrooms)}${property.half_bathrooms ? ` y ${formatNumber(property.half_bathrooms)} medio(s)` : ""} baño(s)`
      : null;
  const rooms = [
    property.bedrooms != null ? `${formatNumber(property.bedrooms)} recámara(s)` : null,
    baths,
    property.parking_spaces != null ? `${formatNumber(property.parking_spaces)} estacionamiento(s)` : null,
  ].filter(Boolean);
  const sizes = [
    property.construction_size ? `Construcción ${formatNumber(property.construction_size)} m²` : null,
    property.lot_size ? `Terreno ${formatNumber(property.lot_size)} m²` : null,
  ].filter(Boolean);
  const features = (property.features ?? [])
    .map((feature) => feature.name?.trim())
    .filter((name): name is string => Boolean(name))
    .slice(0, 12);

  return [
    "*🏠 PROPIEDAD DE INTERÉS*",
    property.title ? `*${cleanText(property.title)}*` : null,
    `Código: ${property.public_id}`,
    property.property_type ? `Tipo: ${property.property_type}` : null,
    operationsLine(property) ? `Precio: ${operationsLine(property)}` : null,
    property.location ? `Ubicación: ${property.location}` : null,
    rooms.length ? rooms.join(" · ") : null,
    sizes.length ? sizes.join(" · ") : null,
    features.length ? `Amenidades: ${features.join(", ")}` : null,
  ].filter((line): line is string => Boolean(line));
}

function clientLines(context: NoticeClientContext): string[] {
  const lines = [
    context.reason ? `Motivo: ${context.reason}` : null,
    context.operation ? `Busca: ${context.operation}` : null,
    context.zone ? `Zona: ${context.zone}` : null,
    context.budget ? `Presupuesto: ${context.budget}` : null,
    context.additionalNeeds?.length ? `También le interesa: ${context.additionalNeeds.join(", ")}` : null,
    context.summary ? `Resumen: ${cleanText(context.summary)}` : null,
  ].filter((line): line is string => Boolean(line));
  const others = (context.otherProperties ?? []).slice(0, 4).map((p) => `• ${p.publicId}${p.title ? ` ${cleanText(p.title)}` : ""}${p.url ? `\n  ${p.url}` : ""}`);
  if (others.length) lines.push("Otras propiedades que mencionó:", ...others);
  return lines.length ? ["*👤 LO QUE BUSCA EL CLIENTE*", ...lines] : [];
}

/**
 * Arma el texto completo. Prioridad cuando no cabe: ficha y enlace de
 * EasyBroker siempre; luego lo que busca el cliente; la descripción se
 * recorta al final con el espacio que sobre.
 */
export function buildAdvisorNoticeText(input: {
  property?: NoticeProperty | null;
  /** Texto que dio el cliente cuando no hay propiedad identificada (código, enlace, campaña…). */
  propertyData?: string | null;
  client?: NoticeClientContext | null;
  max?: number;
}): string {
  const max = input.max ?? ADVISOR_NOTICE_MAX;
  const blocks: string[] = [];

  const property = input.property;
  const sheet = property ? propertySheetLines(property).join("\n") : null;
  const link = property?.public_url ? `🔗 Ficha en EasyBroker:\n${property.public_url}` : property ? `Ficha en EasyBroker: ${property.public_id} (sin enlace público)` : null;
  const client = input.client ? clientLines(input.client).join("\n") : "";
  const fallback = !property && input.propertyData?.trim() ? `Referencia que envió el cliente: ${cleanText(input.propertyData)}` : null;

  const fixed = [sheet, link, client || null, fallback].filter((block): block is string => Boolean(block));
  const fixedLength = fixed.join("\n\n").length;

  const description = property?.description ? cleanText(property.description) : "";
  const room = max - fixedLength - "\n\nDescripción: ".length - 2;
  const descriptionBlock = description && room > 80 ? `Descripción: ${truncate(description, room)}` : null;

  if (sheet) blocks.push(descriptionBlock ? `${sheet}\n${descriptionBlock}` : sheet);
  if (link) blocks.push(link);
  if (client) blocks.push(client);
  if (fallback) blocks.push(fallback);
  if (blocks.length === 0) blocks.push("Sin información adicional");

  const text = blocks.join("\n\n");
  return text.length <= max ? text : truncate(text, max);
}
