# Arquitectura — Panel Century 21 Innova

Sistema de producción: un solo proyecto Next.js que es panel administrativo,
backend, receptor de webhooks y motor de asignación de leads, con
PostgreSQL (Neon) como única base de datos.

```
ManyChat
   │  POST /api/webhooks/manychat/lead
   │  POST /api/webhooks/manychat/property-search
   ▼
Next.js (Vercel) — API / Server Actions / páginas del panel
   │
   ├── lib/services/*        motor de asignación, leads, asesores, usuarios
   ├── lib/repositories/*    acceso a datos (Prisma)
   └── lib/integrations/*    clientes de EasyBroker, ManyChat, OpenAI
   │
   ▼
Prisma → Neon PostgreSQL (única fuente de datos)
   │
   ├──► EasyBroker API   (propiedades, contact_requests, asignación de agente)
   ├──► ManyChat API     (notificar asesores)
   └──► OpenAI API       (búsqueda profunda de propiedades)
```

No hay Google Sheets ni Make en esta arquitectura. Ambos se usaron
temporalmente durante la migración inicial — ver `docs/archive/` para ese
historial — pero el sistema en producción no depende de ninguno de los dos.

## Pantallas del panel

| Ruta | Quién accede | Qué hace |
|---|---|---|
| `/dashboard` | ADMIN, DIRECCION, CONSULTA | Resumen ejecutivo (KPIs por periodo) |
| `/leads` | ADMIN, DIRECCION | Lista y gestión de leads |
| `/leads/[id]` | ADMIN, DIRECCION | Detalle, reasignación manual, cambio de estado |
| `/asesores` | ADMIN, DIRECCION | Alta/edición/pausa de asesores, motor de asignación |
| `/reportes` | ADMIN, DIRECCION, CONSULTA (solo lectura) | Desempeño por periodo/asesor |
| `/usuarios` | ADMIN | Alta/edición/contraseña de cuentas del panel |
| `/integraciones` | ADMIN | Estado de EasyBroker/ManyChat/OpenAI/base de datos |
| `/configuracion` | ADMIN | Datos de cuenta y reglas de asignación |

Todo lee y escribe directamente en Postgres — ninguna pantalla depende de
una fuente externa para funcionar.

## Motor de asignación de leads

Para cada lead entrante (`interes_cliente`: Propiedad, Explorar, Campaña,
Timeout, Sin respuesta):

1. **Propiedad / Campaña** con un código de propiedad reconocible: se
   consulta EasyBroker. Si la propiedad tiene un agente propio (distinto
   del correo comodín `EASYBROKER_FALLBACK_AGENT_EMAIL`), se asigna directo
   a ese `Advisor` (por `easyBrokerEmail`). Si no, entra a la ruleta.
2. **Explorar / Timeout / Sin respuesta**: siempre ruleta ponderada.
3. **Ruleta ponderada**: entre los asesores `active=true`, `weight>0`, con
   la ruta permitida y sin pausa vigente, se elige al que tenga la menor
   proporción (leads de hoy / peso) — así un asesor con peso 10 recibe
   proporcionalmente el doble de leads que uno con peso 5, sin ser
   puramente aleatorio. La selección corre dentro de una transacción de
   Postgres con bloqueo de filas (`SELECT ... FOR UPDATE`) para que dos
   leads simultáneos nunca elijan mal por una condición de carrera.
4. Se crea el `LeadAssignment`, se llama a EasyBroker
   (`POST /contact_requests`, luego `PATCH /contacts/{id}` con el asesor),
   y se notifica al asesor por ManyChat.
5. Cada paso queda en `AuditLog`. Si EasyBroker o ManyChat fallan, se
   encola un `IntegrationJob` que un cron reintenta con backoff (1min, 5min,
   15min, 1h — ver más abajo).

Código: `lib/services/lead.service.ts` (orquestación),
`lib/services/assignment.service.ts` + `lib/assignment-engine.ts` (motor
puro y testeable), `lib/services/easybroker.service.ts`,
`lib/services/manychat.service.ts`.

## Modo shadow / live

`AUTOMATION_MODE` (variable de entorno, nunca desde el panel):

- `shadow` (default): corre todo el pipeline — crea el Lead, corre el
  motor de asignación, escribe AuditLog — pero **nunca** llama a EasyBroker
  ni a ManyChat de verdad.
- `live`: llamadas reales.

Es un mecanismo de seguridad interno, no algo que el negocio necesite ver
o tocar. Cambiarlo es una variable de entorno en el hosting.

## Reintentos ante fallos

Tabla `integration_jobs`: cuando una llamada a EasyBroker o ManyChat falla
después de sus reintentos inmediatos, se encola un job con backoff largo
(1min → 5min → 15min → 1h). `GET/POST /api/cron/retry-integrations`
(protegido con `CRON_SECRET`) procesa los jobs vencidos — apúntale un cron
externo (Vercel Cron u otro) cada pocos minutos.

## Autenticación

Tabla `users` en Postgres: `email` + `passwordHash` (bcrypt). Roles:
`ADMIN`, `DIRECCION`, `CONSULTA` (ver `lib/permissions.ts`). El primer
ADMIN se crea con el seed (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, solo
para ese propósito); después, los ADMIN administran cuentas desde
`/usuarios`. Cada endpoint valida el rol server-side — ocultar un botón en
la UI no es la protección real.

## Variables de entorno

Ver `.env.example` para la lista completa y comentada. Resumen por grupo:

- **Auth**: `AUTH_SECRET`, `AUTH_URL`.
- **Base de datos**: `DATABASE_URL` (Neon, pooled).
- **EasyBroker**: `EASYBROKER_API_KEY`, `EASYBROKER_FALLBACK_AGENT_EMAIL`.
- **ManyChat**: `MANYCHAT_API_KEY`, `MANYCHAT_ADVISOR_FLOW_ID`.
- **OpenAI**: `OPENAI_API_KEY`, `OPENAI_PROPERTY_SEARCH_MODEL`.
- **Seguridad de webhooks**: `INTEGRATION_SECRET`, `CRON_SECRET`.
- **Automatización**: `AUTOMATION_MODE` (`shadow`/`live`).
- **Seed**: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (solo para el primer
  `npm run db:seed`).
- **Desarrollo**: `ENABLE_INTERNAL_TESTING` (habilita `/testing`, un
  simulador interno de leads — siempre en modo shadow, nunca visible en el
  menú, apagado por default).

## Cómo correr localmente

```bash
npm install                        # corre "prisma generate" solo
npx prisma migrate deploy          # aplica migraciones contra tu DATABASE_URL
npm run db:seed                    # crea la Company y el primer ADMIN
npm run dev
```

## Webhooks de ManyChat

Ver la sección "Webhooks para ManyChat" en el reporte de la migración para
las URLs, headers y payloads exactos que hay que configurar en ManyChat.

## Base de datos: modelos principales

`Company`, `User`, `Advisor`, `Lead`, `LeadAssignment`, `AssignmentRule`,
`Integration`, `AuditLog`, `WebhookEvent`, `IntegrationJob`. Todos con
`companyId` — el diseño es multiempresa desde el inicio aunque hoy solo
exista Century 21 Innova (sembrada por `prisma/seed.ts`).

## Pruebas

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`lib/assignment-engine.ts`, `lib/phone.ts`, `lib/fingerprint.ts`,
`lib/retry.ts`, `lib/lead-status.ts` y `lib/property-search-schema.ts` son
módulos puros (sin `"server-only"`, sin llamadas de red) diseñados a
propósito para probarse sin mocks pesados — ver sus `*.test.ts`.
