import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/reporting/csv";

describe("toCsv", () => {
  it("joins rows with CRLF and cells with commas", () => {
    const csv = toCsv([
      ["Fecha", "Cliente"],
      ["2026-09-19", "Ana"],
    ]);
    expect(csv).toBe("Fecha,Cliente\r\n2026-09-19,Ana");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    const csv = toCsv([["Contiene, coma", 'Con "comillas"', "Con\nsalto"]]);
    expect(csv).toBe('"Contiene, coma","Con ""comillas""","Con\nsalto"');
  });

  it("leaves plain fields (including accented text) unquoted", () => {
    const csv = toCsv([["Campaña", "Sin respuesta"]]);
    expect(csv).toBe("Campaña,Sin respuesta");
  });

  it("neutralizes cells that Excel would run as formulas", () => {
    const csv = toCsv([["=HYPERLINK(\"http://x\")", "@SUM(A1)", "-2+3", "+cmd|x"]]);
    expect(csv).toBe(`"'=HYPERLINK(""http://x"")",'@SUM(A1),'-2+3,'+cmd|x`);
  });

  it("leaves phone numbers and negative numbers alone", () => {
    const csv = toCsv([["+5215512345678", "-15", "+52 (55) 1234-5678"]]);
    expect(csv).toBe("+5215512345678,-15,+52 (55) 1234-5678");
  });
});
