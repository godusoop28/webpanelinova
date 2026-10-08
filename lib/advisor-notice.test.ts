import { describe, expect, it } from "vitest";
import {
  ADVISOR_LEAD_FIELD_IDS,
  TEMPLATE_BODY_LIMIT,
  TEMPLATE_STATIC_RESERVE,
  advisorNoticeBudget,
  buildAdvisorNoticeText,
  fitAdvisorLeadFields,
  type NoticeProperty,
} from "./advisor-notice";

const property: NoticeProperty = {
  public_id: "EB-AB1234",
  title: "Departamento en Santa Fe",
  property_type: "Departamento",
  location: "Santa Fe, Álvaro Obregón, Ciudad de México",
  public_url: "https://www.easybroker.com/mx/listings/departamento-en-santa-fe",
  operations: [{ type: "sale", formatted_amount: "$7,850,000 MXN" }],
  bedrooms: 3,
  bathrooms: 2,
  half_bathrooms: 1,
  parking_spaces: 2,
  construction_size: 120,
  lot_size: null,
  features: [{ name: "Alberca" }, { name: "Gimnasio" }],
  description: "<p>Hermoso departamento con vista.</p>",
};

describe("buildAdvisorNoticeText", () => {
  it("incluye la ficha completa y el enlace de EasyBroker", () => {
    const text = buildAdvisorNoticeText({ property });
    expect(text).toContain("Departamento en Santa Fe");
    expect(text).toContain("Código: EB-AB1234");
    expect(text).toContain("Precio: Venta $7,850,000 MXN");
    expect(text).toContain("3 recámara(s) · 2 y 1 medio(s) baño(s) · 2 estacionamiento(s)");
    expect(text).toContain("Construcción 120 m²");
    expect(text).toContain("Amenidades: Alberca, Gimnasio");
    expect(text).toContain("Descripción: Hermoso departamento con vista.");
    expect(text).toContain(property.public_url!);
    expect(text).not.toContain("<p>");
  });

  it("no muestra precio si la propiedad lo oculta", () => {
    expect(buildAdvisorNoticeText({ property: { ...property, show_prices: false } })).toContain("Venta (precio a consultar)");
  });

  it("agrega lo que busca el cliente sin enlaces al panel", () => {
    const text = buildAdvisorNoticeText({
      property,
      client: { reason: "Quiere agendar visita", zone: "Santa Fe", budget: "Hasta 8 MDP", summary: "Busca 3 recámaras" },
    });
    expect(text).toContain("Motivo: Quiere agendar visita");
    expect(text).toContain("Presupuesto: Hasta 8 MDP");
    expect(text).not.toMatch(/conversaciones\//);
  });

  it("sin propiedad identificada usa la referencia del cliente y sus necesidades", () => {
    const text = buildAdvisorNoticeText({ propertyData: "Casa en Zapopan que vi en Facebook", client: { operation: "Comprar", zone: "Zapopan" } });
    expect(text).toContain("Referencia que envió el cliente: Casa en Zapopan que vi en Facebook");
    expect(text).toContain("Busca: Comprar");
  });

  it("respeta el tope recortando primero la descripción y conserva el enlace", () => {
    const long = { ...property, description: "palabra ".repeat(2000) };
    const text = buildAdvisorNoticeText({ property: long, max: 900 });
    expect(text.length).toBeLessThanOrEqual(900);
    expect(text).toContain(property.public_url!);
    expect(text).toContain("…");
  });

  it("sin datos devuelve un texto neutro", () => {
    expect(buildAdvisorNoticeText({})).toBe("Sin información adicional");
  });
});

describe("límite del cuerpo de la plantilla de WhatsApp", () => {
  const others = ["Clau", "+523312288632", "Propiedad", "EB-XC6724", "https://wa.me/523312288632"];

  it("el aviso con ficha completa cabe en el presupuesto y conserva ficha y enlace", () => {
    const longProperty = { ...property, description: "Hermoso departamento con vista. ".repeat(60) };
    const budget = advisorNoticeBudget(others);
    const text = buildAdvisorNoticeText({ property: longProperty, max: budget });
    expect(text.length).toBeLessThanOrEqual(budget);
    expect(text).toContain("EB-AB1234");
    expect(text).toContain(property.public_url!);
    expect(budget + others.join("").length).toBeLessThanOrEqual(TEMPLATE_BODY_LIMIT - TEMPLATE_STATIC_RESERVE);
  });

  it("los trabajos antiguos de ~990 caracteres se recortan quitando primero la descripción", () => {
    const old = buildAdvisorNoticeText({ property: { ...property, description: "Texto largo de descripción. ".repeat(60) }, max: 1000 });
    expect(old.length).toBeGreaterThan(900);
    const fields = [
      { fieldId: ADVISOR_LEAD_FIELD_IDS.name, value: others[0] },
      { fieldId: ADVISOR_LEAD_FIELD_IDS.phone, value: others[1] },
      { fieldId: ADVISOR_LEAD_FIELD_IDS.requestType, value: others[2] },
      { fieldId: ADVISOR_LEAD_FIELD_IDS.reference, value: others[3] },
      { fieldId: ADVISOR_LEAD_FIELD_IDS.relatedInfo, value: old },
      { fieldId: ADVISOR_LEAD_FIELD_IDS.contactUrl, value: others[4] },
    ];
    const fitted = fitAdvisorLeadFields(fields);
    const related = fitted.find((f) => f.fieldId === ADVISOR_LEAD_FIELD_IDS.relatedInfo)!.value;
    expect(fitted.reduce((sum, f) => sum + f.value.length, 0)).toBeLessThanOrEqual(TEMPLATE_BODY_LIMIT - TEMPLATE_STATIC_RESERVE);
    expect(related).not.toContain("Descripción:");
    expect(related).toContain(property.public_url!);
    expect(fitted.filter((f) => f.fieldId !== ADVISOR_LEAD_FIELD_IDS.relatedInfo)).toEqual(fields.filter((f) => f.fieldId !== ADVISOR_LEAD_FIELD_IDS.relatedInfo));
  });

  it("un aviso corto no se modifica", () => {
    const fields = [{ fieldId: ADVISOR_LEAD_FIELD_IDS.relatedInfo, value: "Sin información adicional" }];
    expect(fitAdvisorLeadFields(fields)).toBe(fields);
  });
});
