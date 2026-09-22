import { google } from "googleapis";
import { env } from "@/lib/env";
import { nombreMes } from "@/lib/meses";

const SHEET_NAME = "Gastos";
const HEADER = ["Fecha", "Categoria", "Descripcion", "Monto"];

const COLOR_ENCABEZADO = { red: 0.16, green: 0.32, blue: 0.28 };
const COLOR_DATOS = { red: 1, green: 1, blue: 1 };
const COLOR_SEPARADOR = { red: 0.82, green: 0.89, blue: 0.87 };

async function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL(),
    key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

type SheetsClient = Awaited<ReturnType<typeof getSheetsClient>>;

export type NuevoGasto = {
  fecha: string; // YYYY-MM-DD
  monto: number;
  categoria: string;
  descripcion: string;
};

export async function formatearPlanillaExistente(): Promise<void> {
  const sheetsClient = await getSheetsClient();
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
  await formatearHoja(sheetsClient, spreadsheetId, sheetId);
}

async function obtenerSheetId(sheetsClient: SheetsClient, spreadsheetId: string): Promise<number> {
  const res = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const hoja = res.data.sheets?.find(
    (s) => s.properties?.title?.toLowerCase() === SHEET_NAME.toLowerCase()
  );
  if (hoja?.properties?.sheetId == null) {
    throw new Error(`No se encontro la hoja "${SHEET_NAME}" en la planilla`);
  }
  return hoja.properties.sheetId;
}

async function formatearHoja(sheetsClient: SheetsClient, spreadsheetId: string, sheetId: number) {
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
                backgroundColor: COLOR_ENCABEZADO,
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
        // Fondo blanco y texto normal (no negrita) para el resto de la hoja,
        // asi las filas de datos nunca se confunden con el encabezado.
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADER.length },
            cell: {
              userEnteredFormat: {
                backgroundColor: COLOR_DATOS,
                textFormat: { bold: false, italic: false, foregroundColor: { red: 0, green: 0, blue: 0 } },
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)",
          },
        },
        // Limpiar cualquier formato numerico previo en Categoria/Descripcion.
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 3 },
            cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
            fields: "userEnteredFormat.numberFormat",
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
        // Formato de moneda en la columna D (Monto).
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 4 },
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

async function ensureHeader(sheetsClient: SheetsClient) {
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:D1`,
  });
  if (!res.data.values || res.data.values.length === 0) {
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:D1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER] },
    });
    const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
    await formatearHoja(sheetsClient, spreadsheetId, sheetId);
  }
}

// Extrae el numero de la primera fila de un rango tipo "Gastos!A5:D5".
function primeraFilaDeRango(updatedRange: string | null | undefined): number | null {
  const match = updatedRange?.match(/![A-Z]+(\d+):/);
  return match ? Number(match[1]) : null;
}

async function formatearFilaDeGasto(
  sheetsClient: SheetsClient,
  spreadsheetId: string,
  sheetId: number,
  numeroFila: number
) {
  const filaIndex0 = numeroFila - 1;
  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Reset de fondo/texto: una fila nueva hereda el formato de la fila
        // de arriba (encabezado o separador), hay que devolverla a la normal.
        {
          repeatCell: {
            range: { sheetId, startRowIndex: filaIndex0, endRowIndex: filaIndex0 + 1, startColumnIndex: 0, endColumnIndex: 4 },
            cell: {
              userEnteredFormat: {
                backgroundColor: COLOR_DATOS,
                textFormat: { bold: false, italic: false, foregroundColor: { red: 0, green: 0, blue: 0 } },
                horizontalAlignment: "LEFT",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: filaIndex0, endRowIndex: filaIndex0 + 1, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: filaIndex0, endRowIndex: filaIndex0 + 1, startColumnIndex: 3, endColumnIndex: 4 },
            cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
      ],
    },
  });
}

async function agregarSeparadorDeMes(
  sheetsClient: SheetsClient,
  spreadsheetId: string,
  sheetId: number,
  fechaISO: string
) {
  const [anioStr, mesStr] = fechaISO.split("-");
  const etiqueta = `${nombreMes(Number(mesStr))} ${anioStr}`;

  const appendRes = await sheetsClient.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:D`,
    valueInputOption: "RAW", // evita que Sheets interprete la etiqueta como fecha
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[etiqueta, "", "", ""]] },
  });

  const numeroFila = primeraFilaDeRango(appendRes.data.updates?.updatedRange);
  if (numeroFila == null) return;
  const filaIndex0 = numeroFila - 1;

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          mergeCells: {
            range: { sheetId, startRowIndex: filaIndex0, endRowIndex: filaIndex0 + 1, startColumnIndex: 0, endColumnIndex: 4 },
            mergeType: "MERGE_ALL",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: filaIndex0, endRowIndex: filaIndex0 + 1, startColumnIndex: 0, endColumnIndex: 4 },
            cell: {
              userEnteredFormat: {
                backgroundColor: COLOR_SEPARADOR,
                textFormat: { bold: true, italic: true, foregroundColor: { red: 0.1, green: 0.2, blue: 0.18 } },
                horizontalAlignment: "CENTER",
                numberFormat: { type: "TEXT" },
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,numberFormat)",
          },
        },
      ],
    },
  });
}

