# Bot de Gastos por WhatsApp

Asistente personal de WhatsApp para registrar gastos hablando o escribiendo en lenguaje natural. Interpreta el mensaje con Gemini, lo guarda en una Google Sheet prolija, y responde confirmando. También arma resúmenes con gráfico, listados detallados, y permite editar o borrar lo cargado — todo por chat, sin abrir ninguna app.

## Qué hace hoy

- **Cargar por audio**: mandás una nota de voz con cualquier comando (cargar un gasto, pedir un resumen, borrar, editar) y se transcribe con Gemini y se procesa exactamente igual que si lo hubieras escrito.
- **Cargar gastos** por texto libre, uno o varios en el mismo mensaje. Cada gasto se guarda con un **ID único** (columna `ID`, antes de `Fecha`), que el bot muestra en la confirmación y en los listados — sirve para referenciar ese gasto puntual después.
  > "gasté 5000 en el súper" → responde con `#14 — Comida — $5000 — súper`
  > "gasté 300 en el kiosco, 8000 en el cine y 50000 en un pantalón"
- **Editar** un gasto sin borrarlo: el último cargado, o uno puntual por ID.
  > "en realidad fueron 4000" (edita el último)
  > "el gasto 12 en realidad fue en Transporte" (edita ese ID puntual)
- **Borrar** gastos, con confirmación previa (el bot muestra qué va a borrar y espera un "sí"/"no"):
  - el último, o los últimos N: *"borrá el último gasto"*, *"borrá los últimos 3"*
  - por ID puntual, uno o varios: *"borrá el gasto 12"*, *"borrá los gastos 3, 5 y 8"*
  - uno puntual por descripción/categoría: *"borrá el gasto del kiosco"*
  - todos los de un período: *"borrá todos los gastos de hoy"*, *"borrá lo de agosto"*
  - absolutamente todo: *"borrá todo"*
- **Resumen** con total, desglose por categoría y gráfico de torta, por día/semana/mes/año.
  > "resumen de este mes", "cuánto gasté esta semana", "resumen de agosto"
- **Listado** de cada gasto individual de un período (sin agregados ni gráfico).
  > "qué gasté hoy", "los gastos de agosto"
- **Resumen automático de fin de mes**: un cron corre todos los días y, si es el último día del mes, manda el resumen mensual solo, sin que se lo pidas.
- La planilla de Google Sheets queda organizada sola: encabezado con formato, filas separadoras con el nombre de cada mes, fecha y monto con formato correcto.

Todo el bot responde siempre al mismo número (el dueño), pensado para uso personal de una sola persona.

## Stack

