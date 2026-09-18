import { describe, it, expect } from "vitest";
import { IncomingLeadWebhookSchema, PropertySearchWebhookSchema } from "@/lib/schemas";

describe("IncomingLeadWebhookSchema", () => {
  const base = {
    nombre: "Ana",
    telefono_cliente: "9981112233",
    interes_cliente: "Propiedad",
  };

  it("accepts the minimal old-style payload (no subscriber_id)", () => {
    const parsed = IncomingLeadWebhookSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("accepts titulo_propiedad and url_propiedad without rejecting the payload", () => {
    const parsed = IncomingLeadWebhookSchema.safeParse({
      ...base,
      titulo_propiedad: "Depa en Cancún",
      url_propiedad: "https://c21inova.com/EB-123",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.titulo_propiedad).toBe("Depa en Cancún");
      expect(parsed.data.url_propiedad).toBe("https://c21inova.com/EB-123");
    }
  });

  it("accepts subscriber_id or manychat_subscriber_id", () => {
    expect(IncomingLeadWebhookSchema.safeParse({ ...base, subscriber_id: "123" }).success).toBe(true);
    expect(IncomingLeadWebhookSchema.safeParse({ ...base, manychat_subscriber_id: "123" }).success).toBe(true);
  });

  it("strips unknown extra fields instead of rejecting the payload", () => {
    const parsed = IncomingLeadWebhookSchema.safeParse({ ...base, campo_que_no_conocemos: "x" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("campo_que_no_conocemos");
    }
  });

  it("rejects a payload missing nombre", () => {
    expect(
      IncomingLeadWebhookSchema.safeParse({ telefono_cliente: base.telefono_cliente, interes_cliente: base.interes_cliente })
        .success
    ).toBe(false);
  });

  it("rejects a payload missing telefono_cliente", () => {
    expect(IncomingLeadWebhookSchema.safeParse({ nombre: base.nombre, interes_cliente: base.interes_cliente }).success).toBe(
      false
    );
  });

  it("rejects a payload missing interes_cliente", () => {
    expect(IncomingLeadWebhookSchema.safeParse({ nombre: base.nombre, telefono_cliente: base.telefono_cliente }).success).toBe(
      false
    );
  });

  it("defaults datos_propiedad and origen to empty string when absent", () => {
    const parsed = IncomingLeadWebhookSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.datos_propiedad).toBe("");
      expect(parsed.data.origen).toBe("");
    }
  });
});

describe("PropertySearchWebhookSchema", () => {
  it("accepts a valid busqueda_propiedad", () => {
    expect(PropertySearchWebhookSchema.safeParse({ busqueda_propiedad: "depa en la reforma" }).success).toBe(true);
  });

  it("rejects an empty busqueda_propiedad", () => {
    expect(PropertySearchWebhookSchema.safeParse({ busqueda_propiedad: "" }).success).toBe(false);
  });

  it("rejects a missing busqueda_propiedad", () => {
    expect(PropertySearchWebhookSchema.safeParse({}).success).toBe(false);
  });
});
