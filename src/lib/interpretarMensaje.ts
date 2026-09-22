import { generateObject } from "ai";
import { z } from "zod";
import { CATEGORIAS } from "@/lib/categorias";
import { hoyISOEnArgentina } from "@/lib/fechaArgentina";

const itemGastoSchema = z.object({
  monto: z.number().describe("Monto del gasto en pesos, siempre positivo"),
  categoria: z.enum(CATEGORIAS),
  descripcion: z.string().describe("Descripcion corta del gasto, ej: 'nafta', 'super del mes'"),
  fecha: z
    .string()
    .describe("Fecha del gasto en formato YYYY-MM-DD. Si no se menciona, usar la fecha de hoy."),
});

const gastoSchema = z.object({
  tipo: z.literal("gasto"),
  gastos: z
    .array(itemGastoSchema)
    .min(1)
    .describe("Uno o mas gastos mencionados en el mismo mensaje (el usuario puede cargar varios juntos)"),
});

const resumenSchema = z.object({
  tipo: z.literal("resumen"),
  periodo: z
    .enum(["dia", "semana", "mes", "anio"])
    .describe("Periodo del resumen pedido: dia, semana, mes o anio"),
  fecha: z
    .string()
    .nullable()
    .describe(
      "Fecha de referencia YYYY-MM-DD dentro del periodo pedido (ej: si pide 'resumen de agosto', el 1 de agosto de este anio). null si no se especifica un periodo puntual (se asume hoy/esta semana/este mes/este anio segun corresponda)"
    ),
});

const listadoSchema = z.object({
  tipo: z.literal("listado"),
  periodo: z
    .enum(["dia", "semana", "mes", "anio"])
    .describe("Periodo del listado pedido: dia, semana, mes o anio"),
  fecha: z
    .string()
    .nullable()
    .describe(
      "Fecha de referencia YYYY-MM-DD dentro del periodo pedido (ej: si pide 'los gastos de agosto', el 1 de agosto de este anio). null si no se especifica un periodo puntual (se asume hoy/esta semana/este mes/este anio segun corresponda)"
    ),
});

const borrarSchema = z.object({
  tipo: z.literal("borrar"),
  objetivo: z
    .enum(["ultimo", "todos", "coincidencia", "periodo"])
    .describe(
      "'ultimo' para borrar el/los ultimos gastos cargados; 'todos' si pide borrar TODOS los gastos de la planilla, de toda la historia (ej 'borra todo', 'vacia la planilla'); 'coincidencia' si menciona una descripcion o categoria especifica de que gasto borrar (ej 'borra el gasto del kiosko'); 'periodo' si pide borrar todos los gastos de un periodo puntual (ej 'borra todos los gastos de hoy', 'borra los gastos de esta semana', 'borra todo lo de agosto')"
    ),
  cantidad: z
    .number()
    .nullable()
    .describe("Si objetivo es 'ultimo' y pide borrar varios (ej 'borra los ultimos 3 gastos'), cuantos. null si no especifica cantidad (se borra 1)"),
  texto_busqueda: z
    .string()
    .nullable()
    .describe("Si objetivo es 'coincidencia', la palabra clave a buscar en la categoria o descripcion (ej 'kiosko'). null en los demas casos"),
  periodo: z
    .enum(["dia", "semana", "mes", "anio"])
    .nullable()
    .describe("Si objetivo es 'periodo', el periodo a borrar (dia/semana/mes/anio). null en los demas casos"),
  fecha: z
    .string()
    .nullable()
    .describe(
      "Si objetivo es 'periodo', fecha de referencia YYYY-MM-DD dentro de ese periodo (ej 'agosto' -> 1 de agosto). null si no especifica una fecha puntual (se asume hoy/esta semana/este mes/este anio), o si objetivo no es 'periodo'"
    ),
});

const editarSchema = z.object({
  tipo: z.literal("editar"),
  monto: z.number().nullable().describe("Nuevo monto del ultimo gasto, si lo menciona. null si no cambia"),
  categoria: z.enum(CATEGORIAS).nullable().describe("Nueva categoria del ultimo gasto, si la menciona. null si no cambia"),
  descripcion: z.string().nullable().describe("Nueva descripcion del ultimo gasto, si la menciona. null si no cambia"),
});

