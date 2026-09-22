# Bot de Gastos por WhatsApp — Plan del Proyecto

**Estado:** Planificación cerrada, listo para arrancar Fase 1
**Uso:** Personal (un solo usuario) — no se prioriza estética, sí funcionalidad y costo cero

---

## 1. Objetivo

Reemplazar la carga manual de gastos (app actual donde se anota a mano categoría, nombre y monto) por un asistente al que se le pueda escribir por WhatsApp:

- **Audios** en lenguaje natural describiendo un gasto → se interpreta y se guarda.
- **Imágenes** (tickets, capturas de transferencias/pagos) → se interpreta y se guarda.
- **Texto** manual para gastos hechos con banco o efectivo (lo único que se carga a mano).
- **Resúmenes y gráficos** on-demand del mes actual o de meses anteriores.
- **Carga automática** de los gastos hechos con la billetera de Mercado Pago (fase futura).

---

## 2. Stack elegido

| Componente | Elección | Motivo |
|---|---|---|
| Mensajería | WhatsApp Cloud API (número de prueba gratuito de Meta) | Uso personal, un solo número receptor, gratis |
| Hosting | Vercel (plan Hobby) — funciones serverless Next.js/TypeScript | Gratis para uso no comercial, Node.js completo, mismo stack que ya maneja Tobias |
| IA (audio/imagen/texto → datos estructurados) | Gemini API (Google AI Studio) | Tier gratuito real, entiende audio e imagen nativamente en una sola llamada (no hace falta transcribir aparte) |
| Base de datos | Google Sheets (vía API) | Gratis, no se pausa por inactividad, se puede revisar/editar a mano desde el celu. Necesario que sea externo porque el hosting es serverless (un SQLite local no persistiría entre invocaciones) |

### Nota sobre costos de WhatsApp (importante)
A partir del **1° de octubre de 2026**, Meta empieza a cobrar los mensajes de servicio (respuestas dentro de la ventana de 24hs), que hasta ahora eran siempre gratis. A cambio, suma un tier gratuito de **1000 mensajes de servicio por mes por número**. Con el volumen esperado (unos pocos gastos por día) el uso queda muy por debajo de ese límite → sigue siendo gratis.

### Nota sobre Gemini
Los límites del tier gratuito y los nombres de los modelos Flash cambian con frecuencia. Verificar el modelo vigente en ai.google.dev al momento de implementar.

---

## 3. Arquitectura

### Carga de un gasto
1. El usuario manda un audio, imagen o texto al bot por WhatsApp.
2. WhatsApp dispara un webhook a la función en Vercel.
3. Si hay audio o imagen, la función lo descarga desde la API de WhatsApp.
4. Se envía a Gemini con instrucciones para extraer monto, categoría, descripción y fecha → devuelve JSON estructurado.
5. Se guarda la fila en Google Sheets.
6. El bot responde confirmando qué guardó, para poder corregir si interpretó mal algo (paso de seguridad agregado sobre el pedido original).

### Resúmenes
1. El usuario pide algo como "resumen de este mes" o "gráfico de gastos de agosto".
2. La función lee los datos de la planilla y calcula totales/categorías.
3. Genera un gráfico como imagen y lo manda junto con el texto del resumen.

### Mercado Pago (Fase 3)
1. Se configura un webhook de notificaciones en la cuenta de MP.
2. Cada pago con esa billetera le pega a la misma función.
3. Se guarda automáticamente en la planilla, marcado como "Mercado Pago" para diferenciarlo de lo cargado a mano.

---

## 4. Riesgo a resolver antes de la Fase 3

La API de Mercado Pago Developers está pensada para negocios que **reciben** pagos (notificaciones de cobros), no para que el usuario, como comprador, lea sus propios gastos salientes desde su billetera personal. Hay que investigar si existe alguna vía (OAuth de cuenta personal + algún endpoint de movimientos) que dé acceso a eso. Queda como tarea de investigación al llegar a esa fase — si no hay forma oficial, se busca una alternativa (por ejemplo, procesar los mails de confirmación de compra que manda MP).

---

## 5. Fases

### Fase 1 – MVP básico
- Bot de WhatsApp conectado
- Carga de gastos por texto
- Guardado en Google Sheets
- Confirmación de lo guardado

### Fase 2 – Multimodal
- Carga por audio (Gemini transcribe + interpreta en la misma llamada)
- Carga por imagen (tickets, capturas de transferencias)
- Resúmenes con gráficos on-demand (por mes, por categoría)

### Fase 3 – Automatización con Mercado Pago
- Investigar viabilidad de leer movimientos propios vía API
- Webhook o alternativa
- Etiquetado automático "MP" vs manual

---

## 6. Requisitos para arrancar

- [ ] Cuenta de Meta for Developers con la app de WhatsApp Business creada
- [ ] Cuenta de Google para la planilla, con la API de Sheets habilitada
- [ ] Cuenta en Google AI Studio para la API key de Gemini
- [ ] Cuenta de Vercel conectada a GitHub para el deploy

---

## 7. Detalles a definir durante la Fase 1

- Lista de categorías de gastos (predefinida vs. libre)
- Formato exacto de las columnas en Google Sheets
- Mensaje de confirmación/corrección por WhatsApp