// Mes (YYYY-MM) de la ultima fila de datos real cargada (ignora separadores).
async function obtenerUltimoMesCargado(sheetsClient: SheetsClient, spreadsheetId: string): Promise<string | null> {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:A`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  for (let i = filas.length - 1; i >= 0; i--) {
    const valor = filas[i]?.[0];
    if (typeof valor === "number") {
      const fecha = fechaDesdeSerialDeSheets(valor);
      return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
    }
  }
  return null;
}

async function agregarUnGasto(sheetsClient: SheetsClient, spreadsheetId: string, sheetId: number, gasto: NuevoGasto) {
  const mesDelGasto = gasto.fecha.slice(0, 7);
  const ultimoMes = await obtenerUltimoMesCargado(sheetsClient, spreadsheetId);
  if (ultimoMes !== mesDelGasto) {
    await agregarSeparadorDeMes(sheetsClient, spreadsheetId, sheetId, gasto.fecha);
  }

  const appendRes = await sheetsClient.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:D`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[gasto.fecha, gasto.categoria, gasto.descripcion, gasto.monto]] },
  });

  const numeroFila = primeraFilaDeRango(appendRes.data.updates?.updatedRange);
  if (numeroFila != null) {
    await formatearFilaDeGasto(sheetsClient, spreadsheetId, sheetId, numeroFila);
  }
}

export async function agregarGasto(gasto: NuevoGasto): Promise<void> {
  const sheetsClient = await getSheetsClient();
  await ensureHeader(sheetsClient);
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
  await agregarUnGasto(sheetsClient, spreadsheetId, sheetId, gasto);
}

// Carga varios gastos de una (por ejemplo, un import historico). Los inserta
// en orden, agregando separadores de mes donde corresponda.
export async function agregarGastos(gastos: NuevoGasto[]): Promise<void> {
  if (gastos.length === 0) return;
  const sheetsClient = await getSheetsClient();
  await ensureHeader(sheetsClient);
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
  for (const gasto of gastos) {
    await agregarUnGasto(sheetsClient, spreadsheetId, sheetId, gasto);
  }
}

export type FilaGasto = {
  fecha: Date;
  categoria: string;
  descripcion: string;
  monto: number;
};

// Los valores de fecha en Sheets son un numero serial de dias desde el
// 30/12/1899 (epoch de Sheets/Excel). Lo convertimos a Date en UTC.
function fechaDesdeSerialDeSheets(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
}

export async function leerGastos(): Promise<FilaGasto[]> {
  const sheetsClient = await getSheetsClient();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID(),
    range: `${SHEET_NAME}!A2:D`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  // Las filas separadoras de mes tienen texto en la columna A en vez de un
  // numero serial de fecha, asi que quedan afuera solas con este filtro.
  return filas
    .filter((fila) => typeof fila[0] === "number")
    .map((fila) => ({
      fecha: fechaDesdeSerialDeSheets(Number(fila[0])),
      categoria: String(fila[1] ?? ""),
      descripcion: String(fila[2] ?? ""),
      monto: Number(fila[3]) || 0,
    }));
}

export async function borrarUltimoGasto(): Promise<FilaGasto | null> {
  const sheetsClient = await getSheetsClient();
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:D`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  // Buscamos la ultima fila que sea un gasto real (no un separador de mes).
  let indice = filas.length - 1;
  while (indice >= 0 && typeof filas[indice]?.[0] !== "number") {
    indice--;
  }
  if (indice < 0) return null;

  const ultima = filas[indice];
  const numeroFilaEnHoja = indice + 2; // fila 1 = encabezado, filas[0] = fila 2, etc.
  const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: numeroFilaEnHoja - 1,
              endIndex: numeroFilaEnHoja,
            },
          },
        },
      ],
    },
  });

  return {
    fecha: fechaDesdeSerialDeSheets(Number(ultima[0])),
    categoria: String(ultima[1] ?? ""),
    descripcion: String(ultima[2] ?? ""),
    monto: Number(ultima[3]) || 0,
  };
}

export type CambiosGasto = Partial<Pick<NuevoGasto, "fecha" | "monto" | "categoria" | "descripcion">>;

export async function editarUltimoGasto(cambios: CambiosGasto): Promise<FilaGasto | null> {
  const sheetsClient = await getSheetsClient();
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:D`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  let indice = filas.length - 1;
  while (indice >= 0 && typeof filas[indice]?.[0] !== "number") {
    indice--;
  }
  if (indice < 0) return null;

  const ultima = filas[indice];
  const numeroFila = indice + 2; // fila 1 = encabezado, filas[0] = fila 2, etc.

  const fechaActual = fechaDesdeSerialDeSheets(Number(ultima[0])).toISOString().slice(0, 10);
  const fechaFinal = cambios.fecha ?? fechaActual;
  const categoriaFinal = cambios.categoria ?? String(ultima[1] ?? "");
  const descripcionFinal = cambios.descripcion ?? String(ultima[2] ?? "");
  const montoFinal = cambios.monto ?? (Number(ultima[3]) || 0);

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A${numeroFila}:D${numeroFila}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[fechaFinal, categoriaFinal, descripcionFinal, montoFinal]] },
  });

  const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
  await formatearFilaDeGasto(sheetsClient, spreadsheetId, sheetId, numeroFila);

  return {
    fecha: new Date(`${fechaFinal}T00:00:00Z`),
    categoria: categoriaFinal,
    descripcion: descripcionFinal,
    monto: montoFinal,
  };
}
