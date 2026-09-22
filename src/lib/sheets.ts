import { google } from "googleapis";
import { env } from "@/lib/env";

const SHEET_NAME = "Gastos";
const HEADER = ["Fecha", "Monto", "Categoria", "Descripcion", "Origen", "Numero"];

async function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL(),
    key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export type NuevoGasto = {
  fecha: string; // YYYY-MM-DD
  monto: number;
  categoria: string;
  descripcion: string;
  origen: "texto" | "audio" | "imagen" | "mercado_pago";
  numero: string; // numero de WhatsApp de origen
};

async function ensureHeader(sheetsClient: Awaited<ReturnType<typeof getSheetsClient>>) {
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:F1`,
  });
  if (!res.data.values || res.data.values.length === 0) {
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:F1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER] },
    });
  }
}

export async function agregarGasto(gasto: NuevoGasto): Promise<void> {
  const sheetsClient = await getSheetsClient();
  await ensureHeader(sheetsClient);
  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID(),
    range: `${SHEET_NAME}!A:F`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          gasto.fecha,
          gasto.monto,
          gasto.categoria,
          gasto.descripcion,
          gasto.origen,
          gasto.numero,
        ],
      ],
    },
  });
}
