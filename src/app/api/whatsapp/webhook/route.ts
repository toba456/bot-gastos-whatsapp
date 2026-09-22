import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { agregarGasto } from "@/lib/sheets";
import { extraerMensajesDeTexto, enviarMensajeTexto, type WhatsAppWebhookPayload } from "@/lib/whatsapp";
import { interpretarGastoDeTexto } from "@/lib/parseGasto";

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

// Recepcion de mensajes entrantes.
export async function POST(request: NextRequest) {
  const payload = (await request.json()) as WhatsAppWebhookPayload;
  const mensajes = extraerMensajesDeTexto(payload);

  for (const { from, texto } of mensajes) {
    try {
      const gasto = await interpretarGastoDeTexto(texto);
      await agregarGasto({
        fecha: gasto.fecha,
        monto: gasto.monto,
        categoria: gasto.categoria,
        descripcion: gasto.descripcion,
      });
      await enviarMensajeTexto(
        from,
        `Guardado ✅\n${gasto.categoria} — $${gasto.monto}\n${gasto.descripcion} (${gasto.fecha})`
      );
    } catch (error) {
      console.error("Error procesando mensaje de WhatsApp", error);
      await enviarMensajeTexto(
        from,
        "No pude interpretar ese gasto. ¿Podés reformularlo? Ej: 'gasté 5000 en el super'"
      ).catch(() => {});
    }
  }

  // WhatsApp requiere una respuesta 200 rapida, incluso si algo fallo arriba.
  return NextResponse.json({ ok: true });
}
