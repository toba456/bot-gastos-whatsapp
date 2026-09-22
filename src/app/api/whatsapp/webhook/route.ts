import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { agregarGasto, borrarUltimoGasto, editarUltimoGasto } from "@/lib/sheets";
import {
  extraerMensajesDeTexto,
  enviarMensajeTexto,
  enviarImagen,
  type WhatsAppWebhookPayload,
} from "@/lib/whatsapp";
import { interpretarMensaje } from "@/lib/interpretarMensaje";
import { calcularResumen, textoResumen, urlGraficoTorta, tituloPeriodo, type Periodo } from "@/lib/resumen";
import { hoyISOEnArgentina } from "@/lib/fechaArgentina";

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

async function responderConResumen(periodo: Periodo, referencia: Date) {
  const resumen = await calcularResumen(periodo, referencia);
  await enviarMensajeTexto(env.WHATSAPP_OWNER_NUMBER(), textoResumen(resumen));
  const grafico = urlGraficoTorta(resumen);
  if (grafico) {
    await enviarImagen(env.WHATSAPP_OWNER_NUMBER(), grafico, `Gastos de ${tituloPeriodo(resumen)}`);
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
      } else if (interpretado.tipo === "resumen") {
        const referencia = interpretado.fecha
          ? new Date(`${interpretado.fecha}T00:00:00Z`)
          : new Date(`${hoyISOEnArgentina()}T00:00:00Z`);
        await responderConResumen(interpretado.periodo, referencia);
      } else if (interpretado.tipo === "borrar") {
        const borrado = await borrarUltimoGasto();
        if (borrado) {
          await enviarMensajeTexto(
            env.WHATSAPP_OWNER_NUMBER(),
            `Borrado 🗑️\n${borrado.categoria} — $${borrado.monto}\n${borrado.descripcion}`
          );
        } else {
          await enviarMensajeTexto(env.WHATSAPP_OWNER_NUMBER(), "No hay ningún gasto cargado para borrar.");
        }
      } else if (interpretado.tipo === "editar") {
        const actualizado = await editarUltimoGasto({
          monto: interpretado.monto ?? undefined,
          categoria: interpretado.categoria ?? undefined,
          descripcion: interpretado.descripcion ?? undefined,
        });
        if (actualizado) {
          await enviarMensajeTexto(
            env.WHATSAPP_OWNER_NUMBER(),
            `Actualizado ✏️\n${actualizado.categoria} — $${actualizado.monto}\n${actualizado.descripcion}`
          );
        } else {
          await enviarMensajeTexto(env.WHATSAPP_OWNER_NUMBER(), "No hay ningún gasto cargado para editar.");
        }
      } else {
        await enviarMensajeTexto(
          env.WHATSAPP_OWNER_NUMBER(),
          "No te entendí. Para cargar un gasto probá algo como 'gasté 5000 en el super'; para un resumen, 'resumen de este mes'; para borrar el último gasto, 'borrá el último gasto'; para corregirlo, 'en realidad fueron 4000'."
        );
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