const otroSchema = z.object({
  tipo: z.literal("otro"),
});

const mensajeSchema = z.discriminatedUnion("tipo", [
  gastoSchema,
  resumenSchema,
  listadoSchema,
  borrarSchema,
  editarSchema,
  otroSchema,
]);

export type MensajeInterpretado = z.infer<typeof mensajeSchema>;

// Modelo servido a traves del Vercel AI Gateway.
// Verificar el nombre vigente en https://ai.google.dev si Gemini renombra la serie Flash.
const MODELO = "google/gemini-2.5-flash";

export async function interpretarMensaje(texto: string): Promise<MensajeInterpretado> {
  const hoy = hoyISOEnArgentina();
  const { object } = await generateObject({
    model: MODELO,
    schema: mensajeSchema,
    prompt: `Sos un asistente de WhatsApp para un registro personal de gastos en pesos argentinos.

Hoy es ${hoy}.

El usuario puede escribir estos tipos de mensajes, y tenes que clasificar cual es:

1. Uno o mas gastos nuevos para guardar (tipo "gasto"): frases como "gaste 5000 en el super" o "3000 pesos de nafta". El usuario tambien puede mandar varios gastos juntos en un solo mensaje, ej: "gaste 300 en el kiosco, 8000 en el cine y 50000 en un pantalon" -> eso son 3 gastos distintos, uno por cada item en la lista "gastos". Para cada uno, extraé el monto, la categoria mas adecuada de esta lista (${CATEGORIAS.join(", ")}), una descripcion corta y la fecha del gasto.

2. Un pedido de resumen o estadisticas con totales (tipo "resumen"): frases como "resumen de hoy", "cuanto gaste esta semana", "resumen de este mes", "resumen del anio", "cuanto llevo gastado en 2026". Es cuando el usuario quiere el TOTAL y el desglose por categoria, no cada gasto individual. Elegi el periodo (dia/semana/mes/anio) segun lo que pida; si pide un mes o anio puntual poné una fecha de referencia dentro de ese periodo, si no la deja en null.

3. Un pedido de listado, es decir, ver cada gasto individual de un periodo (tipo "listado"): frases como "que gaste hoy", "dame el listado de esta semana", "los gastos de agosto", "que cargue el lunes", "mostrame todos los gastos del mes". Es cuando el usuario quiere ver CADA gasto por separado, no solo el total. Mismo formato de periodo/fecha que "resumen".

4. Un pedido de borrar gastos (tipo "borrar"). Hay 4 variantes:
   - objetivo "ultimo": "borra eso", "borra el ultimo gasto", "me equivoque, borralo", "elimina el gasto anterior", "borra los ultimos 3 gastos" (cantidad: 3).
   - objetivo "todos": "borra todo", "vacia la planilla", "borra todos los gastos" (sin mencionar un periodo puntual, es decir toda la historia).
   - objetivo "coincidencia": "borra el gasto del kiosko", "elimina el del cine", "borra el gasto de nafta" -> texto_busqueda con la palabra clave (ej "kiosko", "cine", "nafta").
   - objetivo "periodo": "borra todos los gastos de hoy", "borra los gastos de esta semana", "borra todo lo de agosto", "elimina los gastos de este mes" -> periodo (dia/semana/mes/anio) y fecha de referencia si menciona un periodo puntual.

5. Un pedido de corregir o editar el ultimo gasto cargado, sin borrarlo (tipo "editar"): frases como "en realidad fueron 4000", "cambia la categoria a Transporte", "era en el super, no en el kiosco". Extraé solo los campos que menciona (monto/categoria/descripcion), dejando en null los que no cambia.

6. Cualquier otra cosa que no sea ninguno de los anteriores (tipo "otro"): preguntas sueltas, saludos, mensajes que no se entienden, etc. Nunca inventes un gasto de $0 para esto.

Mensaje del usuario: "${texto}"`,
  });
  return object;
}
