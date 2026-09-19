/** Pure CSV serialization — no DB, no request, unit-testable in isolation. */
function escapeCsvField(value: string): string {
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
