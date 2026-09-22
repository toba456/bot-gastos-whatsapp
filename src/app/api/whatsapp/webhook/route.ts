import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  agregarGastos,
  borrarGastoPorTexto,
  borrarTodosLosGastos,
  borrarUltimosGastos,
  contarGastos,
  editarUltimoGasto,
  previsualizarCoincidencia,
  previsualizarUltimos,
} from "@/lib/sheets";
import {
  extraerMensajesDeTexto,
  enviarMensajeTexto,
  enviarImagen,
  type WhatsAppWebhookPayload,
} from "@/lib/whatsapp";
import { interpretarMensaje, type MensajeInterpretado } from "@/lib/interpretarMensaje";
import { calcularResumen, textoResumen, urlGraficoTorta, tituloPeriodo, type Periodo } from "@/lib/resumen";
import { hoyISOEnArgentina } from "@/lib/fechaArgentina";
import {
  guardarConfirmacionPendiente,
  leerConfirmacionPendiente,
  borrarConfirmacionPendiente,
  type AccionBorrado,
} from "@/lib/estado";

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

async function responder(texto: string) {
  await enviarMensajeTexto(env.WHATSAPP_OWNER_NUMBER(), texto);
}

async function responderConResumen(periodo: Periodo, referencia: Date) {
  const resumen = await calcularResumen(periodo, referencia);
  await responder(textoResumen(resumen));
  const grafico = urlGraficoTorta(resumen);
  if (grafico) {
    await enviarImagen(env.WHATSAPP_OWNER_NUMBER(), grafico, `Gastos de ${tituloPeriodo(resumen)}`);
  }
}

function esConfirmacionAfirmativa(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return ["si", "sí", "s", "dale", "confirmo", "confirmar", "ok", "okay", "listo", "correcto"].some(
    (p) => t === p || t.startsWith(`${p} `) || t.startsWith(`${p},`)
  );
}

function esConfirmacionNegativa(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return ["no", "n", "cancelar", "cancela", "nop"].some(
    (p) => t === p || t.startsWith(`${p} `) || t.startsWith(`${p},`)
  );
}

// Arma la vista previa de que se va a borrar y guarda el estado pendiente,
// sin borrar nada todavia: el borrado real ocurre recien cuando el usuario
// confirma con "si" en el siguiente mensaje.
async function iniciarConfirmacionDeBorrado(interpretado: Extract<MensajeInterpretado, { tipo: "borrar" }>) {
  if (interpretado.objetivo === "todos") {
    const cantidad = await contarGastos();
    if (cantidad === 0) {
      await responder("No hay ningún gasto cargado.");
      return;
    }
    const resumen = `¿Querés borrar TODOS los gastos cargados? Son ${cantidad} en total y no se puede deshacer.`;
    await guardarConfirmacionPendiente({ accion: { tipo: "todos" }, resumen });
    await responder(`${resumen}\n\nRespondé "sí" para confirmar o "no" para cancelar.`);
    return;
  }

  if (interpretado.objetivo === "coincidencia" && interpretado.texto_busqueda) {
    const encontrado = await previsualizarCoincidencia(interpretado.texto_busqueda);
    if (!encontrado) {
      await responder(`No encontré ningún gasto que coincida con "${interpretado.texto_busqueda}".`);
      return;
    }
    const resumen = `¿Querés borrar este gasto?\n${encontrado.categoria} — $${encontrado.monto} — ${encontrado.descripcion}`;
    await guardarConfirmacionPendiente({
      accion: { tipo: "coincidencia", texto: interpretado.texto_busqueda },
      resumen,
    });
    await responder(`${resumen}\n\nRespondé "sí" para confirmar o "no" para cancelar.`);
    return;
  }

  const cantidad = interpretado.cantidad ?? 1;
  const candidatos = await previsualizarUltimos(cantidad);
  if (candidatos.length === 0) {
    await responder("No hay ningún gasto cargado para borrar.");
    return;
  }
  const lineas = candidatos.map((g) => `${g.categoria} — $${g.monto} — ${g.descripcion}`);
  const resumen = [
    `¿Querés borrar ${candidatos.length === 1 ? "este gasto" : `estos ${candidatos.length} gastos`}?`,
    ...lineas,
  ].join("\n");
  await guardarConfirmacionPendiente({ accion: { tipo: "ultimo", cantidad: candidatos.length }, resumen });
  await responder(`${resumen}\n\nRespondé "sí" para confirmar o "no" para cancelar.`);
}

