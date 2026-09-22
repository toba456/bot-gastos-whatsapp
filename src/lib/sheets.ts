import { google } from "googleapis";
import { env } from "@/lib/env";
import { nombreMes } from "@/lib/meses";

const SHEET_NAME = "Gastos";
const HEADER = ["ID", "Fecha", "Categoria", "Descripcion", "Monto"];

const COLOR_ENCABEZADO = { red: 0.16, green: 0.32, blue: 0.28 };
const COLOR_DATOS = { red: 1, green: 1, blue: 1 };
const COLOR_SEPARADOR = { red: 0.82, green: 0.89, blue: 0.87 };
const COLOR_TOTAL_MES = { red: 0.96, green: 0.65, blue: 0.14 }; // ambar, bien llamativo

// Paleta de fondos pastel para las filas de datos: cada mes calendario usa
// un color distinto (ciclico), asi se distinguen los bloques de un vistazo.
const PALETA_MESES = [
  { red: 1, green: 1, blue: 1 }, // blanco
  { red: 0.93, green: 0.97, blue: 0.91 }, // verde clarito
  { red: 0.91, green: 0.95, blue: 0.99 }, // azul clarito
  { red: 1, green: 0.97, blue: 0.88 }, // amarillo clarito
  { red: 0.99, green: 0.9, blue: 0.94 }, // rosa clarito
  { red: 0.93, green: 0.91, blue: 0.98 }, // violeta clarito
];

function colorDelMes(fechaISO: string): { red: number; green: number; blue: number } {
  const [anio, mes] = fechaISO.split("-").map(Number);
  const indice = (anio * 12 + (mes - 1)) % PALETA_MESES.length;
  return PALETA_MESES[indice];
}

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
        // ID como numero entero, centrado.
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
            cell: {
              userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0" }, horizontalAlignment: "CENTER" },
            },
            fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
          },
        },
        // Limpiar cualquier formato numerico previo en Categoria/Descripcion.
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 4 },
            cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        // Formato de fecha en la columna Fecha.
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        // Formato de moneda en la columna Monto.
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
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
        // Columna G: donde se muestra el total de cada mes (columna F queda
        // como espacio en blanco a proposito, para separarla de la tabla).
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 8 },
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
    range: `${SHEET_NAME}!A1:E1`,
  });
  if (!res.data.values || res.data.values.length === 0) {
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:E1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER] },
    });
    const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
    await formatearHoja(sheetsClient, spreadsheetId, sheetId);
  }
}

// Extrae el numero de la primera fila de un rango tipo "Gastos!A5:E5".
function primeraFilaDeRango(updatedRange: string | null | undefined): number | null {
  const match = updatedRange?.match(/![A-Z]+(\d+):/);
  return match ? Number(match[1]) : null;
}

async function formatearFilaDeGasto(
  sheetsClient: SheetsClient,
  spreadsheetId: string,
  sheetId: number,
  numeroFila: number,
  colorFondo: { red: number; green: number; blue: number } = COLOR_DATOS
) {
  const filaIndex0 = numeroFila - 1;
  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Reset de fondo/texto: una fila nueva hereda el formato de la fila
        // de arriba (encabezado o separador), hay que devolverla a la normal
        // (con el color que le corresponde a su mes).
        {
          repeatCell: {
            range: { sheetId, startRowIndex: filaIndex0, endRowIndex: filaIndex0 + 1, startColumnIndex: 0, endColumnIndex: 5 },
            cell: {
              userEnteredFormat: {
                backgroundColor: colorFondo,
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
            cell: {
              userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0" }, horizontalAlignment: "CENTER" },
            },
            fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: filaIndex0, endRowIndex: filaIndex0 + 1, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: filaIndex0, endRowIndex: filaIndex0 + 1, startColumnIndex: 4, endColumnIndex: 5 },
            cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
      ],
    },
  });
}

