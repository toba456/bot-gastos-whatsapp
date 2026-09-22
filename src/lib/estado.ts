import { google } from "googleapis";
import { env } from "@/lib/env";

// Pestaña oculta de la misma planilla, usada solo para guardar si hay una
// accion destructiva (borrado) esperando que el usuario la confirme por
// WhatsApp. No hay base de datos aparte de Sheets, asi que el estado vive ahi.
const HOJA_ESTADO = "_estado";

async function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL(),
    key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

type SheetsClient = Awaited<ReturnType<typeof getSheetsClient>>;

export type AccionBorrado =
  | { tipo: "ultimo"; cantidad: number }
  | { tipo: "todos" }
  | { tipo: "coincidencia"; texto: string };

export type ConfirmacionPendiente = {
  accion: AccionBorrado;
  resumen: string;
};

async function asegurarHojaEstado(sheetsClient: SheetsClient): Promise<void> {
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const res = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const existe = res.data.sheets?.some((s) => s.properties?.title === HOJA_ESTADO);
  if (!existe) {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: HOJA_ESTADO, hidden: true } } }],
      },
    });
  }
}

export async function guardarConfirmacionPendiente(c: ConfirmacionPendiente): Promise<void> {
  const sheetsClient = await getSheetsClient();
  await asegurarHojaEstado(sheetsClient);
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEET_ID(),
    range: `${HOJA_ESTADO}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [[JSON.stringify(c)]] },
  });
}

export async function leerConfirmacionPendiente(): Promise<ConfirmacionPendiente | null> {
  const sheetsClient = await getSheetsClient();
  await asegurarHojaEstado(sheetsClient);
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID(),
    range: `${HOJA_ESTADO}!A1`,
  });
  const valor = res.data.values?.[0]?.[0];
  if (!valor) return null;
  try {
    return JSON.parse(valor) as ConfirmacionPendiente;
  } catch {
    return null;
  }
}

export async function borrarConfirmacionPendiente(): Promise<void> {
  const sheetsClient = await getSheetsClient();
  await sheetsClient.spreadsheets.values.clear({
    spreadsheetId: env.GOOGLE_SHEET_ID(),
    range: `${HOJA_ESTADO}!A1`,
  });
}
