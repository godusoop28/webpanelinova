# Migración a Neon PostgreSQL — guía operativa

Este documento explica la migración del panel de Google Sheets/Make hacia
Next.js + Prisma + Neon PostgreSQL como backend real. Cubre arquitectura,
cómo correr cada paso, y el plan de cutover cuando decidan apagar Make y
Sheets. **Nada de esto se activó automáticamente en producción** — todo
queda detrás de `DATA_SOURCE` y `AUTOMATION_MODE`, ambos por defecto en su
modo seguro/legado.

## Arquitectura anterior

```
ManyChat → Make (orquestación completa) → Google Sheets (única "base de datos")
                                        → EasyBroker
                                        → ManyChat (notificar asesor)
```

Make tenía dos scenarios: uno de ruteo de leads (ruleta con
`floor(random()*16)+2`, sin ponderar por peso/pausa/límite diario) y otro de
búsqueda profunda de propiedades con OpenAI.

## Arquitectura nueva

```
ManyChat → Next.js (app/api/webhooks/manychat/*) → lib/services/* → Prisma → Neon PostgreSQL
                                                                  → EasyBroker
                                                                  → ManyChat
                                                                  → OpenAI
```

El mismo proyecto Next.js es frontend, backend, receptor de webhooks, motor
de asignación e integración con las tres APIs externas. Make y Google
Sheets siguen funcionando en paralelo mientras se prueba esto — nada se
apagó.

## Plan de cutover (orden exacto, no ejecutar automáticamente)

1. Deploy de este cambio a producción (Vercel) — no rompe nada por sí solo,
   todo queda en `DATA_SOURCE=sheets` / `AUTOMATION_MODE=shadow` por default.
2. Agregar `DATABASE_URL` en las variables de entorno de Vercel.
3. Aplicar la migración (`npx prisma migrate deploy` contra la Neon de
   producción).
4. Importar asesores (`POST /api/admin/migration/import-advisors`).
5. Importar histórico de leads (`POST /api/admin/migration/import-leads`).
6. Probar en `/testing` (shadow) los 5 escenarios (Propiedad con agente
   propio, Propiedad con comodín, Explorar, Campaña, Timeout).
7. Probar EasyBroker en un entorno controlado: `AUTOMATION_MODE=live` en
   preview/staging únicamente, con un teléfono propio.
8. Probar ManyChat igual, controlado, antes de tocar el flow real.
9. Activar `AUTOMATION_MODE=live` en producción.
10. Repuntar el webhook de **búsqueda de propiedades** en ManyChat hacia
    `/api/webhooks/manychat/property-search` (bajo riesgo: es de solo
    lectura).
11. Repuntar el webhook **principal de leads** en ManyChat hacia
    `/api/webhooks/manychat/lead`.
12. Observar `AuditLog`/`WebhookEvent`/logs con prefijo `[LEAD]`,
    `[ASSIGNMENT]`, `[EASYBROKER]`, `[MANYCHAT]`, `[WEBHOOK]` los primeros
    días.
13. Mantener Make disponible (no desactivarlo) durante ese período de
    observación.
14. Verificar que los leads en el panel (`/leads`) coincidan con lo que
    llega por WhatsApp — el chequeo humano real.
15. Desactivar los scenarios de Make.
16. Retirar la escritura a Google Sheets (dejar `DATA_SOURCE=database` como
    definitivo).
17. Conservar la opción de exportación manual a Sheets si la implementan
    (ver sección correspondiente) — opcional, no bloqueante.

## Variables de entorno nuevas

Ver `.env.example` para la lista completa con comentarios. Resumen:

