/**
 * Texto de las plantillas de WhatsApp para propietarios (deben aprobarse en
 * Meta a través de ManyChat). Las variables coinciden con las que arma
 * lib/reporting/property-report.ts, en el mismo orden, y con los campos
 * personalizados de ManyChat que llena el backend antes de lanzar el flujo.
 */
export const OWNER_TEMPLATES = [
  {
    name: "pulso_inova_semanal",
    purpose: "reporte semanal (viernes)",
    body: [
      "*PULSO INOVA | {{1}}*",
      "Periodo: {{2}}",
      "Interesados en la semana: {{3}}",
      "Acumulado: {{4}}",
      "Procedencia: {{5}}",
      "Actividad: {{6}}",
      "Century 21 Inova",
    ].join("\n"),
    fields: ["reporte_propiedad", "reporte_periodo", "reporte_interesados_semana", "reporte_acumulado", "reporte_procedencia", "reporte_actividad"],
  },
  {
    name: "pulso_inova_actividad",
    purpose: "aviso de actividad (programada, realizada, reprogramada o cancelada)",
    body: ["*PULSO INOVA | {{1}}*", "{{2}}", "{{3}}", "Century 21 Inova"].join("\n"),
    fields: ["evento_propiedad", "evento_encabezado", "evento_detalle"],
  },
] as const;
