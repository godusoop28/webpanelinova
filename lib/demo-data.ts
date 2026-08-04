import "server-only";
import type { AdvisorRow, AuthorizedUser, LeadRow, MakeEventRow } from "@/lib/google-sheets";

/**
 * Shown instead of real Google Sheets data whenever the service account
 * env vars aren't configured yet, so the panel can be demoed end-to-end
 * before Sheets access is wired up. See hasGoogleSheetsCredentials in
 * lib/env.ts for the gate that decides when this kicks in.
 */

function daysAgo(days: number, hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const ADVISOR_NAMES = [
  "Mariana Torres",
  "Luis Fernando Gómez",
  "Karla Jiménez",
  "Roberto Salinas",
  "Daniela Cruz",
];

export const DEMO_ADVISORS: AdvisorRow[] = [
  { rowNumber: 2, id: "2", nombre: ADVISOR_NAMES[0], whatsapp: "5215512345671", rol: "Asesor", activo: true, tipoAsignacion: "Ambas", emailEasyBroker: "mariana@c21inova.com", manyChatId: "1000000001" },
  { rowNumber: 3, id: "3", nombre: ADVISOR_NAMES[1], whatsapp: "5215512345672", rol: "Asesor", activo: true, tipoAsignacion: "Aleatoria", emailEasyBroker: "luis@c21inova.com", manyChatId: "1000000002" },
  { rowNumber: 4, id: "4", nombre: ADVISOR_NAMES[2], whatsapp: "5215512345673", rol: "Coordinadora", activo: true, tipoAsignacion: "Ambas", emailEasyBroker: "karla@c21inova.com", manyChatId: "1000000003" },
  { rowNumber: 5, id: "5", nombre: ADVISOR_NAMES[3], whatsapp: "5215512345674", rol: "Asesor", activo: false, tipoAsignacion: "Exclusiva", emailEasyBroker: "roberto@c21inova.com", manyChatId: "1000000004" },
  { rowNumber: 6, id: "6", nombre: ADVISOR_NAMES[4], whatsapp: "5215512345675", rol: "Asesor", activo: true, tipoAsignacion: "Aleatoria", emailEasyBroker: "daniela@c21inova.com", manyChatId: "1000000005" },
];

const ORIGINS = ["Facebook Ads", "Instagram", "Google Ads", "WhatsApp orgánico", "Referido"];

interface LeadSeed {
  daysAgo: number;
  hour: number;
  minute: number;
  nombre: string;
  telefono: string;
  tipoInteres: "Propiedad" | "Explorar" | "Campaña";
  origen: string;
  ruta: string;
  advisorIndex: number;
  tipoAsignacion: "Exclusiva" | "Aleatoria";
  estadoEnvioAsesor: "Enviado" | "Pendiente" | "Error";
}

const LEAD_SEEDS: LeadSeed[] = [
  { daysAgo: 0, hour: 10, minute: 15, nombre: "Ana Beltrán", telefono: "5219981112233", tipoInteres: "Propiedad", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorIndex: 0, tipoAsignacion: "Exclusiva", estadoEnvioAsesor: "Enviado" },
  { daysAgo: 0, hour: 16, minute: 40, nombre: "Jorge Nava", telefono: "5219981112234", tipoInteres: "Explorar", origen: ORIGINS[3], ruta: "Explorar opciones", advisorIndex: 1, tipoAsignacion: "Aleatoria", estadoEnvioAsesor: "Pendiente" },
  { daysAgo: 1, hour: 9, minute: 5, nombre: "Paola Ríos", telefono: "5219981112235", tipoInteres: "Campaña", origen: ORIGINS[1], ruta: "Campaña propiedad", advisorIndex: 2, tipoAsignacion: "Aleatoria", estadoEnvioAsesor: "Enviado" },
  { daysAgo: 2, hour: 13, minute: 22, nombre: "Marco Estrada", telefono: "5219981112236", tipoInteres: "Propiedad", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorIndex: 0, tipoAsignacion: "Exclusiva", estadoEnvioAsesor: "Enviado" },
  { daysAgo: 3, hour: 11, minute: 50, nombre: "Sofía Delgado", telefono: "5219981112237", tipoInteres: "Explorar", origen: ORIGINS[4], ruta: "Explorar opciones", advisorIndex: 4, tipoAsignacion: "Aleatoria", estadoEnvioAsesor: "Enviado" },
  { daysAgo: 4, hour: 18, minute: 10, nombre: "Iván Cordero", telefono: "5219981112238", tipoInteres: "Campaña", origen: ORIGINS[2], ruta: "Campaña propiedad", advisorIndex: 1, tipoAsignacion: "Aleatoria", estadoEnvioAsesor: "Error" },
  { daysAgo: 5, hour: 12, minute: 30, nombre: "Renata Ochoa", telefono: "5219981112239", tipoInteres: "Propiedad", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorIndex: 2, tipoAsignacion: "Exclusiva", estadoEnvioAsesor: "Enviado" },
  { daysAgo: 7, hour: 10, minute: 5, nombre: "Diego Palacios", telefono: "5219981112240", tipoInteres: "Explorar", origen: ORIGINS[3], ruta: "Explorar opciones", advisorIndex: 4, tipoAsignacion: "Aleatoria", estadoEnvioAsesor: "Enviado" },
  { daysAgo: 9, hour: 15, minute: 45, nombre: "Camila Reyes", telefono: "5219981112241", tipoInteres: "Propiedad", origen: ORIGINS[1], ruta: "Vi una propiedad", advisorIndex: 0, tipoAsignacion: "Exclusiva", estadoEnvioAsesor: "Enviado" },
  { daysAgo: 11, hour: 9, minute: 20, nombre: "Héctor Villanueva", telefono: "5219981112242", tipoInteres: "Campaña", origen: ORIGINS[2], ruta: "Campaña propiedad", advisorIndex: 1, tipoAsignacion: "Aleatoria", estadoEnvioAsesor: "Pendiente" },
  { daysAgo: 14, hour: 17, minute: 0, nombre: "Lucía Moreno", telefono: "5219981112243", tipoInteres: "Explorar", origen: ORIGINS[4], ruta: "Explorar opciones", advisorIndex: 2, tipoAsignacion: "Aleatoria", estadoEnvioAsesor: "Enviado" },
  { daysAgo: 17, hour: 12, minute: 15, nombre: "Fernando Aguilar", telefono: "5219981112244", tipoInteres: "Propiedad", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorIndex: 4, tipoAsignacion: "Exclusiva", estadoEnvioAsesor: "Enviado" },
  { daysAgo: 20, hour: 14, minute: 35, nombre: "Gabriela Solís", telefono: "5219981112245", tipoInteres: "Campaña", origen: ORIGINS[1], ruta: "Campaña propiedad", advisorIndex: 0, tipoAsignacion: "Aleatoria", estadoEnvioAsesor: "Enviado" },
  { daysAgo: 24, hour: 11, minute: 5, nombre: "Ricardo Peña", telefono: "5219981112246", tipoInteres: "Explorar", origen: ORIGINS[3], ruta: "Explorar opciones", advisorIndex: 1, tipoAsignacion: "Aleatoria", estadoEnvioAsesor: "Enviado" },
  { daysAgo: 28, hour: 16, minute: 50, nombre: "Valeria Campos", telefono: "5219981112247", tipoInteres: "Propiedad", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorIndex: 2, tipoAsignacion: "Exclusiva", estadoEnvioAsesor: "Enviado" },
];

export const DEMO_LEADS: LeadRow[] = LEAD_SEEDS.map((seed, index) => {
  const advisor = DEMO_ADVISORS[seed.advisorIndex];
  return {
    rowNumber: index + 2,
    fechaHora: daysAgo(seed.daysAgo, seed.hour, seed.minute),
    nombre: seed.nombre,
    telefono: seed.telefono,
    tipoInteres: seed.tipoInteres,
    datoEnviado: seed.tipoInteres === "Propiedad" ? "EB-DEMO-0" + ((index % 9) + 1) : "",
    origen: seed.origen,
    ruta: seed.ruta,
    estadoEasyBroker: "Creado en EasyBroker",
    linkWhatsappCliente: `https://wa.me/${seed.telefono}`,
    asesorAsignado: advisor.nombre,
    observaciones: "Lead de demostración generado automáticamente.",
    idAsesorAsignado: advisor.id,
    whatsappAsesorAsignado: advisor.whatsapp,
    fechaAsignacion: daysAgo(seed.daysAgo, seed.hour, seed.minute),
    tipoAsignacion: seed.tipoAsignacion,
    estadoEnvioAsesor: seed.estadoEnvioAsesor,
    observacionAsignacion:
      seed.tipoAsignacion === "Exclusiva"
        ? "Asesor tomado directamente desde la propiedad en EasyBroker"
        : "Asesor elegido automáticamente desde la lista activa",
  };
});

export const DEMO_USERS: AuthorizedUser[] = [
  { rowNumber: 2, nombre: "Administrador Panel", correo: "admin@c21inova.com", rol: "ADMIN", activo: true },
  { rowNumber: 3, nombre: ADVISOR_NAMES[2], correo: "karla@c21inova.com", rol: "DIRECCION", activo: true },
  { rowNumber: 4, nombre: "Recepción", correo: "recepcion@c21inova.com", rol: "CONSULTA", activo: true },
];

export const DEMO_MAKE_EVENTS: MakeEventRow[] = [
  { rowNumber: 6, fecha: daysAgo(0, 16, 41), escenario: "Leads WhatsApp → EasyBroker", evento: "Lead creado y asesor asignado", estado: "ejecutado", lead: "Jorge Nava", telefono: "5219981112234", propiedad: "", asesor: ADVISOR_NAMES[1], mensaje: "", ejecucionId: "demo-006" },
  { rowNumber: 5, fecha: daysAgo(0, 10, 16), escenario: "Leads WhatsApp → EasyBroker", evento: "Lead creado y asesor asignado", estado: "ejecutado", lead: "Ana Beltrán", telefono: "5219981112233", propiedad: "EB-DEMO-01", asesor: ADVISOR_NAMES[0], mensaje: "", ejecucionId: "demo-005" },
  { rowNumber: 4, fecha: daysAgo(1, 9, 6), escenario: "Buscar propiedades EasyBroker - búsqueda profunda", evento: "Coincidencias enviadas a ManyChat", estado: "ejecutado", lead: "Paola Ríos", telefono: "5219981112235", propiedad: "", asesor: "", mensaje: "", ejecucionId: "demo-004" },
  { rowNumber: 3, fecha: daysAgo(4, 18, 11), escenario: "Leads WhatsApp → EasyBroker", evento: "Notificación al asesor", estado: "error", lead: "Iván Cordero", telefono: "5219981112238", propiedad: "", asesor: ADVISOR_NAMES[1], mensaje: "ManyChat respondió 404 (suscriptor no encontrado)", ejecucionId: "demo-003" },
  { rowNumber: 2, fecha: daysAgo(6, 9, 0), escenario: "Sincronización manual", evento: "Disparo manual desde el panel", estado: "ejecutado", lead: "", telefono: "", propiedad: "", asesor: "admin@c21inova.com", mensaje: "", ejecucionId: "demo-002" },
];
