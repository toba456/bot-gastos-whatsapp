# Bot de Gastos por WhatsApp

Ver [PROYECTO.md](./PROYECTO.md) para el plan completo (objetivo, stack, arquitectura y fases).

## Desarrollo local

```bash
npm run dev
```

Copiá `.env.local.example` a `.env.local` y completá las variables antes de correr el proyecto.

## Configuracion necesaria (Fase 1)

1. **WhatsApp Cloud API**: crear una app de tipo "Business" en [Meta for Developers](https://developers.facebook.com/), agregar el producto WhatsApp, y de ahi sacar `WHATSAPP_ACCESS_TOKEN` (token temporal o permanente) y `WHATSAPP_PHONE_NUMBER_ID`. `WHATSAPP_VERIFY_TOKEN` lo inventas vos (cualquier string) y lo usas al configurar el webhook.
2. **Webhook**: una vez deployado en Vercel, en la app de Meta configurar la URL `https://<tu-deploy>.vercel.app/api/whatsapp/webhook` con el verify token elegido, y suscribirse al campo `messages`.
3. **Google Sheets**: crear un proyecto en Google Cloud, habilitar la API de Sheets, crear una service account, descargar su clave JSON (de ahi salen `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`), crear una planilla nueva, compartirla con el email de la service account (permiso Editor), y copiar el ID de la planilla (`GOOGLE_SHEET_ID`, esta en la URL) . La hoja se llama `Gastos` (se crea el encabezado solo la primera vez que se guarda un gasto).
4. **Vercel AI Gateway**: al linkear el proyecto con `vercel link` y correr `vercel env pull`, la variable `AI_GATEWAY_API_KEY` se completa sola si el proyecto esta en un team con AI Gateway habilitado. Ahi se llama a Gemini sin instalar el SDK de Google directamente.

## Endpoint del webhook

`src/app/api/whatsapp/webhook/route.ts`

- `GET`: responde al challenge de verificacion de Meta.
- `POST`: recibe mensajes de texto, los interpreta con Gemini (`src/lib/parseGasto.ts`), los guarda en Sheets (`src/lib/sheets.ts`) y responde por WhatsApp confirmando lo guardado (`src/lib/whatsapp.ts`).
