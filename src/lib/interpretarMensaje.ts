import { generateObject } from "ai";
import { z } from "zod";
import { CATEGORIAS } from "@/lib/categorias";

const gastoSchema = z.object({
  tipo: z.literal("gasto"),
  monto: z.number().describe("Monto del gasto en pesos, siempre positivo"),
  categoria: z.enum(CATEGORIAS),
  descripcion: z.string().describe("Descripcion corta del gasto, ej: 'nafta', 'super del mes'"),
  fecha: z
    .string()
    .describe("Fecha del gasto en formato YYYY-MM-DD. Si no se menciona, usar la fecha de hoy."),
});

const resumenSchema = z.object({
  tipo: z.literal("resumen"),
  mes: z
    .number()
    .min(1)
    .max(12)
    .nullable()
    .describe("Mes solicitado (1-12). null si no se especifica un mes (se asume el mes actual)"),
  anio: z
    .number()
    .nullable()
    .describe("Anio solicitado, ej 2026. null si no se especifica (se asume el anio actual)"),
});

const mensajeSchema = z.discriminatedUnion("tipo", [gastoSchema, resumenSchema]);

export type MensajeInterpretado = z.infer<typeof mensajeSchema>;

// Modelo servido a traves del Vercel AI Gateway.
// Verificar el nombre vigente en https://ai.google.dev si Gemini renombra la serie Flash.
const MODELO = "google/gemini-2.5-flash";

export async function interpretarMensaje(texto: string): Promise<MensajeInterpretado> {
  const hoy = new Date().toISOString().slice(0, 10);
  const { object } = await generateObject({
    model: MODELO,
    schema: mensajeSchema,
    prompt: `Sos un asistente de WhatsApp para un registro personal de gastos en pesos argentinos.

Hoy es ${hoy}.

El usuario puede escribir dos tipos de mensajes, y tenes que clasificar cual es:

1. Un gasto nuevo para guardar (tipo "gasto"): frases como "gaste 5000 en el super" o "3000 pesos de nafta". Extraé el monto, la categoria mas adecuada de esta lista (${CATEGORIAS.join(", ")}), una descripcion corta y la fecha del gasto.

2. Un pedido de resumen o estadisticas (tipo "resumen"): frases como "resumen de este mes", "cuanto gaste en agosto", "gastos de julio 2025", "mandame el grafico del mes". Extraé el mes y anio si los menciona explicitamente (si no, dejalos en null).

Mensaje del usuario: "${texto}"`,
  });
  return object;
}
