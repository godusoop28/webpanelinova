/** Pure CSV serialization — no DB, no request, unit-testable in isolation. */

// Lead names come straight from WhatsApp, so a client can type
// =HYPERLINK(...) and have Excel run it when the report is opened
// (CSV/formula injection). Plain phone numbers like +5215512345678 are
// harmless as a "formula" and stay untouched so they don't show a stray '.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?[\d\s().-]+$/;

function neutralizeFormula(value: string): string {
  if (FORMULA_TRIGGER.test(value) && !PLAIN_NUMBER.test(value)) return `'${value}`;
  return value;
}

function escapeCsvField(raw: string): string {
  const value = neutralizeFormula(raw);
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

/** Excel (esp. on Windows) needs a UTF-8 BOM to not mangle accented characters like "Campaña". */
export const UTF8_BOM = "﻿";
