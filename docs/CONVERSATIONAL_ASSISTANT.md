# Asistente conversacional de WhatsApp (IA)

Reemplaza el menú rígido de ManyChat por una conversación abierta. ManyChat
es solo el **transporte** (recibe y envía); la memoria, las reglas y las
decisiones viven en este backend. Después de entender la solicitud se usa el
**mismo motor de asignación** de siempre (`processIncomingLead`: asesor
propio, comodín, ruleta ponderada, restricciones, EasyBroker, reintentos,
aviso por ManyChat).

## Flujo

```
Cliente (WhatsApp)
   │
ManyChat ── Default Reply → automatización "Asistente IA - Entrada"
   │  External Request POST /api/webhooks/manychat/message   (x-inova-secret)
   │  ← { ok, handled: "true"|"false" }  en < 1 s
   │     handled=false → la automatización sigue con el flujo anterior ("innova")
   ▼
Backend
 1. Valida, PERSISTE el mensaje (conversation_messages) y responde.
 2. Agrupa la ráfaga: cada mensaje empuja processAfter = ahora + debounce
    (6 s), con tope maxWait (25 s) desde el primer mensaje.
 3. after(): espera la ráfaga, toma el lease de la conversación, interpreta
    con OpenAI (herramientas acotadas), y deja la respuesta en cola.
 4. Envía en orden por ManyChat API /fb/sending/sendContent
    (content.type "whatsapp"). Estados: QUEUED → SENDING → SENT | FAILED | UNCERTAIN.
 5. Cron cada minuto (/api/cron/conversations): retoma lo que after() no
    terminó, reintenta envíos, aplica la regla de abandono y refresca el
    índice de propiedades.
```

### Por qué así (transporte verificado en la cuenta)

- Cuenta ManyChat `5057409` ("new WhatsApp account", Pro). Canal WhatsApp.
  External Request ya se usaba en los flujos existentes.
- `sendContent` con `{"version":"v2","content":{"type":"whatsapp","messages":[{"type":"text","text":"…"}]}}`
  está documentado por ManyChat (Dynamic Block, referencia de canales). No
  admite quick replies en WhatsApp: el bot no usa botones/menús.
- La API pública de ManyChat **no** expone un ID por mensaje ni si Live Chat
  pausó la automatización (ver esquema `Subscriber` en
  `https://api.manychat.com/swagger`). Por eso: dedupe por huella y control
  humano explícito en el panel (ver Limitaciones).
- No se mantiene abierta la External Request: ManyChat corta a los ~10 s y
  la IA + EasyBroker pueden tardar más.

## Código

| Pieza | Archivo |
|---|---|
| Webhook de mensajes | `app/api/webhooks/manychat/message/route.ts` |
| Cron de recuperación | `app/api/cron/conversations/route.ts` (vercel.json, cada minuto) |
| Recepción, bloqueo por conversación, lease | `lib/services/conversation.service.ts` |
| Procesador, versión, outbox, abandono | `lib/services/conversation-processor.service.ts` |
| Agente (OpenAI Responses + herramientas) | `lib/services/conversation-agent.service.ts` |
| Canalización comercial/gerencia/humana | `lib/services/conversation-handoff.service.ts` |
| Inventario (índice local de EasyBroker, enlaces) | `lib/services/property-catalog.service.ts`, `link-fetch.service.ts` |
| Prompt de sistema (versionado) | `lib/conversation/prompt.ts` |
| Contrato de herramientas y salida (Zod + JSON Schema) | `lib/conversation/assistant-contract.ts` |
| Reglas de negocio puras | `lib/conversation/policy.ts`, `burst.ts`, `property-reference.ts`, `lib/url-safety.ts` |
| Panel | `app/(protected)/conversaciones/*`, `components/conversaciones/*` |

Modelos (migración `20260926120000_add_conversational_assistant`, solo
aditiva): `AssistantSettings`, `Conversation`, `ConversationMessage`,
`ConversationTurn`, `ConversationEscalation`, `PropertyCacheEntry`.

## Reglas clave

- **La IA propone; el backend decide.** Herramientas: `search_properties`,
  `get_property`, `resolve_link`, `check_assignment`,
  `request_commercial_handoff`, `request_management`, `request_human`.
  Nada de SQL, URLs arbitrarias, elegir asesor ni escribir estados.
