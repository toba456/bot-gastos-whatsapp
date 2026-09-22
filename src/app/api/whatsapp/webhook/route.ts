import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { agregarGasto } from "@/lib/sheets";
import {
  extraerMensajesDeTexto,
  enviarMensajeTexto,
  enviarImagen,
  type WhatsAppWebhookPayload,
} from "@/lib/whatsapp";
import { interpretarMensaje } from "@/lib/interpretarMensaje";
import { calcularResumenMensual, textoResumen, urlGraficoTorta, nombreMes } from "@/lib/resumen";

// Verificacion del webhook (Meta la llama una vez al configurar la URL).
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN()) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Verificacion fallida", { status: 403 });
}

async function responderConResumen(mes: number, anio: number) {
  const resumen = await calcularResumenMensual(mes, anio);
  await enviarMensajeTexto(env.WHATSAPP_OWNER_NUMBER(), textoResumen(resumen));
  const grafico = urlGraficoTorta(resumen);
  if (grafico) {
    await enviarImagen(env.WHATSAPP_OWNER_NUMBER(), grafico, `Gastos de ${nombreMes(mes)} ${anio}`);
  }
}

// Recepcion de mensajes entrantes. El bot es de un solo usuario, asi que
// siempre se responde al numero fijo WHATSAPP_OWNER_NUMBER (no al "from" del
// mensaje entrante): para numeros de Argentina, el "from" que manda Meta usa
// un formato que la lista de destinatarios permitidos no siempre reconoce.
export async function POST(request: NextRequest) {
  const payload = (await request.json()) as WhatsAppWebhookPayload;
  const mensajes = extraerMensajesDeTexto(payload);

  for (const { texto } of mensajes) {
    try {
      const interpretado = await interpretarMensaje(texto);

      if (interpretado.tipo === "gasto") {
        await agregarGasto({
          fecha: interpretado.fecha,
          monto: interpretado.monto,
          categoria: interpretado.categoria,
          descripcion: interpretado.descripcion,
        });
        await enviarMensajeTexto(
          env.WHATSAPP_OWNER_NUMBER(),
          `Guardado ✅\n${interpretado.categoria} — $${interpretado.monto}\n${interpretado.descripcion} (${interpretado.fecha})`
        );
      } else {
        const ahora = new Date();
        const mes = interpretado.mes ?? ahora.getMonth() + 1;
        const anio = interpretado.anio ?? ahora.getFullYear();
        await responderConResumen(mes, anio);
      }
    } catch (error) {
      console.error("Error procesando mensaje de WhatsApp", error);
      await enviarMensajeTexto(
        env.WHATSAPP_OWNER_NUMBER(),
        "No pude procesar ese mensaje. Si es un gasto probá algo como 'gasté 5000 en el super'; si querés un resumen probá 'resumen de este mes'."
      ).catch(() => {});
    }
  }

  // WhatsApp requiere una respuesta 200 rapida, incluso si algo fallo arriba.
  return NextResponse.json({ ok: true });
}
