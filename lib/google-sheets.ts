import "server-only";
import { google } from "googleapis";
import { unstable_cache } from "next/cache";
import { env, hasGoogleSheetsCredentials } from "@/lib/env";
import { DEMO_ADVISORS, DEMO_LEADS, DEMO_MAKE_EVENTS, DEMO_USERS } from "@/lib/demo-data";
import type { Role } from "@/lib/permissions";

const DEMO_MODE_ERROR =
  "Modo demostración: configura la cuenta de servicio de Google Sheets para guardar cambios reales.";

const LEAD_SHEET = "'Hoja 1'";
const ADVISOR_SHEET = "Asesores";
const USERS_SHEET = "Usuarios";
const MAKE_EVENTS_SHEET = "EventosMake";

function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: env.google.clientEmail,
    key: env.google.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function readRange(range: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.google.spreadsheetId,
    range,
  });
  return (response.data.values as string[][] | undefined) ?? [];
}

async function appendRow(range: string, row: (string | number)[]): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: env.google.spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

async function updateRow(range: string, row: (string | number)[]): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.google.spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

const cell = (row: string[], index: number): string => row[index]?.trim() ?? "";

// ---------------------------------------------------------------------------
// Leads (Hoja 1)
// ---------------------------------------------------------------------------

export interface LeadRow {
  rowNumber: number;
  fechaHora: string;
  nombre: string;
  telefono: string;
  tipoInteres: string;
  datoEnviado: string;
  origen: string;
  ruta: string;
  estadoEasyBroker: string;
  linkWhatsappCliente: string;
  asesorAsignado: string;
  observaciones: string;
  idAsesorAsignado: string;
  whatsappAsesorAsignado: string;
  fechaAsignacion: string;
  tipoAsignacion: string;
  estadoEnvioAsesor: string;
  observacionAsignacion: string;
}

function mapLeadRow(row: string[], index: number): LeadRow {
  return {
    rowNumber: index + 2, // header occupies row 1
    fechaHora: cell(row, 0),
    nombre: cell(row, 1),
    telefono: cell(row, 2),
    tipoInteres: cell(row, 3),
    datoEnviado: cell(row, 4),
    origen: cell(row, 5),
    ruta: cell(row, 6),
    estadoEasyBroker: cell(row, 7),
    linkWhatsappCliente: cell(row, 8),
    asesorAsignado: cell(row, 9),
    observaciones: cell(row, 10),
    idAsesorAsignado: cell(row, 11),
    whatsappAsesorAsignado: cell(row, 12),
    fechaAsignacion: cell(row, 13),
    tipoAsignacion: cell(row, 14),
    estadoEnvioAsesor: cell(row, 15),
    observacionAsignacion: cell(row, 16),
  };
}

async function fetchLeadRows(): Promise<LeadRow[]> {
  if (!hasGoogleSheetsCredentials()) return DEMO_LEADS;
  const rows = await readRange(`${LEAD_SHEET}!A2:Q`);
  return rows.filter((row) => row.some((value) => value?.trim())).map(mapLeadRow);
}

export const getLeadRows = unstable_cache(fetchLeadRows, ["leads"], {
  revalidate: 60,
  tags: ["leads"],
});

// ---------------------------------------------------------------------------
// Asesores
// ---------------------------------------------------------------------------

export interface AdvisorRow {
  rowNumber: number;
  id: string;
  nombre: string;
  whatsapp: string;
  rol: string;
  activo: boolean;
  tipoAsignacion: string;
  emailEasyBroker: string;
  manyChatId: string;
}

function mapAdvisorRow(row: string[], index: number): AdvisorRow {
  return {
    rowNumber: index + 2,
    id: cell(row, 0),
    nombre: cell(row, 1),
    whatsapp: cell(row, 2),
    rol: cell(row, 3),
    activo: cell(row, 4).toLowerCase() === "true" || cell(row, 4).toLowerCase() === "sí" || cell(row, 4).toLowerCase() === "si",
    tipoAsignacion: cell(row, 5),
    emailEasyBroker: cell(row, 6),
    manyChatId: cell(row, 7),
  };
}

async function fetchAdvisorRows(): Promise<AdvisorRow[]> {
  if (!hasGoogleSheetsCredentials()) return DEMO_ADVISORS;
  const rows = await readRange(`${ADVISOR_SHEET}!A2:H`);
  return rows.filter((row) => row.some((value) => value?.trim())).map(mapAdvisorRow);
}

export const getAdvisorRows = unstable_cache(fetchAdvisorRows, ["advisors"], {
  revalidate: 300,
  tags: ["advisors"],
});

// ---------------------------------------------------------------------------
// Usuarios (autenticación / autorización)
// ---------------------------------------------------------------------------