| Variable | Para qué | Default si falta |
|---|---|---|
| `DATABASE_URL` | Conexión Neon (pooled) | — (bloquea todo lo que toque DB) |
| `DATA_SOURCE` | `database` o `sheets` — qué lee la UI | `sheets` (legado) |
| `AUTOMATION_MODE` | `shadow` o `live` — qué hace el webhook nuevo | `shadow` (seguro) |
| `EASYBROKER_API_KEY` | Ya existía | — |
| `EASYBROKER_FALLBACK_AGENT_EMAIL` | Email "comodín" de EasyBroker | `contacto@c21inova.com` |
| `MANYCHAT_API_KEY` | Notificar asesores | — |
| `MANYCHAT_ADVISOR_FLOW_ID` | Flow que se dispara al notificar | — |
| `OPENAI_API_KEY` | Búsqueda profunda de propiedades | — |
| `OPENAI_PROPERTY_SEARCH_MODEL` | Modelo a usar (sin default, ver abajo) | — |
| `INTEGRATION_SECRET` | Secreto de los endpoints nuevos (`x-inova-secret`) | — |
| `CRON_SECRET` | Reservado para tareas programadas futuras | — |

### Sobre `OPENAI_PROPERTY_SEARCH_MODEL`

No se puso un modelo por default a propósito. El scenario de Make original
usaba `gpt-5.4-mini`, pero eso es una elección de esa cuenta de OpenAI en
ese momento, no una garantía de qué modelo está disponible en tu API key
hoy. Define el valor que tu cuenta tenga habilitado.

### Precedencia `DEMO_MODE` vs `DATA_SOURCE`

1. `DEMO_MODE` activo (default hasta que lo desactiven) → todo lee
   `lib/demo-data.ts`, sin importar `DATA_SOURCE`.
2. `DATA_SOURCE=database` → el panel lee Postgres.
3. Cualquier otro valor (o ausente) → Sheets, el comportamiento de hoy.

## Cómo ejecutar migraciones

Prisma 7 cambió su CLI (ver nota abajo) pero los comandos de siempre siguen
existiendo:

```bash
# Una vez que DATABASE_URL esté en .env.local:
npx prisma generate        # ya corre automático en "npm install" (postinstall)
npx prisma migrate dev --name init
```

`prisma migrate dev` crea la migración inicial a partir de
`prisma/schema.prisma` y la aplica a la base indicada por `DATABASE_URL`. Es
seguro correrlo contra una base nueva y vacía (la de Neon que van a dar de
alta) — no toca Sheets ni ningún dato existente.

**Nota importante — Prisma 8 vs 7:** `npm install prisma` instala por
defecto la versión `8.0.0-rc.15` (un release candidate con un CLI orientado
a "Prisma Platform" — comandos como `deploy`, `bucket`, `branch` en vez de
`migrate`/`db push`). Este proyecto fija `prisma`/`@prisma/client` en
`7.10.0` (última estable) a propósito. No corran `npm install
prisma@latest` sin revisar antes — se llevaría el CLI clásico.

**Nota sobre Neon pooled vs directa:** si `DATABASE_URL` es la conexión
*pooled* de Neon (host con `-pooler`), `prisma migrate dev` puede fallar por
cómo PgBouncer maneja prepared statements. Si eso pasa, usen temporalmente
la conexión directa de Neon (sin `-pooler`) solo para correr la migración;
`lib/db.ts` en runtime ya usa `@prisma/adapter-neon` (el driver WebSocket de
Neon), que sí es compatible con serverless/Vercel.

## Cómo correr el seed

```bash
npm run db:seed
```

Crea (o deja igual si ya existe) la Company `Century 21 Innova`
(`slug: century21-innova`). Es idempotente — correrlo varias veces no
duplica nada.

## Cómo importar asesores desde Sheets

Con el panel corriendo y logueado como ADMIN (o en `DEMO_MODE`, donde todo
endpoint admin queda abierto):

```bash
curl -X POST http://localhost:3000/api/admin/migration/import-advisors \
  -H "Cookie: <tu cookie de sesión>"
```