- Máximo 4 rondas y 6 llamadas a herramientas por turno; 1 corrección.
- El backend rechaza respuestas que mencionen códigos EB- no verificados o
  que afirmen una asignación que no ocurrió (corrige una vez, si no falla el turno).
- Intención → motor existente (`decideCommercialHandoff`):
  propiedad verificada → "Propiedad" (o "Campaña" si llegó con ese código);
  compra/renta/venta/inversión → "Explorar"; abandono con interés
  confirmado → "Timeout". Proveedor/gerencia/desconocido **nunca** entran a
  la ruleta (no pasan por el fallback EXPLORE del clasificador antiguo).
- Un lead por conversación (`requestId = conv:<id>:handoff`) y respeto del
  lead reciente del mismo teléfono (ventana configurable, 30 días): no se
  reasigna; se registra un pendiente FOLLOW_UP.
- Tras canalizar, necesidades nuevas o reclamos de seguimiento generan
  FOLLOW_UP de forma determinista.
- Estados separados: `control` (AI / HUMAN / PAUSED) vs `handoffState`
  (NONE / ASSIGNED / EXISTING_LEAD / NO_ADVISOR / FAILED / NOT_APPLICABLE).
  En el detalle del lead se ve por separado: asignación local, EasyBroker y aviso al asesor.
- Datos: `facts` distingue desconocido (ausente), conocido y "prefirió no
  decirlo" (`declined`), que no se vuelve a preguntar.
- Memoria: últimos 40 mensajes + resumen que el modelo actualiza cada turno.
  Solo mensajes capturados por este sistema; no hay historial previo de WhatsApp.

## Enlaces de portales

`resolve_link` → `resolvePropertyLink` (`lib/services/property-catalog.service.ts`)
+ `lib/conversation/listing-extract.ts`:

1. Código EB- en la URL → directo.
2. Enlace público de EasyBroker → por slug en el índice.
3. Portal: descarga acotada y segura (solo HTTPS, dominios permitidos,
   destino no privado, ≤3 redirecciones, 1.5 MB, 5 s). Lee og:title,
   og:description, JSON-LD (nombre, precio, recámaras, dirección) y códigos
   EB- del contenido principal. Un código EB- se verifica con EasyBroker
   (los de otras inmobiliarias dan 404: nunca se toman como propios).
4. Si el portal bloquea o exige sesión, solo se usan las palabras del
   enlace. **No se intenta saltar bloqueos.**
5. Cruce con el inventario: pesos por rareza de la palabra (IDF), frases de
   dos palabras ("valle real" ≠ "valle imperial"), palabras genéricas del
   sector ignoradas, penalización por tipo distinto (casa ≠ departamento);
   el precio solo confirma. Confianza alta → propiedad única; media →
   candidatas para que el cliente elija; baja → "no está en nuestro
   inventario" (probablemente de otra inmobiliaria).

Verificado en vivo el 27-sep-2026 (`lib/conversation/listing-extract.eval.ts`):

| Portal | Lectura | Resultado |
|---|---|---|
| Mercado Libre | ✅ | anuncios propios traen el código EB- → identificación exacta; otros → "no está en inventario" |
| Vivanuncios | ⚠️ a veces 403 | con página: título/zona/código; bloqueado: palabras del enlace |
| Inmuebles24 | ❌ 403 (anti-bots) | palabras del enlace → candidatas |
| Lamudi | ❌ 403 | enlaces sin palabras → pide código/colonia |
| Facebook | requiere sesión | pide código/colonia o descripción |
| Casas y Terrenos, Propiedades.com, century21mexico.com | permitido | según lo que exponga la página |

Dominios configurables con `ASSISTANT_LINK_DOMAINS` (por defecto los de la
tabla + `easybroker.com`, `fb.me`, `meli.la`).

## Fallos

| Falla | Comportamiento |
|---|---|
| OpenAI | Mensajes conservados; reintento del turno a 10 s, 30 s, 90 s (cron). Luego respuesta fija (no generada) una sola vez, IA en pausa para ese contacto y pendiente PROCESSING_ERROR. |
| EasyBroker | Se distingue 404 de indisponibilidad; la IA dice que no pudo consultar, nunca "no existe". |
| ManyChat error HTTP | Reintento hasta 3 veces; luego FAILED + pendiente. Nunca se marca "enviado". |
| ManyChat timeout | UNCERTAIN (pudo entregarse). No se reenvía solo; el panel pide confirmación para reenviar. |
| Proceso muere a mitad | Lease vence (150 s) y el cron retoma; un envío que quedó en SENDING pasa a UNCERTAIN. |
| Fuera de 24 h | No se intenta texto libre (WhatsApp exige plantilla); queda FAILED visible. |

