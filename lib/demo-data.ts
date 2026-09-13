import "server-only";
import type { AdvisorRow, AuthorizedUser, LeadRow, MakeEventRow } from "@/lib/google-sheets";

/**
 * Shown instead of real Google Sheets data whenever DEMO_MODE is active (see
 * isDemoModeActive in lib/env.ts), so the panel can be reviewed end-to-end
 * before Sheets access is wired up. The advisor roster mirrors the real
 * "Asesores" sheet's names, roles and tipoAsignacion (so the team looks like
 * the real one); WhatsApp/email/ManyChat ID are fictional placeholders
 * rather than the advisors' real personal contact details, and fields the
 * sheet doesn't track yet (peso, rutas, pausas, límite diario) use neutral
 * defaults rather than invented per-person differences. Leads use fictional
 * people but the same routes, origins and assignment patterns seen in the
 * real "Hoja 1" sheet.
 */

function daysAgo(days: number, hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

interface AdvisorSeedInput {
  id: string;
  nombre: string;
  rol: string;
  tipoAsignacion: string;
}

interface AdvisorSeed extends AdvisorSeedInput {
  whatsapp: string;
  emailEasyBroker: string;
  manyChatId: string;
}

const ACCENTS: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n",
};

/** Fictional placeholder contact details, keyed by the advisor's position in the list (1-based). */
function fakeWhatsapp(seq: number): string {
  return `521331950${String(seq).padStart(4, "0")}`;
}
function fakeManyChatId(seq: number): string {
  return String(3000000000 + seq);
}
function fakeEmail(nombre: string): string {
  const slug = nombre
    .toLowerCase()
    .replace(/[áéíóúñ]/g, (ch) => ACCENTS[ch] ?? ch)
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .join(".");
  return `${slug}@c21inova.com`;
}

const ADVISOR_SEEDS: AdvisorSeed[] = ([
  { id: "1", nombre: "Agustin S.", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "2", nombre: "Juan José", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "3", nombre: "Araceli Gutierrez", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "4", nombre: "Arthur Santoyo", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "5", nombre: "Gabriel Correa", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "6", nombre: "Jonathan Ramirez", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "7", nombre: "Ricardo Gomez", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "8", nombre: "Rocio Berenice Mora", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "9", nombre: "Sandra Macias", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "10", nombre: "Viridiana García", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "11", nombre: "José Manuel Carrillo", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "12", nombre: "Anahi Lopez", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "13", nombre: "Jonathan Paredes", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "14", nombre: "Roberto Arriola", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "15", nombre: "Guadalupe Poy", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "17", nombre: "Alejandro Pérez", rol: "Asesor", tipoAsignacion: "Rotación" },
  { id: "18", nombre: "Gabriela Rosas Noriega", rol: "Gerente", tipoAsignacion: "Exclusiva" },
  { id: "19", nombre: "Hector Moro", rol: "Administrador", tipoAsignacion: "Exclusiva" },
  { id: "20", nombre: "Farid Lopez", rol: "Administrador", tipoAsignacion: "Exclusiva" },
  { id: "99", nombre: "Century 21 Inova", rol: "Comodín", tipoAsignacion: "Comodín" },
] as AdvisorSeedInput[]).map((seed, index) => ({
  ...seed,
  whatsapp: fakeWhatsapp(index + 1),
  emailEasyBroker: fakeEmail(seed.nombre),
  manyChatId: fakeManyChatId(index + 1),
}));

export const DEMO_ADVISORS: AdvisorRow[] = ADVISOR_SEEDS.map((seed, index) => ({
  rowNumber: index + 2,
  id: seed.id,
  nombre: seed.nombre,
  whatsapp: seed.whatsapp,
  rol: seed.rol,
  activo: true,
  tipoAsignacion: seed.tipoAsignacion,
  emailEasyBroker: seed.emailEasyBroker,
  manyChatId: seed.manyChatId,
  peso: 5,
  rutasPermitidas: [],
  pausadoHasta: null,
  limiteDiario: null,
  observaciones: "",
}));

function advisorByName(nombre: string): AdvisorRow {
  const advisor = DEMO_ADVISORS.find((a) => a.nombre === nombre);
  if (!advisor) throw new Error(`Demo advisor not found: ${nombre}`);
  return advisor;
}

const ORIGINS = ["WhatsApp_ManyChat", "Campaña Meta"];