| Componente | Elección |
|---|---|
| Mensajería | [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api) (número de prueba gratuito de Meta) |
| Hosting | [Vercel](https://vercel.com) (Hobby) — Next.js 16 / TypeScript, App Router |
| IA | [Gemini](https://ai.google.dev) vía [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) ([AI SDK](https://ai-sdk.dev), `generateObject` + `zod`) |
| Base de datos | [Google Sheets](https://developers.google.com/sheets/api) (vía `googleapis`, con una service account) |
| Automatización | [Vercel Cron](https://vercel.com/docs/cron-jobs) (resumen mensual automático) |

No hay base de datos tradicional: la planilla de Sheets *es* la base de datos, y hasta el estado de "hay un borrado esperando confirmación" se guarda en una pestaña oculta de la misma planilla (`_estado`).

## Arquitectura

```
WhatsApp (usuario) ──▶ Webhook (Vercel Function) ──▶ ¿audio? ──▶ Gemini (transcribe)
                              │                                        │
                              │                                        ▼
                              │                              Gemini (clasifica el mensaje)
                              │                                        │
                              │                                        ▼
                              │                    { tipo: gasto | resumen |
                              │                      listado | editar | borrar }
                              ▼
                        Google Sheets (leer/escribir gastos + estado pendiente)
                              │
                              ▼
                    WhatsApp (respuesta al dueño del bot)

Vercel Cron (diario) ──▶ /api/cron/resumen-mensual ──▶ (si es fin de mes) ──▶ WhatsApp
```

Cada mensaje entrante pasa primero por [`interpretarMensaje`](src/lib/interpretarMensaje.ts), que le pide a Gemini que lo clasifique en uno de 6 tipos (`gasto`, `resumen`, `listado`, `borrar`, `editar`, `otro`) usando un schema de `zod` con salida estructurada. Si el mensaje es un audio, antes se descarga desde la API de WhatsApp y se transcribe con Gemini (`transcribirAudio`); el texto resultante entra al mismo pipeline que un mensaje escrito, sin distinción. El webhook (`src/app/api/whatsapp/webhook/route.ts`) ejecuta la acción correspondiente y siempre responde al número fijo `WHATSAPP_OWNER_NUMBER`, nunca al `from` del mensaje entrante (ver la nota sobre números de Argentina más abajo).

## Estructura del proyecto

```
src/
  app/
    api/
      whatsapp/webhook/route.ts   # Webhook de WhatsApp: GET (verificación) + POST (mensajes)
      cron/resumen-mensual/route.ts  # Cron diario, manda el resumen el ultimo dia del mes
  lib/
    interpretarMensaje.ts   # Clasifica el mensaje con Gemini (gasto/resumen/listado/borrar/editar/otro) y transcribe audios
    sheets.ts                # Todo el CRUD sobre la Google Sheet (leer, agregar, editar, borrar, formatear)
    resumen.ts                # Calculo de resumenes/listados por periodo (dia/semana/mes/anio)
    whatsapp.ts               # Envio de mensajes de texto/imagen y descarga de audios via WhatsApp Cloud API
    estado.ts                 # Estado de confirmacion pendiente (pestaña oculta "_estado")
    categorias.ts             # Lista cerrada de categorias de gasto
    meses.ts / fechaArgentina.ts  # Helpers de fecha (nombres de mes, "hoy" en horario Argentina)
    env.ts                    # Acceso tipado a las variables de entorno
vercel.json                # Config del cron
```

## Configuración desde cero

### 1. WhatsApp Cloud API

1. Creá una app tipo **Business** en [Meta for Developers](https://developers.facebook.com/apps) y agregale el producto **WhatsApp**.
2. En **WhatsApp → Overview / Step 1**, copiá el **Phone Number ID** (el access token temporal que se genera ahí solo sirve para probar — para producción usá el token permanente del paso 3).
3. En esa misma pantalla, agregá tu número personal en **"Manage phone number list"** como destinatario de prueba y verificalo con el código que te llega — sin esto, el bot no puede responderte (ver la nota de Argentina abajo).
4. `WHATSAPP_VERIFY_TOKEN` lo inventás vos (cualquier string), lo vas a usar en el paso 6.
5. Deployá el proyecto (ver abajo) y andá a **Webhooks** (menú general de la app, no el de WhatsApp) → configurá la **Callback URL** (`https://<tu-deploy>.vercel.app/api/whatsapp/webhook`) y el **Verify token**. Suscribite al campo **`messages`**.
6. **Importante**: además de configurar el webhook en la UI, hay que suscribir la app al WhatsApp Business Account con una llamada a la API (la UI sola no alcanza):
   ```bash
   curl -X POST "https://graph.facebook.com/v22.0/<WABA_ID>/subscribed_apps" \
     -H "Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>"
   ```

#### Access token permanente (System User)

El token que se genera en "Try it out" **vence en pocas horas**. Para no tener que regenerarlo todo el tiempo, hay que crear un System User con un token sin expiración:

1. En [business.facebook.com/settings](https://business.facebook.com/settings) → **Users → System users** → **Add** → rol **Admin**.
2. Con el system user creado, **Add assets**:
   - Pestaña **Apps** → tu app → activá **"Manage app"** (control total) → Assign assets.
   - Repetí para la pestaña **WhatsApp accounts** → tu WhatsApp Business Account → control total.
3. **Generate token** → elegí la app, permisos `whatsapp_business_messaging` y `whatsapp_business_management`, y **expiración "Never"**.
4. Ese token (`EAA...`) es el que va en `WHATSAPP_ACCESS_TOKEN`. Se puede confirmar que no vence con:
   ```bash
   curl "https://graph.facebook.com/v22.0/debug_token?input_token=<TOKEN>&access_token=<TOKEN>"
   # expires_at: 0 y type: "SYSTEM_USER" = no vence
   ```

### 2. Google Sheets

1. Creá un proyecto en [Google Cloud Console](https://console.cloud.google.com), habilitá la **Google Sheets API**.
2. Creá una **Service Account**, generale una clave **JSON**, y de ahí sacás `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
3. Creá una planilla nueva, compartila con el email de la service account (permiso **Editor**), y copiá el `GOOGLE_SHEET_ID` de la URL.
4. Renombrá la primera hoja/pestaña a **"Gastos"** exacto (no distingue mayúsculas). El encabezado y el formato se crean solos la primera vez que se guarda un gasto.

### 3. Vercel AI Gateway (Gemini)

No hace falta ninguna cuenta de Google AI Studio aparte: las llamadas a Gemini pasan por el AI Gateway de Vercel.

1. `vercel link` en el proyecto (ver abajo) genera automáticamente un `VERCEL_OIDC_TOKEN` en `.env.local`, que alcanza para desarrollo local.
2. En producción, Vercel inyecta la autenticación del Gateway solo.
3. **Requisito de Vercel**: el AI Gateway pide una tarjeta de crédito cargada en la cuenta para desbloquear el tier gratuito (no cobra dentro de esos créditos). Se carga en `vercel.com/[team]/~/ai?modal=add-credit-card`.

### 4. Deploy a Vercel

```bash
vercel link --project <nombre-del-proyecto>
vercel env add WHATSAPP_VERIFY_TOKEN production
vercel env add WHATSAPP_ACCESS_TOKEN production
vercel env add WHATSAPP_PHONE_NUMBER_ID production
vercel env add GOOGLE_SERVICE_ACCOUNT_EMAIL production
vercel env add GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY production
vercel env add GOOGLE_SHEET_ID production
vercel env add WHATSAPP_OWNER_NUMBER production
vercel env add CRON_SECRET production
# repetir para el entorno "preview" si se va a usar
vercel deploy --prod
```

## Variables de entorno

Ver [.env.local.example](./.env.local.example) para la lista completa con comentarios. Copialo a `.env.local` para desarrollo local:

```bash
cp .env.local.example .env.local
```

| Variable | De dónde sale |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | La inventás vos |
| `WHATSAPP_ACCESS_TOKEN` | Meta for Developers → WhatsApp → API Setup |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta for Developers → WhatsApp → API Setup |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | JSON de la service account de Google Cloud |
| `GOOGLE_SHEET_ID` | URL de la planilla de Google Sheets |
| `WHATSAPP_OWNER_NUMBER` | Tu número, ver nota de Argentina abajo |
| `CRON_SECRET` | La generás vos (`openssl rand -hex 20`) |
| `AI_GATEWAY_API_KEY` | No hace falta en Vercel (se usa OIDC); solo si corrés fuera de Vercel |

## Nota sobre números de Argentina ⚠️

WhatsApp Cloud API tiene una inconsistencia conocida con números argentinos: existen **dos formatos** para el mismo número:

- **`wa_id`** (el que llega en el campo `from` de un mensaje entrante): `549` + código de área + número, ej `5492615700237`.
- **Formato de marcado local** (el que hay que usar para *enviar* mensajes, al menos con un número de prueba en modo Development): `54` + código de área + `15` + número, ej `54261155700237`.

Por eso `WHATSAPP_OWNER_NUMBER` tiene que cargarse en el **formato de marcado local** (con `15`, sin `9`), y el bot **nunca responde al `from`** del mensaje entrante — siempre le contesta a `WHATSAPP_OWNER_NUMBER` (que además es apropiado porque el bot es de un solo usuario). Si en algún momento se agrega un número de otro país, hay que revisar si aplica la misma conversión.

## El "borrado con confirmación"

Como no hay una base de datos aparte de la planilla, el estado de "hay un borrado pendiente de confirmar" se guarda en una pestaña oculta de la misma Google Sheet, llamada `_estado` (se crea sola). Cuando el bot te pregunta "¿confirmás?", tu próxima respuesta se interpreta primero como sí/no antes que como un mensaje normal; si no es ni sí ni no, te vuelve a mostrar la pregunta.
