import { env } from "@/lib/env";

const GRAPH_API_VERSION = "v22.0";

export async function enviarMensajeTexto(numeroDestino: string, texto: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID()}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: numeroDestino,
      type: "text",
      text: { body: texto },
    }),
  });
  if (!res.ok) {
    const detalle = await res.text();
    throw new Error(`Error enviando mensaje de WhatsApp (${res.status}): ${detalle}`);
  }
}

export async function enviarImagen(numeroDestino: string, urlImagen: string, caption?: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID()}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: numeroDestino,
      type: "image",
      image: { link: urlImagen, caption },
    }),
  });
  if (!res.ok) {
    const detalle = await res.text();
    throw new Error(`Error enviando imagen de WhatsApp (${res.status}): ${detalle}`);
  }
}

// Tipos minimos del payload del webhook de WhatsApp Cloud API.
// Referencia: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
export type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          type: string;
          text?: { body: string };
          audio?: { id: string; mime_type: string };
        }>;
      };
    }>;
  }>;
};

export type MensajeEntrante =
  | { from: string; tipo: "texto"; texto: string }
  | { from: string; tipo: "audio"; audioId: string; mimeType: string };

export function extraerMensajes(payload: WhatsAppWebhookPayload): MensajeEntrante[] {
  const mensajes: MensajeEntrante[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const mensaje of change.value?.messages ?? []) {
        if (mensaje.type === "text" && mensaje.text?.body) {
          mensajes.push({ from: mensaje.from, tipo: "texto", texto: mensaje.text.body });
        } else if (mensaje.type === "audio" && mensaje.audio?.id) {
          mensajes.push({
            from: mensaje.from,
            tipo: "audio",
            audioId: mensaje.audio.id,
            mimeType: mensaje.audio.mime_type,
          });
        }
      }
    }
  }
  return mensajes;
}

// Los medios de WhatsApp se descargan en dos pasos: primero se pide la URL
// firmada a partir del media id, despues se descarga el binario de esa URL
// (ambos pasos requieren el mismo token de acceso).
export async function descargarMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const urlInfo = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`;
  const resInfo = await fetch(urlInfo, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN()}` },
  });
  if (!resInfo.ok) {
    const detalle = await resInfo.text();
    throw new Error(`Error obteniendo datos del media de WhatsApp (${resInfo.status}): ${detalle}`);
  }
  const info = (await resInfo.json()) as { url: string; mime_type: string };

  const resArchivo = await fetch(info.url, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN()}` },
  });
  if (!resArchivo.ok) {
    const detalle = await resArchivo.text();
    throw new Error(`Error descargando media de WhatsApp (${resArchivo.status}): ${detalle}`);
  }
  const buffer = Buffer.from(await resArchivo.arrayBuffer());
  return { buffer, mimeType: info.mime_type };
}