interface LeadSeed {
  daysAgo: number;
  hour: number;
  minute: number;
  nombre: string;
  telefono: string;
  tipoInteres: "Propiedad" | "Explorar" | "Campaña";
  datoEnviado: string;
  origen: string;
  ruta: "Vi una propiedad" | "Explorar opciones" | "Campaña propiedad";
  advisorNombre: string;
  tipoAsignacion: "Exclusiva" | "Aleatoria";
  estadoEasyBroker: "Creado en EasyBroker" | "Creado y asignado en EasyBroker";
  estadoEnvioAsesor: "Pendiente" | "Asignado" | "Error";
  observacionAsignacion: string;
}

const LEAD_SEEDS: LeadSeed[] = [
  { daysAgo: 0, hour: 9, minute: 12, nombre: "Ana Beltrán", telefono: "5219981112201", tipoInteres: "Propiedad", datoEnviado: "EB-WN8585", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorNombre: "José Manuel Carrillo", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor elegido automáticamente desde la lista activa" },
  { daysAgo: 0, hour: 11, minute: 40, nombre: "Jorge Nava", telefono: "5219981112202", tipoInteres: "Campaña", datoEnviado: "¡Hola! Quiero más información: EB-VY0780 Residencia de Lujo en Las Cañadas", origen: ORIGINS[1], ruta: "Campaña propiedad", advisorNombre: "Hector Moro", tipoAsignacion: "Exclusiva", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor tomado directamente desde la propiedad en EasyBroker" },
  { daysAgo: 0, hour: 16, minute: 5, nombre: "Paola Ríos", telefono: "5219981112203", tipoInteres: "Explorar", datoEnviado: "Renta de departamento con dos recámaras", origen: ORIGINS[0], ruta: "Explorar opciones", advisorNombre: "Juan José", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado y asignado en EasyBroker", estadoEnvioAsesor: "Asignado", observacionAsignacion: "Asesor de ruleta asignado y confirmado en EasyBroker" },
  { daysAgo: 1, hour: 10, minute: 22, nombre: "Marco Estrada", telefono: "5219981112204", tipoInteres: "Propiedad", datoEnviado: "EB-WE0782", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorNombre: "Araceli Gutierrez", tipoAsignacion: "Exclusiva", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor tomado directamente desde la propiedad en EasyBroker" },
  { daysAgo: 1, hour: 13, minute: 48, nombre: "Sofía Delgado", telefono: "5219981112205", tipoInteres: "Campaña", datoEnviado: "¡Hola! Quiero más información: EB-VY0780 Residencia de Lujo en Las Cañadas", origen: ORIGINS[1], ruta: "Campaña propiedad", advisorNombre: "Hector Moro", tipoAsignacion: "Exclusiva", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor tomado directamente desde la propiedad en EasyBroker" },
  { daysAgo: 2, hour: 9, minute: 30, nombre: "Iván Cordero", telefono: "5219981112206", tipoInteres: "Explorar", datoEnviado: "Busca casa con estacionamiento para 2 autos", origen: ORIGINS[0], ruta: "Explorar opciones", advisorNombre: "Guadalupe Poy", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado y asignado en EasyBroker", estadoEnvioAsesor: "Error", observacionAsignacion: "ManyChat respondió 404 (suscriptor no encontrado)" },
  { daysAgo: 2, hour: 17, minute: 15, nombre: "Renata Ochoa", telefono: "5219981112207", tipoInteres: "Propiedad", datoEnviado: "EB-VM6607", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorNombre: "Alejandro Pérez", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor elegido automáticamente desde la lista activa" },
  { daysAgo: 3, hour: 12, minute: 5, nombre: "Diego Palacios", telefono: "5219981112208", tipoInteres: "Campaña", datoEnviado: "Quiero más información de: EB-WO4942 Depto en ICONIA Hard Rock GDL", origen: ORIGINS[1], ruta: "Campaña propiedad", advisorNombre: "Farid Lopez", tipoAsignacion: "Exclusiva", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor tomado directamente desde la propiedad en EasyBroker" },
  { daysAgo: 3, hour: 19, minute: 40, nombre: "Camila Reyes", telefono: "5219981112209", tipoInteres: "Explorar", datoEnviado: "Interesada en terreno para construir", origen: ORIGINS[0], ruta: "Explorar opciones", advisorNombre: "Sandra Macias", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado y asignado en EasyBroker", estadoEnvioAsesor: "Asignado", observacionAsignacion: "Asesor de ruleta asignado y confirmado en EasyBroker" },
  { daysAgo: 4, hour: 8, minute: 55, nombre: "Héctor Villanueva", telefono: "5219981112210", tipoInteres: "Propiedad", datoEnviado: "EB-WC5462", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorNombre: "Rocio Berenice Mora", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor elegido automáticamente desde la lista activa" },
  { daysAgo: 4, hour: 15, minute: 20, nombre: "Lucía Moreno", telefono: "5219981112211", tipoInteres: "Campaña", datoEnviado: "¡Hola! Quiero más información: EB-VY0780 Residencia de Lujo en Las Cañadas", origen: ORIGINS[1], ruta: "Campaña propiedad", advisorNombre: "Hector Moro", tipoAsignacion: "Exclusiva", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor tomado directamente desde la propiedad en EasyBroker" },
  { daysAgo: 5, hour: 10, minute: 10, nombre: "Fernando Aguilar", telefono: "5219981112212", tipoInteres: "Explorar", datoEnviado: "Renta de loft con estacionamiento", origen: ORIGINS[0], ruta: "Explorar opciones", advisorNombre: "Viridiana García", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado y asignado en EasyBroker", estadoEnvioAsesor: "Asignado", observacionAsignacion: "Asesor de ruleta asignado y confirmado en EasyBroker" },
  { daysAgo: 5, hour: 18, minute: 35, nombre: "Gabriela Solís", telefono: "5219981112213", tipoInteres: "Propiedad", datoEnviado: "EB-WN8585", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorNombre: "Anahi Lopez", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor elegido automáticamente desde la lista activa" },
  { daysAgo: 6, hour: 9, minute: 50, nombre: "Ricardo Peña", telefono: "5219981112214", tipoInteres: "Campaña", datoEnviado: "Quiero más información de: EB-WC5462 Terreno Milpillas", origen: ORIGINS[1], ruta: "Campaña propiedad", advisorNombre: "Gabriela Rosas Noriega", tipoAsignacion: "Exclusiva", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor tomado directamente desde la propiedad en EasyBroker" },
  { daysAgo: 6, hour: 16, minute: 25, nombre: "Valeria Campos", telefono: "5219981112215", tipoInteres: "Explorar", datoEnviado: "Busca casa cerca de zona escolar", origen: ORIGINS[0], ruta: "Explorar opciones", advisorNombre: "Jonathan Paredes", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado y asignado en EasyBroker", estadoEnvioAsesor: "Asignado", observacionAsignacion: "Asesor de ruleta asignado y confirmado en EasyBroker" },
  { daysAgo: 7, hour: 11, minute: 15, nombre: "Andrea Salcedo", telefono: "5219981112216", tipoInteres: "Propiedad", datoEnviado: "EB-VM6607", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorNombre: "Roberto Arriola", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor elegido automáticamente desde la lista activa" },
  { daysAgo: 8, hour: 14, minute: 0, nombre: "Omar Rivera", telefono: "5219981112217", tipoInteres: "Campaña", datoEnviado: "¡Hola! Quiero más información: EB-VY0780 Residencia de Lujo en Las Cañadas", origen: ORIGINS[1], ruta: "Campaña propiedad", advisorNombre: "Hector Moro", tipoAsignacion: "Exclusiva", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor tomado directamente desde la propiedad en EasyBroker" },
  { daysAgo: 9, hour: 10, minute: 45, nombre: "Brenda Cortés", telefono: "5219981112218", tipoInteres: "Explorar", datoEnviado: "Ninguna de las propiedades mostradas coincide, solicita apoyo de asesor", origen: ORIGINS[0], ruta: "Explorar opciones", advisorNombre: "Ricardo Gomez", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor elegido automáticamente desde la lista activa" },
  { daysAgo: 10, hour: 17, minute: 30, nombre: "Cristian Núñez", telefono: "5219981112219", tipoInteres: "Propiedad", datoEnviado: "EB-WE0782", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorNombre: "Gabriel Correa", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado y asignado en EasyBroker", estadoEnvioAsesor: "Asignado", observacionAsignacion: "Asesor de ruleta asignado y confirmado en EasyBroker" },
  { daysAgo: 12, hour: 9, minute: 5, nombre: "Daniela Cruz", telefono: "5219981112220", tipoInteres: "Campaña", datoEnviado: "Quiero más información de: EB-WO4942 Depto en ICONIA Hard Rock GDL", origen: ORIGINS[1], ruta: "Campaña propiedad", advisorNombre: "Farid Lopez", tipoAsignacion: "Exclusiva", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor tomado directamente desde la propiedad en EasyBroker" },
  { daysAgo: 13, hour: 13, minute: 20, nombre: "Luis Fernando Gómez", telefono: "5219981112221", tipoInteres: "Explorar", datoEnviado: "Renta de casa con jardín", origen: ORIGINS[0], ruta: "Explorar opciones", advisorNombre: "Agustin S.", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado y asignado en EasyBroker", estadoEnvioAsesor: "Asignado", observacionAsignacion: "Asesor de ruleta asignado y confirmado en EasyBroker" },
  { daysAgo: 14, hour: 8, minute: 40, nombre: "Karla Jiménez", telefono: "5219981112222", tipoInteres: "Propiedad", datoEnviado: "EB-WN8585", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorNombre: "Jonathan Ramirez", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor elegido automáticamente desde la lista activa" },
  { daysAgo: 15, hour: 16, minute: 55, nombre: "Mariana Torres", telefono: "5219981112223", tipoInteres: "Campaña", datoEnviado: "¡Hola! Quiero más información: EB-VY0780 Residencia de Lujo en Las Cañadas", origen: ORIGINS[1], ruta: "Campaña propiedad", advisorNombre: "Hector Moro", tipoAsignacion: "Exclusiva", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor tomado directamente desde la propiedad en EasyBroker" },
  { daysAgo: 16, hour: 11, minute: 10, nombre: "Roberto Salinas", telefono: "5219981112224", tipoInteres: "Explorar", datoEnviado: "Busca departamento amueblado", origen: ORIGINS[0], ruta: "Explorar opciones", advisorNombre: "José Manuel Carrillo", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado y asignado en EasyBroker", estadoEnvioAsesor: "Asignado", observacionAsignacion: "Asesor de ruleta asignado y confirmado en EasyBroker" },
  { daysAgo: 18, hour: 9, minute: 25, nombre: "Paulina Reséndiz", telefono: "5219981112225", tipoInteres: "Propiedad", datoEnviado: "EB-VM6607", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorNombre: "Anahi Lopez", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor elegido automáticamente desde la lista activa" },
  { daysAgo: 19, hour: 15, minute: 0, nombre: "Emiliano Vargas", telefono: "5219981112226", tipoInteres: "Campaña", datoEnviado: "Quiero más información de: EB-WC5462 Terreno Milpillas", origen: ORIGINS[1], ruta: "Campaña propiedad", advisorNombre: "Gabriela Rosas Noriega", tipoAsignacion: "Exclusiva", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor tomado directamente desde la propiedad en EasyBroker" },
  { daysAgo: 21, hour: 12, minute: 45, nombre: "Itzel Domínguez", telefono: "5219981112227", tipoInteres: "Explorar", datoEnviado: "Renta de casa con dos recámaras", origen: ORIGINS[0], ruta: "Explorar opciones", advisorNombre: "Roberto Arriola", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado y asignado en EasyBroker", estadoEnvioAsesor: "Asignado", observacionAsignacion: "Asesor de ruleta asignado y confirmado en EasyBroker" },
  { daysAgo: 23, hour: 10, minute: 30, nombre: "Adrián Cabrera", telefono: "5219981112228", tipoInteres: "Propiedad", datoEnviado: "EB-WE0782", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorNombre: "Guadalupe Poy", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor elegido automáticamente desde la lista activa" },
  { daysAgo: 25, hour: 17, minute: 50, nombre: "Fabiola Nieto", telefono: "5219981112229", tipoInteres: "Campaña", datoEnviado: "¡Hola! Quiero más información: EB-VY0780 Residencia de Lujo en Las Cañadas", origen: ORIGINS[1], ruta: "Campaña propiedad", advisorNombre: "Hector Moro", tipoAsignacion: "Exclusiva", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor tomado directamente desde la propiedad en EasyBroker" },
  { daysAgo: 27, hour: 8, minute: 15, nombre: "Sergio Montaño", telefono: "5219981112230", tipoInteres: "Explorar", datoEnviado: "Interesado en local comercial en renta", origen: ORIGINS[0], ruta: "Explorar opciones", advisorNombre: "Sandra Macias", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado y asignado en EasyBroker", estadoEnvioAsesor: "Asignado", observacionAsignacion: "Asesor de ruleta asignado y confirmado en EasyBroker" },
  { daysAgo: 29, hour: 13, minute: 5, nombre: "Melissa Ríos", telefono: "5219981112231", tipoInteres: "Propiedad", datoEnviado: "EB-WN8585", origen: ORIGINS[0], ruta: "Vi una propiedad", advisorNombre: "Alejandro Pérez", tipoAsignacion: "Aleatoria", estadoEasyBroker: "Creado en EasyBroker", estadoEnvioAsesor: "Pendiente", observacionAsignacion: "Asesor elegido automáticamente desde la lista activa" },
];

export const DEMO_LEADS: LeadRow[] = LEAD_SEEDS.map((seed, index) => {
  const advisor = advisorByName(seed.advisorNombre);
  const timestamp = daysAgo(seed.daysAgo, seed.hour, seed.minute);
  return {
    rowNumber: index + 2,
    fechaHora: timestamp,
    nombre: seed.nombre,
    telefono: seed.telefono,
    tipoInteres: seed.tipoInteres,
    datoEnviado: seed.datoEnviado,
    origen: seed.origen,
    ruta: seed.ruta,
    estadoEasyBroker: seed.estadoEasyBroker,
    linkWhatsappCliente: `https://wa.me/${seed.telefono}`,
    asesorAsignado: advisor.nombre,
    observaciones:
      seed.tipoInteres === "Propiedad"
        ? "Lead de propiedad registrado automáticamente"
        : seed.tipoInteres === "Campaña"
          ? "Lead de propiedad con asesor exclusivo registrado automáticamente"
          : "Lead de exploración registrado automáticamente",
    idAsesorAsignado: advisor.id,
    whatsappAsesorAsignado: advisor.whatsapp,
    fechaAsignacion: timestamp,
    tipoAsignacion: seed.tipoAsignacion,
    estadoEnvioAsesor: seed.estadoEnvioAsesor,
    observacionAsignacion: seed.observacionAsignacion,
  };
});

export const DEMO_USERS: AuthorizedUser[] = [
  { rowNumber: 2, nombre: "Administrador Panel", correo: "admin@c21inova.com", rol: "ADMIN", activo: true },
  { rowNumber: 3, nombre: "Gabriela Rosas Noriega", correo: "gabriela.rosas.noriega@c21inova.com", rol: "DIRECCION", activo: true },
  { rowNumber: 4, nombre: "Recepción", correo: "recepcion@c21inova.com", rol: "CONSULTA", activo: true },
];

export const DEMO_MAKE_EVENTS: MakeEventRow[] = [
  { rowNumber: 6, fecha: daysAgo(0, 11, 41), escenario: "Leads WhatsApp → EasyBroker", evento: "Lead creado y asesor asignado", estado: "ejecutado", lead: "Jorge Nava", telefono: "5219981112202", propiedad: "", asesor: "Hector Moro", mensaje: "", ejecucionId: "demo-006" },
  { rowNumber: 5, fecha: daysAgo(0, 9, 13), escenario: "Leads WhatsApp → EasyBroker", evento: "Lead creado y asesor asignado", estado: "ejecutado", lead: "Ana Beltrán", telefono: "5219981112201", propiedad: "EB-WN8585", asesor: "José Manuel Carrillo", mensaje: "", ejecucionId: "demo-005" },
  { rowNumber: 4, fecha: daysAgo(1, 10, 23), escenario: "Buscar propiedades EasyBroker - búsqueda profunda", evento: "Coincidencias enviadas a ManyChat", estado: "ejecutado", lead: "Marco Estrada", telefono: "5219981112204", propiedad: "", asesor: "", mensaje: "", ejecucionId: "demo-004" },
  { rowNumber: 3, fecha: daysAgo(2, 9, 31), escenario: "Leads WhatsApp → EasyBroker", evento: "Notificación al asesor", estado: "error", lead: "Iván Cordero", telefono: "5219981112206", propiedad: "", asesor: "Guadalupe Poy", mensaje: "ManyChat respondió 404 (suscriptor no encontrado)", ejecucionId: "demo-003" },
  { rowNumber: 2, fecha: daysAgo(3, 9, 0), escenario: "Sincronización manual", evento: "Disparo manual desde el panel", estado: "ejecutado", lead: "", telefono: "", propiedad: "", asesor: "admin@c21inova.com", mensaje: "", ejecucionId: "demo-002" },
];