Lee la hoja "Asesores" (solo lectura, nunca escribe a Sheets) y hace
`upsert` en Postgres usando `easyBrokerEmail` como llave. Asesores sin ese
correo se omiten (no hay llave segura para deduplicar) y aparecen listados
en `errors` de la respuesta. Repetir la llamada nunca duplica.

## Cómo importar leads históricos

```bash
curl -X POST http://localhost:3000/api/admin/migration/import-leads \
  -H "Cookie: <tu cookie de sesión>"
```

También solo lectura contra Sheets. Cada fila genera un fingerprint
determinístico (teléfono + fecha propia de la fila + interés + dato de
propiedad + origen) que se guarda como `Lead.requestId`; si ya existe, se
omite. **No intenta resolver `assignedAdvisorId`** — el id de asesor en la
hoja vieja no tiene relación con el `id` nuevo de Postgres. El nombre del
asesor original queda en `rawPayload` para referencia manual.

## Primera prueba (shadow, sin EasyBroker/ManyChat)

La forma recomendada es la página **`/testing`** del panel (rol ADMIN) —
llama directo al mismo pipeline que usa el webhook real
(`processIncomingLead`), pero **fuerza modo shadow sin importar
`AUTOMATION_MODE`** (ver `app/(protected)/testing/actions.ts`), así que
nunca puede disparar una llamada real por accidente.

Payload de ejemplo (lo que hay que llenar en el formulario):

```json
{
  "nombre": "Prueba Innova",
  "telefono": "5555555555",
  "interes": "Explorar",
  "origen": "Prueba manual"
}
```

Resultado esperado: se crea un `Lead` real en Neon, corre el motor de
asignación (con locking transaccional), se crea un `LeadAssignment` real, se
generan `AuditLog`, y la respuesta lista qué se *habría* enviado a
EasyBroker/ManyChat sin llamarlos.

Para "Propiedad" o "Campaña", usar un `public_id` real de EasyBroker (o
texto con un código `EB-...` para campaña) — en shadow **sí se permite el
GET** a EasyBroker (es lectura), pero no se crea `contact_request` ni se
notifica a nadie.

## Cómo probar la búsqueda profunda de propiedades

```bash
curl -X POST http://localhost:3000/api/webhooks/manychat/property-search \
  -H "Content-Type: application/json" \
  -H "x-inova-secret: $INTEGRATION_SECRET" \
  -d '{"busqueda_propiedad": "departamento en vía del bosque"}'
```

Esto sí llama a EasyBroker (lectura) y a OpenAI de verdad — no toca Sheets,
ManyChat ni el pipeline de leads, así que es seguro probarlo independiente
del resto.

## Cómo pasar a `live`

1. Confirmar en `/api/admin/readiness` (o en Integraciones) que EasyBroker,
   ManyChat, OpenAI e `INTEGRATION_SECRET` están configurados.
2. Probar varios escenarios en `/testing` (Propiedad con agente propio,
   Propiedad con comodín, Explorar, Campaña, Timeout) y revisar los
   `AuditLog` de cada lead en `/leads/[id]`.
3. Cambiar `AUTOMATION_MODE=live` **en las variables de entorno del
   hosting** (Vercel), no hay botón en el panel para esto a propósito (Fase
   55 — evita un accidente de un clic que active producción).
4. Con `AUTOMATION_MODE=live`, llamar `POST
   /api/webhooks/manychat/lead` de verdad (con un teléfono de prueba propio,
   no un cliente real) y confirmar en EasyBroker/ManyChat que sí llegó.

## Cómo migrar ManyChat

Este cambio **no tocó ManyChat**. Cuando estén listos:

1. En el flow builder de ManyChat, dupliquen el paso que hoy llama al
   webhook de Make.
2. Apunten la copia a `POST /api/webhooks/manychat/lead` (mismo payload:
   `nombre`, `telefono_cliente`, `interes_cliente`, `datos_propiedad`,
   `origen`, opcionalmente `subscriber_id`), con el header `x-inova-secret:
   <INTEGRATION_SECRET>`.
