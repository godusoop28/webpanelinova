import { describe, expect, it } from "vitest";
import { extractListingInfo, matchListingToCatalog, slugKeywords } from "@/lib/conversation/listing-extract";
import { normalizeSearchText } from "@/lib/conversation/property-reference";

const catalog = [
  { publicId: "EB-VY0780", title: "Residencia de Lujo en Las Cañadas – Vista Espectacular al Campo de Golf", prices: [13_900_000], bedrooms: 4 },
  { publicId: "EB-UP5131", title: "Casa frente al campo de golf en Las Cañadas", prices: [16_600_000], bedrooms: 3 },
  { publicId: "EB-WF7156", title: "Casa en Venta en Coto Almendro, Valle Imperial | Zapopan", prices: [8_300_000], bedrooms: 3 },
  { publicId: "EB-WE0782", title: "Casa en Venta Valle Imperial | Coto Austriaco", prices: [6_350_000], bedrooms: 4 },
  { publicId: "EB-WM5747", title: "Departamento Amueblado con Terraza Torre Émile | Valle Real", prices: [10_495_000], bedrooms: 2 },
  { publicId: "EB-XA3629", title: "Oliva Residence | Departamento de 3 Recámaras en Colonia Americana Venta", prices: [8_290_000], bedrooms: 3 },
  { publicId: "EB-WC5452", title: "Depto Preventa Colonia Americana | Inversión", prices: [3_089_000], bedrooms: 2 },
  { publicId: "EB-VL9039", title: "Casa en venta en Zona Centinela, Zapopan, Jal.", prices: [6_960_000], bedrooms: 3 },
].map((p) => ({ ...p, searchText: normalizeSearchText(`${p.publicId} ${p.title} Zapopan Jalisco`) }));

describe("extracción de anuncios de portales", () => {
  it("lee og:title, precio de JSON-LD, recámaras y el código EB- del contenido principal", () => {
    const html = `<html><head>
      <title>Residencia De Lujo En Las Cañadas | MercadoLibre</title>
      <meta property="og:title" content="Residencia De Lujo En Las Cañadas - $ 13,900,000">
      <meta property="og:description" content="Espectacular residencia con 4 recámaras. Clave EB-VY0780">
      <script type="application/ld+json">{"@type":"Product","name":"Residencia De Lujo En Las Cañadas","offers":{"price":13900000,"priceCurrency":"MXN"}}</script>
      <script type="application/ld+json">{"@type":"WebSite","name":"MercadoLibre"}</script>
      </head><body>Otros anuncios: EB-AA1111 EB-BB2222</body></html>`;
    const info = extractListingInfo(html);
    expect(info.title).toBe("Residencia De Lujo En Las Cañadas");
    expect(info.price).toBe(13_900_000);
    expect(info.currency).toBe("MXN");
    expect(info.bedrooms).toBe(4);
    // Los códigos de "anuncios similares" en el cuerpo no cuentan.
    expect(info.codes).toEqual(["EB-VY0780"]);
  });

  it("sin JSON-LD toma el precio del título y limpia el nombre del portal", () => {
    const info = extractListingInfo(`<meta content="Casa En Venta En Chapalita - $ 10,500,000" property="og:title"><title>Casa | Vivanuncios</title>`);
    expect(info.title).toBe("Casa En Venta En Chapalita - $ 10,500,000");
    expect(info.price).toBe(10_500_000);
  });

  it("palabras útiles de la URL cuando el portal bloquea (sin ids ni hashes)", () => {
    expect(slugKeywords("https://www.inmuebles24.com/propiedades/clasificado/veclcain-casa-de-lujo-en-venta-en-puerta-de-hierro-62228645.html")).toBe(
      "casa de lujo en venta en puerta de hierro"
    );
    expect(slugKeywords("https://www.lamudi.com.mx/detalle/41032-73-b7157b6aa9e0-b4c4-40e695f6-8b86-3b31")).toBe("");
    expect(slugKeywords("https://casa.mercadolibre.com.mx/MLM-3442994685-residencia-de-lujo-en-las-canadas-_JM")).toBe(
      "residencia de lujo en las canadas"
    );
  });
});

describe("cruce con el inventario", () => {
  it("anuncio propio: confianza alta por nombre/zona + precio exacto", () => {
    const { matches, confidence } = matchListingToCatalog(
      { title: "Residencia De Lujo En Las Cañadas Vista Espectacular Al Campo De Golf", description: null, location: null, price: 13_900_000, bedrooms: null },
      catalog
    );
    expect(matches[0].property.publicId).toBe("EB-VY0780");
    expect(confidence).toBe("high");
  });

  it("anuncio de otra inmobiliaria en una colonia que no manejamos: baja, aunque el precio se parezca", () => {
    const { confidence } = matchListingToCatalog(
      { title: "Casa En Venta En Colonia Chapalita Oriente, Zapopan, Jalisco", description: "Amplia terraza y alberca", location: null, price: 10_500_000, bedrooms: null },
      catalog
    );
    expect(confidence).toBe("low");
  });

  it("'valle real' no se confunde con 'valle imperial' y el tipo cuenta", () => {
    const { matches } = matchListingToCatalog(
      { title: "Coto Almendro Valle Imperial casa", description: null, location: null, price: null, bedrooms: null },
      catalog
    );
    expect(matches[0].property.publicId).toBe("EB-WF7156");
    const real = matchListingToCatalog({ title: "Departamento en Valle Real", description: null, location: null, price: null, bedrooms: null }, catalog);
    expect(real.matches[0].property.publicId).toBe("EB-WM5747");
  });

  it("precio muy distinto baja la confianza aunque la zona coincida", () => {
    const { confidence } = matchListingToCatalog(
      { title: "Casa En Venta - El Centinela, Zapopan", description: null, location: null, price: 26_900_000, bedrooms: null },
      catalog
    );
    expect(confidence).toBe("low");
  });
});