function formatearPesosPlano(monto: number): string {
  return `$${monto.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

// Crea la fila separadora de un mes nuevo (sin total: recien empieza, no se
// sabe cuanto se va a gastar todavia).
async function agregarSeparadorDeMes(
  sheetsClient: SheetsClient,
  spreadsheetId: string,
  sheetId: number,
  fechaISO: string
): Promise<number | null> {
  const [anioStr, mesStr] = fechaISO.split("-");
  const etiqueta = `${nombreMes(Number(mesStr))} ${anioStr}`;

  const appendRes = await sheetsClient.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:E`,
    valueInputOption: "RAW", // evita que Sheets interprete la etiqueta como fecha
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[etiqueta, "", "", "", ""]] },
  });

  const numeroFila = primeraFilaDeRango(appendRes.data.updates?.updatedRange);
  if (numeroFila == null) return null;
  const filaIndex0 = numeroFila - 1;

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          mergeCells: {
            range: { sheetId, startRowIndex: filaIndex0, endRowIndex: filaIndex0 + 1, startColumnIndex: 0, endColumnIndex: 5 },
            mergeType: "MERGE_ALL",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: filaIndex0, endRowIndex: filaIndex0 + 1, startColumnIndex: 0, endColumnIndex: 5 },
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

  return numeroFila;
}

// Escribe el total de un mes al lado del titulo de SU PROPIO separador
// (columna G, con F como espacio en blanco), bien destacado en ambar. Se
// llama cuando ese mes termina (arranca el siguiente), buscando la fila del
// separador que ya existe con la etiqueta de ese mes.
async function escribirTotalEnSeparador(
  sheetsClient: SheetsClient,
  spreadsheetId: string,
  sheetId: number,
  etiquetaMes: string,
  total: number
) {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:A`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  let indice = -1;
  for (let i = filas.length - 1; i >= 0; i--) {
    if (filas[i]?.[0] === etiquetaMes) {
      indice = i;
      break;
    }
  }
  if (indice === -1) return;

  const numeroFila = indice + 2;
  const filaIndex0 = numeroFila - 1;
  const texto = `Total: ${formatearPesosPlano(total)}`;

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!G${numeroFila}`,
    valueInputOption: "RAW",
    requestBody: { values: [[texto]] },
  });

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          mergeCells: {
            range: { sheetId, startRowIndex: filaIndex0, endRowIndex: filaIndex0 + 1, startColumnIndex: 6, endColumnIndex: 8 },
            mergeType: "MERGE_ALL",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: filaIndex0, endRowIndex: filaIndex0 + 1, startColumnIndex: 6, endColumnIndex: 8 },
            cell: {
              userEnteredFormat: {
                backgroundColor: COLOR_TOTAL_MES,
                textFormat: { bold: true, foregroundColor: { red: 0.25, green: 0.13, blue: 0 } },
                horizontalAlignment: "CENTER",
                numberFormat: { type: "TEXT" },
                borders: {
                  top: { style: "SOLID", width: 2, color: { red: 0.6, green: 0.4, blue: 0 } },
                  bottom: { style: "SOLID", width: 2, color: { red: 0.6, green: 0.4, blue: 0 } },
                  left: { style: "SOLID", width: 2, color: { red: 0.6, green: 0.4, blue: 0 } },
                  right: { style: "SOLID", width: 2, color: { red: 0.6, green: 0.4, blue: 0 } },
                },
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,numberFormat,borders)",
          },
        },
      ],
    },
  });
}

// Indices (dentro de `filas`, un array que arranca en la fila 2 de la hoja)
// de las filas que son gastos reales, ignorando separadores de mes (que
// tienen texto en la columna ID en vez de un numero).
function indicesDeGastos(filas: unknown[][]): number[] {
  const indices: number[] = [];
  filas.forEach((fila, i) => {
    if (typeof fila[0] === "number") indices.push(i);
  });
  return indices;
}

function filaAGasto(fila: unknown[]): FilaGasto {
  return {
    id: Number(fila[0]),
    fecha: fechaDesdeSerialDeSheets(Number(fila[1])),
    categoria: String(fila[2] ?? ""),
    descripcion: String(fila[3] ?? ""),
    monto: Number(fila[4]) || 0,
  };
}

