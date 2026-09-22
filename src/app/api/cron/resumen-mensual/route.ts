import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { calcularResumenMensual, textoResumen, urlGraficoTorta, nombreMes } from "@/lib/resumen";
import { enviarMensajeTexto, enviarImagen } from "@/lib/whatsapp";

const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

function fechaEnArgentina(fecha: Date): { anio: number; mes: number; dia: number } {
  const formateador = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [anio, mes, dia] = formateador.format(fecha).split("-").map(Number);
  return { anio, mes, dia };
}

// Vercel Cron llama a este endpoint una vez por dia (ver vercel.json). Si el
// dia de hoy (en horario argentino) es el ultimo del mes, manda el resumen
// mensual por WhatsApp. Los demas dias no hace nada.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET()}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const ahora = new Date();
  const hoy = fechaEnArgentina(ahora);
  const manana = fechaEnArgentina(new Date(ahora.getTime() + 24 * 60 * 60 * 1000));
  const esUltimoDiaDelMes = manana.mes !== hoy.mes;

  if (!esUltimoDiaDelMes) {
    return NextResponse.json({ ok: true, enviado: false, motivo: "no es el ultimo dia del mes" });
  }

  const numero = env.WHATSAPP_OWNER_NUMBER();
  const resumen = await calcularResumenMensual(hoy.mes, hoy.anio);
  await enviarMensajeTexto(numero, textoResumen(resumen));
  const grafico = urlGraficoTorta(resumen);
  if (grafico) {
    await enviarImagen(numero, grafico, `Gastos de ${nombreMes(hoy.mes)} ${hoy.anio}`);
  }

  return NextResponse.json({ ok: true, enviado: true });
}
