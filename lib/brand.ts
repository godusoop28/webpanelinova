/**
 * Nombre visible de la marca y del asistente. Un solo lugar para que
 * prompt, respuestas fijas, avisos, panel y reportes digan lo mismo.
 * Puro (sin "server-only"): lo usan también componentes y pruebas.
 *
 * Ojo: "Inova" lleva una sola N. Los identificadores técnicos que todavía
 * dicen "innova" (slug de la Company, nombre de la automatización de
 * ManyChat, ns de flujos) NO se renombran: romperían la integración.
 */
export const BRAND_NAME = "Century 21 Inova";

/** Nombre completo del asistente virtual. */
export const ASSISTANT_NAME = "CENTURION IA";

/** Cómo se presenta en la conversación. */
export const ASSISTANT_SHORT_NAME = "Centurion";

/** Encabezado de los avisos a propietarios (reportes y actividad). */
export const OWNER_REPORT_BRAND = "PULSO INOVA";

/** Presentación del primer mensaje (referencia para el prompt y pruebas). */
export const ASSISTANT_GREETING = `¡Hola! Bienvenido a ${BRAND_NAME}. Soy ${ASSISTANT_SHORT_NAME}, tu asesor virtual. Cuéntame, ¿en qué puedo ayudarte?`;
