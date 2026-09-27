# Reportes por propiedad, propietarios y actividades

Panel → **Propiedades** (`/propiedades`, ADMIN/DIRECCIÓN/CONSULTA; CONSULTA
solo lectura y sin datos de contacto). Configuración del envío:
`/propiedades/configuracion` (solo ADMIN).

## Datos

`property_inquiries`: una fila por **contacto × propiedad × día** (Ciudad de
México), con canal, método y evidencia de identificación, portal del enlace,
fuente declarada y fuente de adquisición (solo con evidencia).

Se registra desde:

- El asistente (`recordTurnInquiries`): solo propiedades identificadas con
  certeza o confirmadas por el cliente (no candidatas que solo se mostraron).
- El webhook del flujo anterior de ManyChat (rutas Propiedad/Campaña con
  propiedad verificada en EasyBroker).
- Histórico (migración 20260928120000): leads de ruta Propiedad o Campaña con
  código EB-, **desde el 13/07/2026**. "Explorar" no se usó (el flujo anterior
  arrastraba `Datos_Propiedad` de conversaciones viejas). El panel muestra la
  fecha desde la que hay datos; no es el histórico completo de la empresa.

Se excluyen pruebas (`isTest`) y el simulador.

## Métricas

| Métrica | Definición |
|---|---|
| Leads únicos del periodo | contactos distintos por propiedad en el periodo (5 mensajes = 1) |
| Acumulado | contactos distintos por propiedad hasta el fin del periodo (no suma de semanas) |
| Consultas | filas contacto-día |
| Mensajes | mensajes del contacto en los turnos que hablaron de la propiedad |

Un contacto con dos propiedades cuenta una vez en cada una. Procedencia en
columnas separadas: canal (WhatsApp) / portal del enlace compartido / fuente
declarada por el cliente (`facts.heard_from`) / adquisición (campaña con
evidencia). Sin dato: "No identificado". Exportación CSV sin datos
personales: `/api/reports/properties/csv`.

## Destinatarios (propietarios)

`property_recipients` por inmueble: nombre, WhatsApp E.164, relación,
casillas de reporte semanal y avisos, autorización (estado + evidencia +
quién/cuándo), contacto de ManyChat, verificación, último envío y estado.

- Nunca se llena desde un lead. Si el teléfono aparece como prospecto, el
  panel exige confirmar explícitamente que es el propietario.
- "Verificar en ManyChat" comprueba (`getInfo` o `findBySystemField?phone=`)
  que el contacto tenga ese teléfono. Cambiar el contacto obliga a
  verificar de nuevo.
- Las casillas de envío no se pueden activar sin autorización registrada y
  verificación. Revocar la autorización las apaga.
- A los propietarios solo les llegan métricas y actividad del inmueble; nunca
  nombres ni teléfonos de prospectos.

## Reporte de los viernes

- Periodo: viernes 00:00 a jueves 23:59:59 (CDMX); consecutivos, sin huecos
  ni solapamientos; las fechas van en el mensaje.
- Cron `/api/cron/property-reports` cada 15 min (UTC); el día/hora se evalúan
  en CDMX. Solo encola si está habilitado y ya pasó la hora configurada.
- Cola persistente `property_report_deliveries` con clave única
  `weekly:<destinatario>:<propiedad>:<inicio del periodo>`: correr el cron
  varias veces no duplica. Estados PENDING → SENDING → SENT | FAILED |
  UNCERTAIN | SKIPPED. Reintentos 5/30/120 min ante error; un timeout de
  ManyChat queda UNCERTAIN y no se reenvía solo.
- Al enviar se revalida todo (autorización revocada después gana).
- Vista previa en cada propiedad; "Enviar prueba" (ADMIN) a un destinatario
  autorizado y verificado.
- Sin leads ni actividades el reporte lo dice. Los conteos salen del backend;
  no se usa IA para redactarlo.

### Envío por WhatsApp (verificado en la API de ManyChat)

Fuera de la ventana de 24 h WhatsApp solo admite **plantillas aprobadas**.
La API pública de ManyChat no crea ni envía plantillas directamente; lo que
sí expone es `setCustomFields` + `sendFlow`. Por eso: el backend escribe los
campos del contacto y lanza un flujo cuyo primer paso es la plantilla.

Campos creados en ManyChat el 28-sep-2026 (`createCustomField`) y precargados:

| Campo | ID | Variable |
|---|---|---|
| reporte_propiedad | 15008619 | semanal {{1}} |
| reporte_periodo | 15008620 | {{2}} |
| reporte_interesados_semana | 15008621 | {{3}} |
| reporte_acumulado | 15008622 | {{4}} |
| reporte_procedencia | 15008623 | {{5}} |
| reporte_actividad | 15008624 | {{6}} |
| evento_propiedad | 15008625 | actividad {{1}} |
| evento_encabezado | 15008626 | {{2}} |
| evento_detalle | 15008627 | {{3}} |

Plantillas a crear en ManyChat (WhatsApp → plantillas; Utilidad, es_MX) —
texto exacto en `lib/reporting/owner-templates.ts` y en la pantalla de
configuración. **Pendiente**: crearlas, esperar la aprobación de Meta, armar
dos flujos (plantilla con variables = campos) y pegar su `flow ns` en la
configuración.

### Para activar el viernes

1. Plantillas aprobadas por Meta + flujos con su ns en `/propiedades/configuracion`.
2. Hora confirmada por el cliente (viernes; la hora es configurable).
3. Destinatarios por propiedad: autorización registrada y verificados.
4. `AUTOMATION_MODE=live` (ya lo está en producción).
5. Habilitar "reporte semanal" en configuración y en cada destinatario.

Hasta entonces el cron no encola (o deja "No enviado" con el motivo).

## Actividades (citas, Open House, visitas)

Verificado en la documentación oficial (dev.easybroker.com, 27-sep-2026): la
API de EasyBroker expone propiedades, contactos, solicitudes de contacto,
usuarios, catálogos e integraciones con portales; **no** actividades,
tareas, citas, visitas ni Open House, ni webhooks. No se usan endpoints
privados.

Alternativa funcional: registro en el panel (`property_events`, origen
"Panel"; `externalId` queda para una fuente futura con clave única).

- Programada / realizada / cancelada son estados distintos; reprogramar o
  cambiar estado sube la `version`.
- Un aviso por versión y destinatario (`event:<id>:v<versión>:<destinatario>`):
  guardar dos veces lo mismo no duplica.
- Realizada: se comunica solo el resumen registrado; nunca asistentes,
  resultados o acuerdos inventados. No se adjuntan fotos.
- Solo si los avisos están habilitados, con plantilla/flujo y destinatarios
  autorizados.
