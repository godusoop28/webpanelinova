/**
 * Evaluación EN VIVO de lectura de portales contra el inventario real de
 * EasyBroker (solo lectura; sin BD ni envíos). No corre con `npm test`:
 *   EVAL_LOG=... npx vitest run --config vitest.eval.config.ts lib/conversation/listing-extract.eval.ts
 */
import fs from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
for (const line of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8").split(/\r?\n/) : []) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"|"$/g, "");
}

type Entry = { publicId: string; title: string; searchText: string; prices: number[]; bedrooms: number | null };
let catalog: Entry[] = [];

const CASES: { url: string; expect?: string; note: string }[] = [
  { url: "https://www.casasyterrenos.com/propiedad/casa-venta-coto-almendro-valle-imperial-zapopan-jal-2961585", expect: "EB-WF7156", note: "Casas y Terrenos (¿propia?)" },
  { url: "https://casa.mercadolibre.com.mx/MLM-2929767511-casa-en-venta-en-colonia-chapalita-oriente-zapopan-jalisco-_JM", note: "Mercado Libre (otra inmobiliaria)" },
  { url: "https://casa.mercadolibre.com.mx/MLM-3433148271-residencia-en-venta-y-renta-las-canadas-zapopan-_JM", expect: "EB-WP0154", note: "Mercado Libre (propia: Residencia venta y renta Las Cañadas)" },
  { url: "https://casa.mercadolibre.com.mx/MLM-3442994685-residencia-de-lujo-en-las-canadas-vista-espectacular-al-campo-de-golf-_JM", expect: "EB-VY0780", note: "Mercado Libre (propia: Residencia de lujo Las Cañadas)" },
  { url: "https://casa.mercadolibre.com.mx/MLM-2935083697-casa-en-venta-el-centinela-zapopan-_JM", note: "Mercado Libre (El Centinela, ¿propia?)" },
  { url: "https://www.vivanuncios.com.mx/a-venta-casa-en-condominio/valle-real/casa-en-venta-en-novaterra-frente-a-valle-real/149338977", note: "Vivanuncios (otra inmobiliaria, trae EB-)" },
  { url: "https://www.inmuebles24.com/propiedades/clasificado/veclcain-casa-de-lujo-en-venta-en-puerta-de-hierro-62228645.html", note: "Inmuebles24 (bloquea → palabras del enlace)" },
  { url: "https://www.lamudi.com.mx/detalle/41032-73-b7157b6aa9e0-b4c4-40e695f6-8b86-3b31", note: "Lamudi (bloquea, enlace sin palabras)" },
];

beforeAll(async () => {
  const { listPublishedPropertiesPage } = await import("@/lib/services/easybroker.service");
  const { normalizeSearchText } = await import("@/lib/conversation/property-reference");
  const pages = [await listPublishedPropertiesPage(1, 50), await listPublishedPropertiesPage(2, 50)];
  catalog = pages.flatMap((p) => p.content).map((p) => ({
    publicId: p.public_id,
    title: p.title,
    bedrooms: p.bedrooms ?? null,
    prices: (p.operations ?? []).map((o) => o.amount ?? 0).filter((a) => a > 0),
    searchText: normalizeSearchText([p.public_id, p.title, p.property_type, p.location].join(" ")),
  }));
}, 60_000);

describe("portales reales → inventario real", { timeout: 60_000 }, () => {
  for (const testCase of CASES) {
    it(testCase.note, async () => {
      const { extractListingInfo, slugKeywords, matchListingToCatalog } = await import("@/lib/conversation/listing-extract");
      const response = await fetch(testCase.url, { headers: { "user-agent": "Century21InovaAssistant/1.0 (+identificacion de propiedades)" } }).catch(() => null);
      const html = response?.ok ? await response.text() : null;
      const info = html ? extractListingInfo(html) : { title: slugKeywords(testCase.url), description: null, price: null, currency: null, location: null, bedrooms: null, codes: [] };
      const { matches, confidence } = matchListingToCatalog(info, catalog);
      const log = [
        `\n== ${testCase.note} (HTTP ${response?.status ?? "error"})`,
        `   anuncio: ${info.title} | ${info.price ?? "—"} | ${info.location ?? "—"} | rec ${info.bedrooms ?? "—"} | códigos ${info.codes.join(",") || "—"}`,
        `   confianza: ${confidence}; candidatas: ${matches.map((m) => `${m.property.publicId} (${m.score.toFixed(1)}, precio ${m.priceMatch})`).join(" · ") || "ninguna"}`,
      ].join("\n");
      console.log(log);
      if (process.env.EVAL_LOG) fs.appendFileSync(process.env.EVAL_LOG, log + "\n");
      if (testCase.expect && html) expect(matches[0]?.property.publicId).toBe(testCase.expect);
      if (!testCase.expect) expect(confidence).not.toBe("high");
    });
  }
});
