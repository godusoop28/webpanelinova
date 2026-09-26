import { describe, expect, it } from "vitest";
import { buildInboundDedupeKey, computeProcessAfter, isBurstReady } from "@/lib/conversation/burst";
import {
  extractEasyBrokerCodes,
  extractUrls,
  listingSlugFromPublicUrl,
  parsePropertyUrl,
  scoreProperties,
  normalizeSearchText,
} from "@/lib/conversation/property-reference";
import { claimsAssignment, computeMissingFacts, decideCommercialHandoff, mergeFacts } from "@/lib/conversation/policy";
import { FinalOutputSchema, FINAL_OUTPUT_JSON_SCHEMA, OPENAI_TOOLS, TOOL_ARG_SCHEMAS } from "@/lib/conversation/assistant-contract";
import { checkFetchableUrl, isPrivateAddress } from "@/lib/url-safety";

const settings = { debounceSeconds: 6, maxWaitSeconds: 25 };

describe("ráfagas de mensajes", () => {
  it("cinco mensajes seguidos se agrupan: cada uno empuja la espera", () => {
    const t0 = new Date("2026-09-26T12:00:00Z");
    let burstStartedAt: Date | null = null;
    let processAfter: Date | null = null;
    for (let i = 0; i < 5; i++) {
      const now = new Date(t0.getTime() + i * 2000);
      const result = computeProcessAfter({ now, burstStartedAt, settings });
      burstStartedAt = result.burstStartedAt;
      processAfter = result.processAfter;
      // Mientras siguen llegando mensajes (cada 2 s < 6 s) no está lista.
      expect(isBurstReady(processAfter, new Date(now.getTime() + 1999))).toBe(false);
    }
    expect(processAfter!.getTime()).toBe(t0.getTime() + 8000 + 6000);
    expect(burstStartedAt!.getTime()).toBe(t0.getTime());
  });

  it("una ráfaga continua no pospone indefinidamente: tope maxWait", () => {
    const t0 = new Date("2026-09-26T12:00:00Z");
    const result = computeProcessAfter({ now: new Date(t0.getTime() + 24_000), burstStartedAt: t0, settings });
    expect(result.processAfter.getTime()).toBe(t0.getTime() + 25_000);
  });

  it("dedupe: la reentrega del mismo evento coincide, un 'sí' repetido más tarde no", () => {
    const a = buildInboundDedupeKey({ subscriberId: "1", text: "Sí", interactionAt: "2026-09-26T12:00:01Z" });
    const retry = buildInboundDedupeKey({ subscriberId: "1", text: " sí ", interactionAt: "2026-09-26T12:00:01Z" });
    const later = buildInboundDedupeKey({ subscriberId: "1", text: "Sí", interactionAt: "2026-09-26T12:00:09Z" });
    expect(a).toBe(retry);
    expect(later).not.toBe(a);
  });

  it("sin ID ni marca de tiempo no deduplica (no se pierden mensajes legítimos)", () => {
    expect(buildInboundDedupeKey({ subscriberId: "1", text: "hola" })).toBeNull();
    expect(buildInboundDedupeKey({ subscriberId: "1", text: "hola", messageId: "wamid.X" })).toBe("id:wamid.X");
  });
});

