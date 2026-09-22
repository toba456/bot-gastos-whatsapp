import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { calcularResumen, textoResumen, urlGraficoTorta, tituloPeriodo } from "@/lib/resumen";
import { enviarMensajeTexto, enviarImagen } from "@/lib/whatsapp";
import { hoyEnArgentina } from "@/lib/fechaArgentina";

// Vercel Cron llama a este endpoint una vez por dia (ver vercel.json). Si el
// dia de hoy (en horario argentino) es el ultimo del mes, manda el resumen
// mensual por WhatsApp. Los demas dias no hace nada.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET()}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const ahora = new Date();
  const hoy = hoyEnArgentina(ahora);
  const manana = hoyEnArgentina(new Date(ahora.getTime() + 24 * 60 * 60 * 1000));
  const esUltimoDiaDelMes = manana.mes !== hoy.mes;

  if (!esUltimoDiaDelMes) {
    return NextResponse.json({ ok: true, enviado: false, motivo: "no es el ultimo dia del mes" });
  }

  const numero = env.WHATSAPP_OWNER_NUMBER();
  const referencia = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia));
  const resumen = await calcularResumen("mes", referencia);
  await enviarMensajeTexto(numero, textoResumen(resumen));
  const grafico = urlGraficoTorta(resumen);
  if (grafico) {
    await enviarImagen(numero, grafico, `Gastos de ${tituloPeriodo(resumen)}`);
  }

  return NextResponse.json({ ok: true, enviado: true });
}