async function ejecutarBorrado(accion: AccionBorrado) {
  if (accion.tipo === "todos") {
    const cantidad = await borrarTodosLosGastos();
    await responder(`Borré todo 🗑️ (${cantidad} gastos eliminados).`);
    return;
  }
  if (accion.tipo === "coincidencia") {
    const borrado = await borrarGastoPorTexto(accion.texto);
    if (borrado) {
      await responder(`Borrado 🗑️\n${borrado.categoria} — $${borrado.monto}\n${borrado.descripcion}`);
    } else {
      await responder("No pude encontrar ese gasto (puede que ya se haya borrado).");
    }
    return;
  }
  const borrados = await borrarUltimosGastos(accion.cantidad);
  if (borrados.length > 0) {
    const lineas = borrados.map((b) => `${b.categoria} — $${b.monto} — ${b.descripcion}`);
    await responder([`Borrado 🗑️ (${borrados.length})`, ...lineas].join("\n"));
  } else {
    await responder("No había nada para borrar.");
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
      const pendiente = await leerConfirmacionPendiente();
      if (pendiente) {
        if (esConfirmacionAfirmativa(texto)) {
          await borrarConfirmacionPendiente();
          await ejecutarBorrado(pendiente.accion);
        } else if (esConfirmacionNegativa(texto)) {
          await borrarConfirmacionPendiente();
          await responder("Cancelado, no borré nada.");
        } else {
          await responder(`${pendiente.resumen}\n\nRespondé "sí" para confirmar o "no" para cancelar.`);
        }
        continue;
      }

      const interpretado = await interpretarMensaje(texto);

      if (interpretado.tipo === "gasto") {
        await agregarGastos(
          interpretado.gastos.map((g) => ({
            fecha: g.fecha,
            monto: g.monto,
            categoria: g.categoria,
            descripcion: g.descripcion,
          }))
        );
        const lineas = interpretado.gastos.map(
          (g) => `${g.categoria} — $${g.monto} — ${g.descripcion} (${g.fecha})`
        );
        const encabezado =
          interpretado.gastos.length > 1 ? `Guardados ✅ (${interpretado.gastos.length} gastos)` : "Guardado ✅";
        await responder([encabezado, ...lineas].join("\n"));
      } else if (interpretado.tipo === "resumen") {
        const referencia = interpretado.fecha
          ? new Date(`${interpretado.fecha}T00:00:00Z`)
          : new Date(`${hoyISOEnArgentina()}T00:00:00Z`);
        await responderConResumen(interpretado.periodo, referencia);
      } else if (interpretado.tipo === "borrar") {
        await iniciarConfirmacionDeBorrado(interpretado);
      } else if (interpretado.tipo === "editar") {
        const actualizado = await editarUltimoGasto({
          monto: interpretado.monto ?? undefined,
          categoria: interpretado.categoria ?? undefined,
          descripcion: interpretado.descripcion ?? undefined,
        });
        if (actualizado) {
          await responder(`Actualizado ✏️\n${actualizado.categoria} — $${actualizado.monto}\n${actualizado.descripcion}`);
        } else {
          await responder("No hay ningún gasto cargado para editar.");
        }
      } else {
        await responder(
          "No te entendí. Para cargar un gasto probá algo como 'gasté 5000 en el super'; para un resumen, 'resumen de este mes'; para borrar, 'borrá el último gasto', 'borrá el del kiosko' o 'borrá todo'; para corregirlo, 'en realidad fueron 4000'."
        );
      }
    } catch (error) {
      console.error("Error procesando mensaje de WhatsApp", error);
      await responder(
        "No pude procesar ese mensaje. Si es un gasto probá algo como 'gasté 5000 en el super'; si querés un resumen probá 'resumen de este mes'."
      ).catch(() => {});
    }
  }

  // WhatsApp requiere una respuesta 200 rapida, incluso si algo fallo arriba.
  return NextResponse.json({ ok: true });
}
