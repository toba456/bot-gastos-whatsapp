import { leerGastos } from "@/lib/sheets";
import { nombreMes } from "@/lib/meses";

export type Periodo = "dia" | "semana" | "mes" | "anio";

export type Resumen = {
  periodo: Periodo;
  inicio: Date; // inclusive
  fin: Date; // exclusivo
  total: number;
  cantidadGastos: number;
  porCategoria: Array<{ categoria: string; total: number }>;
};

export { nombreMes };

function formatearFechaCorta(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function inicioYFinDePeriodo(periodo: Periodo, referencia: Date): { inicio: Date; fin: Date } {
  const anio = referencia.getUTCFullYear();
  const mes = referencia.getUTCMonth();
  const dia = referencia.getUTCDate();

  if (periodo === "dia") {
    const inicio = new Date(Date.UTC(anio, mes, dia));
    const fin = new Date(Date.UTC(anio, mes, dia + 1));
    return { inicio, fin };
  }

  if (periodo === "semana") {
    // Semana de lunes a domingo.
    const diaSemana = referencia.getUTCDay(); // 0 = domingo
    const offsetHastaLunes = diaSemana === 0 ? 6 : diaSemana - 1;
    const inicio = new Date(Date.UTC(anio, mes, dia - offsetHastaLunes));
    const fin = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate() + 7));
    return { inicio, fin };
  }

  if (periodo === "mes") {
    const inicio = new Date(Date.UTC(anio, mes, 1));
    const fin = new Date(Date.UTC(anio, mes + 1, 1));
    return { inicio, fin };
  }

  // anio
  const inicio = new Date(Date.UTC(anio, 0, 1));
  const fin = new Date(Date.UTC(anio + 1, 0, 1));
  return { inicio, fin };
}

export async function calcularResumen(periodo: Periodo, referencia: Date): Promise<Resumen> {
  const gastos = await leerGastos();
  const { inicio, fin } = inicioYFinDePeriodo(periodo, referencia);
  const delPeriodo = gastos.filter((g) => g.fecha >= inicio && g.fecha < fin);

  const porCategoriaMap = new Map<string, number>();
  for (const g of delPeriodo) {
    porCategoriaMap.set(g.categoria, (porCategoriaMap.get(g.categoria) ?? 0) + g.monto);
  }
  const porCategoria = [...porCategoriaMap.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);

  return {
    periodo,
    inicio,
    fin,
    total: delPeriodo.reduce((acc, g) => acc + g.monto, 0),
    cantidadGastos: delPeriodo.length,
    porCategoria,
  };
}

export function tituloPeriodo(r: Resumen): string {
  if (r.periodo === "dia") return formatearFechaCorta(r.inicio);
  if (r.periodo === "semana") {
    const ultimoDia = new Date(r.fin.getTime() - 86400000);
    return `Semana del ${formatearFechaCorta(r.inicio)} al ${formatearFechaCorta(ultimoDia)}`;
  }
  if (r.periodo === "mes") return `${nombreMes(r.inicio.getUTCMonth() + 1)} ${r.inicio.getUTCFullYear()}`;
  return `Año ${r.inicio.getUTCFullYear()}`;
}

function formatearPesos(monto: number): string {
  return `$${monto.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function textoResumen(r: Resumen): string {
  const titulo = tituloPeriodo(r);
  if (r.cantidadGastos === 0) {
    return `No encontré gastos cargados en ${titulo}.`;
  }
  const lineas = r.porCategoria.map((c) => `• ${c.categoria}: ${formatearPesos(c.total)}`);
  return [
    `📊 Resumen de ${titulo}`,
    `Total: ${formatearPesos(r.total)} (${r.cantidadGastos} gastos)`,
    "",
    ...lineas,
  ].join("\n");
}

// Genera la URL de un grafico de torta con QuickChart (servicio gratuito
// que renderiza un grafico de Chart.js a partir de la config en la URL).
export function urlGraficoTorta(r: Resumen): string | null {
  if (r.porCategoria.length === 0) return null;
  const config = {
    type: "pie",
    data: {
      labels: r.porCategoria.map((c) => c.categoria),
      datasets: [{ data: r.porCategoria.map((c) => c.total) }],
    },
    options: {
      plugins: {
        title: { display: true, text: `Gastos de ${tituloPeriodo(r)}` },
      },
    },
  };
  const params = new URLSearchParams({
    c: JSON.stringify(config),
    backgroundColor: "white",
    width: "500",
    height: "300",
  });
  return `https://quickchart.io/chart?${params.toString()}`;
}
