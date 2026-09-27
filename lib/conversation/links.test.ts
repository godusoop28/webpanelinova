import { describe, expect, it } from "vitest";
import {
  canonicalizeUrl,
  extractUrls,
  parsePropertyUrl,
  portalListingKeyFromUrl,
  portalOfHost,
} from "@/lib/conversation/property-reference";

describe("enlaces que pega el cliente", () => {
  it("B: enlace como primer mensaje, sin saludo, y dentro de un texto", () => {
    expect(extractUrls("https://www.inmuebles24.com/propiedades/clasificado/veclcain-casa-150952267.html")).toHaveLength(1);
    expect(extractUrls("Hola, me interesa esta: https://casa.mercadolibre.com.mx/MLM-5337096612-casa-_JM. ¿sigue disponible?")).toEqual([
      "https://casa.mercadolibre.com.mx/MLM-5337096612-casa-_JM",
    ]);
  });

  it("dominios de portal pegados sin https://", () => {
    expect(extractUrls("vi esta inmuebles24.com/propiedades/clasificado/-150952267.html gracias")).toEqual([
      "https://inmuebles24.com/propiedades/clasificado/-150952267.html",
    ]);
  });

  it("quita parámetros de rastreo y el fragmento; conserva lo que identifica", () => {
    expect(canonicalizeUrl("https://casa.mercadolibre.com.mx/MLM-5337096612-casa-_JM?utm_source=fb&fbclid=abc#position=3&search_layout=grid")).toBe(
      "https://casa.mercadolibre.com.mx/MLM-5337096612-casa-_JM"
    );
    expect(canonicalizeUrl("http://www.easybroker.com/mx/listings/casa-x?utm_medium=wa&id=5")).toBe("https://www.easybroker.com/mx/listings/casa-x?id=5");
  });

  it("desenvuelve redirecciones conocidas (l.facebook.com, google.com/url)", () => {
    const wrapped = `https://l.facebook.com/l.php?u=${encodeURIComponent("https://www.inmuebles24.com/propiedades/clasificado/-150952267.html?utm_campaign=x")}&h=AT0`;
    expect(canonicalizeUrl(wrapped)).toBe("https://www.inmuebles24.com/propiedades/clasificado/-150952267.html");
    expect(canonicalizeUrl(`https://www.google.com/url?q=${encodeURIComponent("https://www.easybroker.com/listings/casa-y")}&sa=D`)).toBe(
      "https://www.easybroker.com/listings/casa-y"
    );
  });

  it("código EB- en la URL gana aunque venga con rastreo o envuelto", () => {
    expect(parsePropertyUrl("https://portal.example.com/inmueble/EB-AB1234?fbclid=1")).toEqual({ kind: "easybroker_code", code: "EB-AB1234" });
  });
});

describe("clave del anuncio por portal (cruce con /property_integrations de EasyBroker)", () => {
  it("formatos reales reportados por EasyBroker", () => {
    expect(portalListingKeyFromUrl("https://www.inmuebles24.com/preview/propiedades/clasificado/-150952267.html", "150952267")).toEqual({
      portal: "inmuebles24",
      externalKey: "150952267",
    });
    expect(portalListingKeyFromUrl("https://casa.mercadolibre.com.mx/MLM-5337096612-casa-frente-al-campo-de-golf-en-las-canadas-_JM")).toEqual({
      portal: "mercado_libre",
      externalKey: "MLM5337096612",
    });
    expect(portalListingKeyFromUrl("https://clasco.mx/bienesraices/propiedad/casa-frente-al-campo-de-golf-en-las-canadas_2643902")).toEqual({
      portal: "clasco",
      externalKey: "2643902",
    });
    expect(portalListingKeyFromUrl("https://www.pincali.com/inmueble/casa-frente-al-campo-de-golf-en-las-canadas")).toEqual({
      portal: "pincali",
      externalKey: "casa-frente-al-campo-de-golf-en-las-canadas",
    });
    expect(portalListingKeyFromUrl("https://mls.valoresampi.mx/properties/3213/external-properties/336862")).toEqual({ portal: "valores_ampi", externalKey: "336862" });
  });

  it("el enlace público que comparte el cliente produce la misma clave que el de EasyBroker", () => {
    // EasyBroker reporta la vista previa; el cliente comparte la ficha pública con slug.
    const reported = portalListingKeyFromUrl("https://www.inmuebles24.com/preview/propiedades/clasificado/-150952267.html", "150952267");
    const shared = portalListingKeyFromUrl("https://www.inmuebles24.com/propiedades/clasificado/veclcain-casa-frente-al-campo-de-golf-150952267.html");
    expect(shared).toEqual(reported);
    // Mercado Libre: con o sin guion y en otro subdominio.
    expect(portalListingKeyFromUrl("https://articulo.mercadolibre.com.mx/MLM5337096612")?.externalKey).toBe("MLM5337096612");
  });

  it("K: un enlace ambiguo o sin ID no produce clave (no se asocia a otra propiedad)", () => {
    expect(portalListingKeyFromUrl("https://www.inmuebles24.com/casas-en-venta-en-zapopan.html")).toBeNull();
    expect(portalListingKeyFromUrl("https://www.facebook.com/groups/casasgdl")).toBeNull();
    expect(portalListingKeyFromUrl("https://www.easybroker.com/listings/casa-x")).toBeNull();
  });

  it("identifica el portal del enlace (no la fuente de adquisición)", () => {
    expect(portalOfHost("www.inmuebles24.com")).toBe("inmuebles24");
    expect(portalOfHost("meli.la")).toBe("mercado_libre");
    expect(portalOfHost("evil-inmuebles24.com")).toBeNull();
  });
});