No hay garantía de "exactamente una vez": ManyChat no da ID de mensaje y un
timeout de envío es ambiguo. Mitigaciones: huella de dedupe con
`{{last_interaction}}`, lease por conversación, control de versión antes de
responder, reclamo atómico QUEUED→SENDING y estado UNCERTAIN.

## Configuración (panel → Conversaciones, solo ADMIN)

- **Modo**: OFF (default) / TEST_ONLY / ON.
- Silencio de agrupación (6 s) y espera máxima (25 s).
- Aclaraciones sin progreso antes de ofrecer persona (3).
- Minutos para canalizar interés confirmado sin respuesta (30; 0 = nunca).
- Días para reutilizar el lead del mismo teléfono (30).
- Contactos de prueba y destinatarios de gerencia (subscriber IDs de
  ManyChat). Sin destinatarios de gerencia los pendientes quedan **solo en
  el panel** y la IA dice "quedó registrado", nunca "ya avisé".

Variables de entorno nuevas (todas opcionales):

- `ASSISTANT_DISABLED=true`: interruptor de emergencia; gana al panel.
- `OPENAI_ASSISTANT_MODEL`: modelo del asistente (default `OPENAI_PROPERTY_SEARCH_MODEL`).
  Verificado con `gpt-5.4-mini` vía Responses API (en Chat Completions ese
  modelo no admite herramientas con razonamiento).
- `ASSISTANT_LINK_DOMAINS`: dominios cuyos enlaces se pueden leer (default: EasyBroker, Mercado Libre, Vivanuncios, Inmuebles24, Lamudi, Propiedades.com, Casas y Terrenos, century21mexico.com, Facebook y acortadores).

## ManyChat

Automatización nueva **"Asistente IA - Entrada"** (`content20260926215340_158169`):

1. Acciones:
   - Establecer campo `IA_Handled` (id 15006733) = `false` (si la petición
     falla, la condición cae al flujo anterior).
   - Solicitud externa `POST https://webpanelinova-nu.vercel.app/api/webhooks/manychat/message`,
     encabezado `x-inova-secret: <INTEGRATION_SECRET>`, cuerpo `{Full Contact Data}`
     (variable de ManyChat; sintaxis de llave simple). El backend acepta ese
     objeto (id, name, last_input_text, whatsapp_phone, last_interaction) o la forma plana.
   - Mapeo de respuesta `$.handled` → `IA_Handled` (ManyChat solo habilita
     el mapeo después de una "Probar solicitud" exitosa).
2. Condición `IA_Handled es true` → fin (el backend responde por API).
   Si no → mensaje "¡Bienvenido a C21 Inova!" → "Iniciar otra automatización:
   innova" (exactamente lo que hacía la respuesta predeterminada antes).

Disparador: ManyChat solo permite la respuesta predeterminada de WhatsApp
en la automatización "Whatsapp Default Reply" (`content20260727205416_646210`,
frecuencia "every time"). Ahí su salida "Entonces" se reconectó a:
Acciones (`IA_Handled=false`) → "Iniciar otra automatización: Asistente IA -
Entrada". Los nodos anteriores (mensaje de bienvenida → innova) siguen en el
lienzo, desconectados.

**Rollback en ManyChat**: en "Whatsapp Default Reply", conectar "Entonces"
otra vez al nodo "Enviar mensaje ¡Bienvenido a C21 Inova!" y publicar.
Sin tocar ManyChat basta con modo OFF: el backend responde `handled=false`
y el cliente recibe la bienvenida + innova igual que antes.

Estado al 26-sep-2026 (corte a producción): modo **ON** para todos,
AUTOMATION_MODE=live. Disparadores de palabras clave DESACTIVADOS (no
borrados): "innova" (hola, Hola, Noche, Quiubo, Hey, Buen, solicito),
"Campaña propiedad" (EB-) y "Ninguna de las anteriores". Para volver al
comportamiento anterior completo: modo OFF + reactivar esos tres
disparadores + reconectar la respuesta predeterminada al mensaje de bienvenida.

Nota: la conversación del contacto de prueba 1016264146 quedó marcada
como prueba (isTest): recibe respuestas reales pero no crea leads.

