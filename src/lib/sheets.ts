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

export async function formatearPlanillaExistente(): Promise<void> {
  const sheetsClient = await getSheetsClient();
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
  await formatearHoja(sheetsClient, spreadsheetId, sheetId);
}

async function obtenerSheetId(
  sheetsClient: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string
): Promise<number> {
  const res = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const hoja = res.data.sheets?.find(
    (s) => s.properties?.title?.toLowerCase() === SHEET_NAME.toLowerCase()
  );
  if (hoja?.properties?.sheetId == null) {
    throw new Error(`No se encontro la hoja "${SHEET_NAME}" en la planilla`);
  }
  return hoja.properties.sheetId;
}

async function formatearHoja(
  sheetsClient: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  sheetId: number
) {
  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Encabezado en negrita, con fondo y texto blanco.
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADER.length },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.16, green: 0.32, blue: 0.28 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                horizontalAlignment: "CENTER",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
          },
        },
        // Congelar la fila de encabezado.
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
        // Formato de fecha en la columna A.
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        // Formato de moneda en la columna B (Monto).
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: '$#,##0' } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        // Ajustar el ancho de todas las columnas al contenido.
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: HEADER.length },
          },
        },
        // Filtro en el encabezado para poder ordenar/filtrar facil.
        {
          setBasicFilter: {
            filter: {
              range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: HEADER.length },
            },
          },
        },
      ],
    },
  });
}

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
    const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
    await formatearHoja(sheetsClient, spreadsheetId, sheetId);
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
