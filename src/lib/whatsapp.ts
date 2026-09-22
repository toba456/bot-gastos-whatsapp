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
        }>;
      };
    }>;
  }>;
};

export function extraerMensajesDeTexto(
  payload: WhatsAppWebhookPayload
): Array<{ from: string; texto: string }> {
  const mensajes: Array<{ from: string; texto: string }> = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const mensaje of change.value?.messages ?? []) {
        if (mensaje.type === "text" && mensaje.text?.body) {
          mensajes.push({ from: mensaje.from, texto: mensaje.text.body });
        }
      }
    }
  }
  return mensajes;
}