// Mes (YYYY-MM) del ultimo gasto real cargado (ignora separadores) junto
// con su total, y el mayor ID usado hasta ahora (para asignarle el
// siguiente al nuevo gasto).
async function obtenerUltimoMesYUltimoId(
  sheetsClient: SheetsClient,
  spreadsheetId: string
): Promise<{ ultimoMes: string | null; totalUltimoMes: number; ultimoId: number }> {
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:E`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];

  let ultimoId = 0;
  for (const fila of filas) {
    const id = fila[0];
    if (typeof id === "number" && id > ultimoId) ultimoId = id;
  }

  let ultimoMes: string | null = null;
  for (let i = filas.length - 1; i >= 0; i--) {
    const fila = filas[i];
    if (typeof fila[0] === "number") {
      const fecha = fechaDesdeSerialDeSheets(Number(fila[1]));
      ultimoMes = `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
      break;
    }
  }

  let totalUltimoMes = 0;
  if (ultimoMes) {
    for (const fila of filas) {
      if (typeof fila[0] !== "number") continue;
      const fecha = fechaDesdeSerialDeSheets(Number(fila[1]));
      const mesFila = `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
      if (mesFila === ultimoMes) totalUltimoMes += Number(fila[4]) || 0;
    }
  }

  return { ultimoMes, totalUltimoMes, ultimoId };
}

async function agregarUnGasto(
  sheetsClient: SheetsClient,
  spreadsheetId: string,
  sheetId: number,
  gasto: NuevoGasto
): Promise<FilaGasto> {
  const mesDelGasto = gasto.fecha.slice(0, 7);
  const { ultimoMes, totalUltimoMes, ultimoId } = await obtenerUltimoMesYUltimoId(sheetsClient, spreadsheetId);
  if (ultimoMes !== mesDelGasto) {
    if (ultimoMes) {
      const [anioAnt, mesAnt] = ultimoMes.split("-");
      const etiquetaAnt = `${nombreMes(Number(mesAnt))} ${anioAnt}`;
      await escribirTotalEnSeparador(sheetsClient, spreadsheetId, sheetId, etiquetaAnt, totalUltimoMes);
    }
    await agregarSeparadorDeMes(sheetsClient, spreadsheetId, sheetId, gasto.fecha);
  }

  const id = ultimoId + 1;
  const appendRes = await sheetsClient.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:E`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[id, gasto.fecha, gasto.categoria, gasto.descripcion, gasto.monto]] },
  });

  const numeroFila = primeraFilaDeRango(appendRes.data.updates?.updatedRange);
  if (numeroFila != null) {
    await formatearFilaDeGasto(sheetsClient, spreadsheetId, sheetId, numeroFila, colorDelMes(gasto.fecha));
  }

  return { id, fecha: new Date(`${gasto.fecha}T00:00:00Z`), categoria: gasto.categoria, descripcion: gasto.descripcion, monto: gasto.monto };
}

export async function agregarGasto(gasto: NuevoGasto): Promise<FilaGasto> {
  const sheetsClient = await getSheetsClient();
  await ensureHeader(sheetsClient);
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
  return agregarUnGasto(sheetsClient, spreadsheetId, sheetId, gasto);
}

// Carga varios gastos de una (por ejemplo, un import historico, o varios
// gastos mencionados en el mismo mensaje). Los inserta en orden, agregando
// separadores de mes donde corresponda, y devuelve cada uno con su ID.
export async function agregarGastos(gastos: NuevoGasto[]): Promise<FilaGasto[]> {
  if (gastos.length === 0) return [];
  const sheetsClient = await getSheetsClient();
  await ensureHeader(sheetsClient);
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
  const resultados: FilaGasto[] = [];
  for (const gasto of gastos) {
    resultados.push(await agregarUnGasto(sheetsClient, spreadsheetId, sheetId, gasto));
  }
  return resultados;
}