Error conocido del flujo anterior (no corregido, queda de respaldo): la
ruta "Explorar" de "innova" manda el campo Datos_Propiedad sin limpiarlo,
así que puede enviar al asesor una propiedad de una conversación vieja.

### Activación gradual

1. Migración aplicada, backend desplegado con modo **OFF** → nada cambia.
2. Modo **TEST_ONLY** + subscriber ID del contacto de prueba en el panel.
3. Probar con ese contacto; revisar `/conversaciones`.
4. Modo **ON** y desactivar (no borrar) los disparadores antiguos que
   contestan en paralelo: palabras clave del flujo "innova" (hola, buen…),
   "Campaña propiedad" (EB-), "Ninguna de las anteriores". Mientras estén
   activos, ganan a la respuesta predeterminada y el bot anterior responde.
5. Mantener activos: "Envío a asesor" (avisos a asesores vía API) y los de
   Instagram.

### Rollback

- Rápido, sin tocar ManyChat: panel → modo OFF (o `ASSISTANT_DISABLED=true`).
  El webhook responde `handled=false` y la automatización lanza "innova".
- Completo: reactivar los disparadores antiguos (ver inventario abajo) y
  devolver la Default Reply a "innova". No se borró ningún flujo.
- Los datos nuevos (conversaciones) se conservan.

### Inventario de ManyChat antes del cambio (26-sep-2026)

| Automatización | ns | Estado | Disparadores |
|---|---|---|---|
| Campaña propiedad | content20260722040509_165719 | LIVE | mensaje contiene "EB-" |
| Ninguna de las anteriores | content20260720181838_384602 | LIVE | contiene ninguna / ninguna de las anteriores / no es ninguna / no coincide / no aparece |
| innova | content20260620034754_114892 | LIVE | Default Reply de WhatsApp + contiene hola/Hola/Noche/Quiubo/Hey/Buen/solicito |
| Whatsapp Default Reply | content20260727205416_646210 | LIVE | — |
| Envío a asesor | content20260714062251_472759 | STOPPED (se usa por API: MANYCHAT_ADVISOR_FLOW_ID) | — |
| Unsubscribe from Bot | system_wa_unsubscribe | LIVE | es stop / unsubscribe |
| WhatsapInova | content20260617172919_401656 | STOPPED | contiene leadinnova |
| WhatsApp Default Reply | wa_default | STOPPED | — |
| Link Propiedades / Link WhastApp | easy-builder | STOPPED | palabras clave de info/precio |
| Subscribe/Unsubscribe from Instagram | system_ig_* | LIVE | start/stop |
| Sin título ×2, Lead WhatsApp - Propiedad y Teléfono | — | DRAFT | — |

Campos existentes relevantes: `nombre_lead` 14780313, `telefono_lead`
14780314, `interes_lead` 14780316, `dato_propiedad` 14780317, `ruta_lead`
14780318, `link_whatsapp_cliente` 14780319 (avisos a asesores/gerencia).

## Limitaciones conocidas

- **Toma humana**: la API de ManyChat no informa si alguien respondió desde
  Live Chat. Si una persona contesta en la bandeja, debe detener la IA en
  `/conversaciones/<id>` (o ManyChat pausa la automatización y los mensajes
  ni siquiera llegan al backend). "Registrar respuesta humana" guarda en la
  memoria lo que se respondió fuera del bot.
- **Asesor ≠ transferencia**: asignar en EasyBroker no mueve la
  conversación de WhatsApp; el asesor escribe desde su propio número.
- **Ventana 24 h**: el bot solo responde a mensajes del cliente; fuera de
  ventana no hay texto libre (se necesitaría plantilla aprobada).
- **Dedupe sin ID**: si ManyChat no envía `{{last_interaction}}`, una
  reentrega del mismo evento podría guardarse dos veces (se prefiere a perder mensajes).
- Mensajes sin texto (imagen/audio) se registran como tales; la IA no los ve.

## Pruebas

```bash
npm test                                   # unitarias (reglas puras)
TEST_DATABASE_URL=postgresql://…localhost…/inova_test npm run test:integration
                                           # procesador contra Postgres local (nunca producción)
npm run test:eval                          # comportamiento con OpenAI + EasyBroker reales, sin BD ni envíos
```

El simulador del panel (`/conversaciones/simulador`, ADMIN) recorre el
pipeline real con conversaciones `isTest`: no envía WhatsApp, no crea leads
ni mueve la ruleta (la canalización muestra a quién le tocaría).