describe("referencias a propiedades", () => {
  it("extrae y normaliza códigos EasyBroker escritos a mano", () => {
    expect(extractEasyBrokerCodes("me interesa la eb-up5131 y la EB WE0782, y EB-UP5131")).toEqual(["EB-UP5131", "EB-WE0782"]);
    expect(extractEasyBrokerCodes("¡Hola! Quiero más información de EB-XB2547\nCasa frente al Lago")).toEqual(["EB-XB2547"]);
    expect(extractEasyBrokerCodes("sin codigo aqui")).toEqual([]);
  });

  it("detecta enlaces y clasifica los de EasyBroker", () => {
    const urls = extractUrls("mira https://www.easybroker.com/listings/casa-frente-al-campo-de-golf-en-las-canadas, gracias");
    expect(urls).toEqual(["https://www.easybroker.com/listings/casa-frente-al-campo-de-golf-en-las-canadas"]);
    expect(parsePropertyUrl(urls[0])).toEqual({ kind: "easybroker_listing", slug: "casa-frente-al-campo-de-golf-en-las-canadas" });
    expect(parsePropertyUrl("https://portal.example.com/inmueble/EB-AB1234")).toEqual({ kind: "easybroker_code", code: "EB-AB1234" });
    expect(parsePropertyUrl("https://www.inmuebles24.com/propiedades/casa-123.html")).toEqual({ kind: "other", hostname: "inmuebles24.com" });
    expect(listingSlugFromPublicUrl("https://www.easybroker.com/mx/listings/depa-centro")).toBe("depa-centro");
  });

  it("la búsqueda local prioriza el título y entiende abreviaturas", () => {
    const properties = [
      { publicId: "EB-1", title: "Casa frente al campo de golf en Las Cañadas", searchText: normalizeSearchText("Casa Las Cañadas Zapopan venta") },
      { publicId: "EB-2", title: "Departamento en Venta en Vía del Bosque", searchText: normalizeSearchText("Departamento Puerta del Bosque Zapopan venta") },
    ];
    expect(scoreProperties("el depa de via del bosque", properties)[0].property.publicId).toBe("EB-2");
    expect(scoreProperties("casa en las cañadas", properties)[0].property.publicId).toBe("EB-1");
    expect(scoreProperties("hola", properties)).toEqual([]);
  });
});

describe("reglas de canalización", () => {
  const base = { secondaryIntents: [], verifiedPropertyId: null, trigger: "assistant" as const, fromCampaign: false };

  it("proveedor y gerencia nunca entran a la ruleta, ni por abandono", () => {
    expect(decideCommercialHandoff({ ...base, primaryIntent: "PROVIDER" }).allowed).toBe(false);
    expect(decideCommercialHandoff({ ...base, primaryIntent: "PROVIDER", trigger: "abandonment" }).allowed).toBe(false);
    expect(decideCommercialHandoff({ ...base, primaryIntent: "MANAGEMENT" }).allowed).toBe(false);
  });

  it("solo 'Hola' (desconocido) no se canaliza", () => {
    expect(decideCommercialHandoff({ ...base, primaryIntent: "UNKNOWN" }).allowed).toBe(false);
    expect(decideCommercialHandoff({ ...base, primaryIntent: "UNKNOWN", trigger: "abandonment" }).allowed).toBe(false);
  });

  it("propiedad verificada → ruta Propiedad; con código de campaña → Campaña", () => {
    expect(decideCommercialHandoff({ ...base, primaryIntent: "PROPERTY_INQUIRY", verifiedPropertyId: "EB-AB1234" })).toEqual({
      allowed: true,
      interesCliente: "Propiedad",
      datosPropiedad: "EB-AB1234",
    });
    expect(decideCommercialHandoff({ ...base, primaryIntent: "PROPERTY_INQUIRY", verifiedPropertyId: "EB-AB1234", fromCampaign: true })).toMatchObject({
      interesCliente: "Campaña",
    });
  });

  it("vender mi casa es cliente inmobiliario (Explorar); abandono con interés → Timeout", () => {
    expect(decideCommercialHandoff({ ...base, primaryIntent: "SELL" })).toMatchObject({ allowed: true, interesCliente: "Explorar" });
    expect(decideCommercialHandoff({ ...base, primaryIntent: "RENT", trigger: "abandonment" })).toMatchObject({ interesCliente: "Timeout" });
  });

  it("colaboración de asesor externo: solo con propiedad verificada", () => {
    expect(decideCommercialHandoff({ ...base, primaryIntent: "AGENT_COLLABORATION" }).allowed).toBe(false);
    expect(decideCommercialHandoff({ ...base, primaryIntent: "AGENT_COLLABORATION", verifiedPropertyId: "EB-AB1234" }).allowed).toBe(true);
  });

  it("proveedor que además quiere comprar sí puede canalizarse por la necesidad inmobiliaria", () => {
    expect(decideCommercialHandoff({ ...base, primaryIntent: "PROVIDER", secondaryIntents: ["BUY"] }).allowed).toBe(true);
  });
});