export type FilaGasto = {
  id: number;
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
    range: `${SHEET_NAME}!A2:E`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  // Las filas separadoras de mes tienen texto en la columna ID en vez de un
  // numero, asi que quedan afuera solas con este filtro.
  return filas.filter((fila) => typeof fila[0] === "number").map(filaAGasto);
}

export async function contarGastos(): Promise<number> {
  const gastos = await leerGastos();
  return gastos.length;
}

// Solo consulta, no borra nada: para mostrarle al usuario que se va a borrar
// antes de pedir confirmacion.
export async function previsualizarUltimos(cantidad: number): Promise<FilaGasto[]> {
  const gastos = await leerGastos();
  return gastos.slice(-cantidad);
}

export async function previsualizarEnRango(inicio: Date, fin: Date): Promise<FilaGasto[]> {
  const gastos = await leerGastos();
  return gastos.filter((g) => g.fecha >= inicio && g.fecha < fin);
}

export async function previsualizarCoincidencia(texto: string): Promise<FilaGasto | null> {
  const gastos = await leerGastos();
  const textoLower = texto.toLowerCase();
  for (let i = gastos.length - 1; i >= 0; i--) {
    const g = gastos[i];
    if (g.categoria.toLowerCase().includes(textoLower) || g.descripcion.toLowerCase().includes(textoLower)) {
      return g;
    }
  }
  return null;
}

export async function previsualizarPorIds(ids: number[]): Promise<FilaGasto[]> {
  const gastos = await leerGastos();
  const idsSet = new Set(ids);
  return gastos.filter((g) => idsSet.has(g.id));
}

async function borrarFilasPorIndices(
  sheetsClient: SheetsClient,
  spreadsheetId: string,
  filas: unknown[][],
  indices: number[]
): Promise<FilaGasto[]> {
  if (indices.length === 0) return [];
  const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
  const requests = indices
    .slice()
    .sort((a, b) => b - a) // de abajo hacia arriba, para no correr los indices restantes
    .map((i) => ({
      deleteDimension: {
        range: { sheetId, dimension: "ROWS" as const, startIndex: i + 1, endIndex: i + 2 },
      },
    }));
  await sheetsClient.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  return indices.map((i) => filaAGasto(filas[i]));
}

export async function borrarGastosEnRango(inicio: Date, fin: Date): Promise<FilaGasto[]> {
  const sheetsClient = await getSheetsClient();
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:E`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  const indices = indicesDeGastos(filas).filter((i) => {
    const g = filaAGasto(filas[i]);
    return g.fecha >= inicio && g.fecha < fin;
  });
  return borrarFilasPorIndices(sheetsClient, spreadsheetId, filas, indices);
}

export async function borrarUltimosGastos(cantidad: number): Promise<FilaGasto[]> {
  const sheetsClient = await getSheetsClient();
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:E`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  const indices = indicesDeGastos(filas).slice(-cantidad);
  return borrarFilasPorIndices(sheetsClient, spreadsheetId, filas, indices);
}

export async function borrarGastoPorTexto(texto: string): Promise<FilaGasto | null> {
  const sheetsClient = await getSheetsClient();
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:E`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  const textoLower = texto.toLowerCase();
  let indice = -1;
  for (const i of indicesDeGastos(filas).reverse()) {
    const categoria = String(filas[i][2] ?? "").toLowerCase();
    const descripcion = String(filas[i][3] ?? "").toLowerCase();
    if (categoria.includes(textoLower) || descripcion.includes(textoLower)) {
      indice = i;
      break;
    }
  }
  if (indice === -1) return null;
  const borrados = await borrarFilasPorIndices(sheetsClient, spreadsheetId, filas, [indice]);
  return borrados[0] ?? null;
}

export async function borrarGastosPorIds(ids: number[]): Promise<FilaGasto[]> {
  const sheetsClient = await getSheetsClient();
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:E`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  const idsSet = new Set(ids);
  const indices = indicesDeGastos(filas).filter((i) => idsSet.has(Number(filas[i][0])));
  return borrarFilasPorIndices(sheetsClient, spreadsheetId, filas, indices);
}

