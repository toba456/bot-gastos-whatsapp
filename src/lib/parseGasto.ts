import { generateObject } from "ai";
import { z } from "zod";
import { CATEGORIAS } from "@/lib/categorias";

const gastoSchema = z.object({
  monto: z.number().describe("Monto del gasto en pesos, siempre positivo"),
  categoria: z.enum(CATEGORIAS),
  descripcion: z.string().describe("Descripcion corta del gasto, ej: 'nafta', 'super del mes'"),
  fecha: z
    .string()
    .describe("Fecha del gasto en formato YYYY-MM-DD. Si no se menciona, usar la fecha de hoy."),
});

export type GastoExtraido = z.infer<typeof gastoSchema>;

// Modelo servido a traves del Vercel AI Gateway.
// Verificar el nombre vigente en https://ai.google.dev si Gemini renombra la serie Flash.
const MODELO = "google/gemini-2.5-flash";

export async function interpretarGastoDeTexto(texto: string): Promise<GastoExtraido> {
  const hoy = new Date().toISOString().slice(0, 10);
  const { object } = await generateObject({
    model: MODELO,
    schema: gastoSchema,
    prompt: `Sos un asistente que interpreta mensajes de WhatsApp sobre gastos personales en pesos argentinos y los convierte en datos estructurados.

Hoy es ${hoy}.

Mensaje del usuario: "${texto}"

Extraé el monto, la categoria mas adecuada de esta lista (${CATEGORIAS.join(", ")}), una descripcion corta y la fecha del gasto.`,
  });
  return object;
}