describe("datos recopilados", () => {
  it("corrección reemplaza, 'unknown' no borra y 'declined' se respeta", () => {
    let facts = mergeFacts({}, { operation: { value: "compra", status: "known" }, budget_max: { value: null, status: "declined" } });
    facts = mergeFacts(facts, { operation: { value: "renta", status: "known" }, zone: { value: null, status: "unknown" } });
    expect(facts.operation).toEqual({ value: "renta", status: "known" });
    expect(facts.budget_max).toEqual({ value: null, status: "declined" });
    expect(facts.zone).toBeUndefined();
    // Un dato rechazado no vuelve a aparecer como faltante.
    expect(computeMissingFacts("RENT", facts)).toEqual(["zone", "property_type", "bedrooms"]);
  });

  it("detecta afirmaciones de asignación para que el backend las contraste", () => {
    expect(claimsAssignment("Listo, ya te asigné con Laura, te contactará pronto")).toBe(true);
    expect(claimsAssignment("¿En qué zona te gustaría rentar?")).toBe(false);
  });
});

describe("contrato con el modelo", () => {
  it("cada herramienta tiene esquema estricto y validador", () => {
    for (const tool of OPENAI_TOOLS) {
      expect(tool.strict).toBe(true);
      expect(TOOL_ARG_SCHEMAS[tool.name]).toBeDefined();
      expect(tool.parameters.additionalProperties).toBe(false);
    }
    expect(FINAL_OUTPUT_JSON_SCHEMA.required.length).toBe(Object.keys(FINAL_OUTPUT_JSON_SCHEMA.properties).length);
  });

  it("rechaza argumentos fuera de contrato (p. ej. elegir asesor)", () => {
    const parsed = TOOL_ARG_SCHEMAS.request_commercial_handoff.safeParse({ intent: "PROVIDER", reason: "x", property_public_id: null });
    expect(parsed.success).toBe(false);
  });

  it("valida la salida final", () => {
    const facts = Object.fromEntries(
      ["name", "operation", "property_type", "zone", "budget_min", "budget_max", "currency", "bedrooms", "timeframe", "own_property_location", "financing", "notes"].map((k) => [
        k,
        { value: null, status: "unknown" },
      ])
    );
    const ok = FinalOutputSchema.safeParse({
      reply: "Hola",
      primary_intent: "UNKNOWN",
      secondary_intents: [],
      facts,
      property_ids: [],
      summary: "",
      asked_clarification: true,
      made_progress: false,
    });
    expect(ok.success).toBe(true);
    expect(FinalOutputSchema.safeParse({ reply: "x" }).success).toBe(false);
  });
});

describe("seguridad de enlaces (SSRF)", () => {
  it("bloquea destinos privados, locales y de metadatos", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress("104.18.1.1")).toBe(false);
  });

  it("solo HTTPS, sin credenciales ni puertos raros, y solo dominios permitidos", () => {
    const allowed = ["easybroker.com"];
    expect(checkFetchableUrl("https://www.easybroker.com/listings/x", allowed).ok).toBe(true);
    expect(checkFetchableUrl("http://www.easybroker.com/listings/x", allowed).ok).toBe(false);
    expect(checkFetchableUrl("https://user:pw@easybroker.com/", allowed).ok).toBe(false);
    expect(checkFetchableUrl("https://easybroker.com:8443/", allowed).ok).toBe(false);
    expect(checkFetchableUrl("https://easybroker.com.evil.io/", allowed).ok).toBe(false);
    expect(checkFetchableUrl("https://169.254.169.254/latest", allowed).ok).toBe(false);
  });
});