3. Repunten también el flow de "búsqueda profunda" a
   `POST /api/webhooks/manychat/property-search`.
4. Dejen el webhook de Make activo un tiempo en paralelo (aunque
   `AUTOMATION_MODE=live`, ambos pueden coexistir — el idempotency check por
   teléfono+ruta+propiedad+día evita que un mismo lead se duplique si por
   error llegara a los dos, aunque en general solo debe llegar a uno).
5. Cuando confíen en los logs (`AuditLog`, `WebhookEvent`), apaguen el paso
   viejo en ManyChat que llama a Make.

## Cómo retirar Make

`/api/integrations/make/events` y `/api/integrations/make/select-advisor`
siguen intactos y marcados como LEGACY en el código
(`app/api/integrations/make/*`, `lib/google-sheets.ts`). No se borra nada
todavía. Cuando ManyChat ya no le hable a Make:

1. Desactiven (no borren) los scenarios en Make.
2. Esperen un ciclo de negocio completo verificando que no faltan leads.
3. Entonces sí, eliminen las rutas `/api/integrations/make/*` y
   `MAKE_WEBHOOK_SECRET`/`MAKE_SYNC_WEBHOOK_URL` del proyecto.

## Cómo retirar Google Sheets

Con `DATA_SOURCE=database` en Vercel:

1. El panel ya no lee Sheets para nada (leads, asesores, dashboard).
2. La pestaña "Asesores" y "Hoja 1" quedan solo como respaldo/exportación
   manual — no se borran automáticamente.
3. `lib/google-sheets.ts` puede eliminarse cuando estén seguros; hasta
   entonces se conserva marcado como legado, y los import-advisors/leads
   siguen dependiendo de él como fuente de migración.

## Exportación a Sheets (futuro opcional)

No se implementó — queda como TODO documentado, no bloqueó el resto de la
migración (Fase 46). Si hace falta, sería un botón manual en
`/integraciones` que lea `Lead`/`Advisor` de Postgres y escriba filas nuevas
con `googleapis` (el cliente ya existe en `lib/google-sheets.ts`).

## Rollback

- **Nivel UI**: `DATA_SOURCE=sheets` (o quitar la variable) vuelve el panel
  a leer Sheets al instante, sin tocar código.
- **Nivel automatización**: `AUTOMATION_MODE=shadow` detiene toda llamada
  real a EasyBroker/ManyChat desde el pipeline nuevo sin afectar Make (que
  sigue corriendo si ManyChat aún le habla a él).
- **Nivel ManyChat**: si ya repuntaron el flow y algo sale mal, revertir el
  paso del flow builder a la URL de Make es inmediato (Make sigue vivo).
- **Nivel base de datos**: nada en Sheets se modifica nunca desde este
  cambio (las importaciones son de solo lectura), así que no hay riesgo de
  pérdida de datos del lado legado.

## Limitaciones conocidas (documentadas a propósito, no bugs escondidos)

- La importación de leads históricos no resuelve `assignedAdvisorId` (ver
  arriba) — es lectura/archivo, no reconstruye asignaciones pasadas.
- `ManyChatService.setCustomFields` no tiene hardcodeados los `field_id`
  numéricos del scenario de Make original (serían configuración específica
  de esa cuenta de ManyChat, no algo que deba vivir en el código — ver
  Fase de seguridad). `notifyAdvisor()` funciona igual sin ellos (solo
  manda el flow), y están preparados para pasarse explícitamente o
  guardarse en `Integration.config` cuando alguien los levante desde el
  panel de ManyChat.
- El dashboard, al leer de Postgres, limita la ventana agregada a 5000
  leads (parámetro `limit` de `listLeadMetricsRows`) en vez de paginar como
  `/leads` — suficiente para un rango típico de fechas, no pensado para
  "todo el historial desde el inicio de los tiempos" en una sola carga.