export interface AuthorizedUser {
  rowNumber: number;
  nombre: string;
  correo: string;
  rol: Role;
  activo: boolean;
}

function parseRole(value: string): Role {
  const normalized = value.trim().toUpperCase();
  if (normalized === "ADMIN" || normalized === "DIRECCION" || normalized === "CONSULTA") {
    return normalized;
  }
  return "CONSULTA";
}

function mapUserRow(row: string[], index: number): AuthorizedUser {
  return {
    rowNumber: index + 2,
    nombre: cell(row, 0),
    correo: cell(row, 1).toLowerCase(),
    rol: parseRole(cell(row, 2)),
    activo: cell(row, 3).toLowerCase() === "true" || cell(row, 3).toLowerCase() === "sí" || cell(row, 3).toLowerCase() === "si",
  };
}

async function fetchAuthorizedUsers(): Promise<AuthorizedUser[]> {
  if (!hasGoogleSheetsCredentials()) return DEMO_USERS;
  const rows = await readRange(`${USERS_SHEET}!A2:D`);
  return rows.filter((row) => row.some((value) => value?.trim())).map(mapUserRow);
}

export const getAuthorizedUsers = unstable_cache(fetchAuthorizedUsers, ["authorized-users"], {
  revalidate: 60,
  tags: ["authorized-users"],
});

export async function addAuthorizedUser(input: {
  nombre: string;
  correo: string;
  rol: Role;
  activo: boolean;
}): Promise<void> {
  if (!hasGoogleSheetsCredentials()) throw new Error(DEMO_MODE_ERROR);
  await appendRow(`${USERS_SHEET}!A:D`, [
    input.nombre,
    input.correo.toLowerCase(),
    input.rol,
    input.activo ? "TRUE" : "FALSE",
  ]);
}

export async function updateAuthorizedUser(
  rowNumber: number,
  input: { nombre: string; correo: string; rol: Role; activo: boolean }
): Promise<void> {
  if (!hasGoogleSheetsCredentials()) throw new Error(DEMO_MODE_ERROR);
  await updateRow(`${USERS_SHEET}!A${rowNumber}:D${rowNumber}`, [
    input.nombre,
    input.correo.toLowerCase(),
    input.rol,
    input.activo ? "TRUE" : "FALSE",
  ]);
}

export async function toggleAuthorizedUser(rowNumber: number, activo: boolean): Promise<void> {
  if (!hasGoogleSheetsCredentials()) throw new Error(DEMO_MODE_ERROR);
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.google.spreadsheetId,
    range: `${USERS_SHEET}!D${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[activo ? "TRUE" : "FALSE"]] },
  });
}

// ---------------------------------------------------------------------------
// EventosMake
// ---------------------------------------------------------------------------

export interface MakeEventRow {
  rowNumber: number;
  fecha: string;
  escenario: string;
  evento: string;
  estado: string;
  lead: string;
  telefono: string;
  propiedad: string;
  asesor: string;
  mensaje: string;
  ejecucionId: string;
}

function mapMakeEventRow(row: string[], index: number): MakeEventRow {
  return {
    rowNumber: index + 2,
    fecha: cell(row, 0),
    escenario: cell(row, 1),
    evento: cell(row, 2),
    estado: cell(row, 3),
    lead: cell(row, 4),
    telefono: cell(row, 5),
    propiedad: cell(row, 6),
    asesor: cell(row, 7),
    mensaje: cell(row, 8),
    ejecucionId: cell(row, 9),
  };
}

async function fetchMakeEvents(): Promise<MakeEventRow[]> {
  if (!hasGoogleSheetsCredentials()) return DEMO_MAKE_EVENTS;
  const rows = await readRange(`${MAKE_EVENTS_SHEET}!A2:J`);
  return rows.filter((row) => row.some((value) => value?.trim())).map(mapMakeEventRow).reverse();
}

export const getMakeEvents = unstable_cache(fetchMakeEvents, ["make-events"], {
  revalidate: 60,
  tags: ["make-events"],
});

export async function appendMakeEvent(input: {
  fecha: string;
  escenario: string;
  evento: string;
  estado: string;
  lead?: string;
  telefono?: string;
  propiedad?: string;
  asesor?: string;
  mensaje?: string;
  ejecucionId?: string;
}): Promise<void> {
  if (!hasGoogleSheetsCredentials()) throw new Error(DEMO_MODE_ERROR);
  await appendRow(`${MAKE_EVENTS_SHEET}!A:J`, [
    input.fecha,
    input.escenario,
    input.evento,
    input.estado,
    input.lead ?? "",
    input.telefono ?? "",
    input.propiedad ?? "",
    input.asesor ?? "",
    input.mensaje ?? "",
    input.ejecucionId ?? "",
  ]);
}