// Borra todas las filas de datos (gastos + separadores de mes) y las
// re-crea vacias. Usar deleteDimension + appendDimension (en vez de solo
// limpiar valores) evita que queden fusiones de celdas viejas de
// separadores, que confunden a los proximos appends.
export async function borrarTodosLosGastos(): Promise<number> {
  const sheetsClient = await getSheetsClient();
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:A`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  if (filas.length === 0) return 0;

  const cantidadGastos = filas.filter((f) => typeof f[0] === "number").length;
  const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: 1, endIndex: 1 + filas.length } } },
        { appendDimension: { sheetId, dimension: "ROWS", length: filas.length } },
      ],
    },
  });

  return cantidadGastos;
}

export type CambiosGasto = Partial<Pick<NuevoGasto, "fecha" | "monto" | "categoria" | "descripcion">>;

function aplicarCambios(fila: unknown[], cambios: CambiosGasto): { fila: unknown[]; resultado: FilaGasto } {
  const id = Number(fila[0]);
  const fechaActual = fechaDesdeSerialDeSheets(Number(fila[1])).toISOString().slice(0, 10);
  const fechaFinal = cambios.fecha ?? fechaActual;
  const categoriaFinal = cambios.categoria ?? String(fila[2] ?? "");
  const descripcionFinal = cambios.descripcion ?? String(fila[3] ?? "");
  const montoFinal = cambios.monto ?? (Number(fila[4]) || 0);
  return {
    fila: [id, fechaFinal, categoriaFinal, descripcionFinal, montoFinal],
    resultado: {
      id,
      fecha: new Date(`${fechaFinal}T00:00:00Z`),
      categoria: categoriaFinal,
      descripcion: descripcionFinal,
      monto: montoFinal,
    },
  };
}

export async function editarUltimoGasto(cambios: CambiosGasto): Promise<FilaGasto | null> {
  const sheetsClient = await getSheetsClient();
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:E`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  let indice = filas.length - 1;
  while (indice >= 0 && typeof filas[indice]?.[0] !== "number") {
    indice--;
  }
  if (indice < 0) return null;

  const numeroFila = indice + 2; // fila 1 = encabezado, filas[0] = fila 2, etc.
  const { fila, resultado } = aplicarCambios(filas[indice], cambios);

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A${numeroFila}:E${numeroFila}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [fila] },
  });

  const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
  await formatearFilaDeGasto(sheetsClient, spreadsheetId, sheetId, numeroFila, colorDelMes(resultado.fecha.toISOString().slice(0, 10)));

  return resultado;
}

export async function editarGastosPorIds(ids: number[], cambios: CambiosGasto): Promise<FilaGasto[]> {
  const sheetsClient = await getSheetsClient();
  const spreadsheetId = env.GOOGLE_SHEET_ID();
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:E`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const filas = res.data.values ?? [];
  const idsSet = new Set(ids);
  const indices = indicesDeGastos(filas).filter((i) => idsSet.has(Number(filas[i][0])));
  if (indices.length === 0) return [];

  const sheetId = await obtenerSheetId(sheetsClient, spreadsheetId);
  const resultados: FilaGasto[] = [];
  const requestsDeValores: Array<{ range: string; values: unknown[][] }> = [];

  for (const indice of indices) {
    const numeroFila = indice + 2;
    const { fila, resultado } = aplicarCambios(filas[indice], cambios);
    requestsDeValores.push({ range: `${SHEET_NAME}!A${numeroFila}:E${numeroFila}`, values: [fila] });
    resultados.push(resultado);
  }

  await sheetsClient.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data: requestsDeValores },
  });

  for (let i = 0; i < indices.length; i++) {
    const resultado = resultados[i];
    await formatearFilaDeGasto(
      sheetsClient,
      spreadsheetId,
      sheetId,
      indices[i] + 2,
      colorDelMes(resultado.fecha.toISOString().slice(0, 10))
    );
  }

  return resultados;
}
