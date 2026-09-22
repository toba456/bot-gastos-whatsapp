import { leerGastos } from "@/lib/sheets";

export type ResumenMensual = {
  mes: number; // 1-12
  anio: number;
  total: number;
  cantidadGastos: number;
  porCategoria: Array<{ categoria: string; total: number }>;
};

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function nombreMes(mes: number): string {
  return NOMBRES_MES[mes - 1] ?? `Mes ${mes}`;
}

export async function calcularResumenMensual(mes: number, anio: number): Promise<ResumenMensual> {
  const gastos = await leerGastos();
  const delMes = gastos.filter(
    (g) => g.fecha.getUTCMonth() + 1 === mes && g.fecha.getUTCFullYear() === anio
  );

  const porCategoriaMap = new Map<string, number>();
  for (const g of delMes) {
    porCategoriaMap.set(g.categoria, (porCategoriaMap.get(g.categoria) ?? 0) + g.monto);
  }
  const porCategoria = [...porCategoriaMap.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);

  return {
    mes,
    anio,
    total: delMes.reduce((acc, g) => acc + g.monto, 0),
    cantidadGastos: delMes.length,
    porCategoria,
  };
}

function formatearPesos(monto: number): string {
  return `$${monto.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function textoResumen(r: ResumenMensual): string {
  if (r.cantidadGastos === 0) {
    return `No encontré gastos cargados en ${nombreMes(r.mes)} ${r.anio}.`;
  }
  const lineas = r.porCategoria.map((c) => `• ${c.categoria}: ${formatearPesos(c.total)}`);
  return [
    `📊 Resumen de ${nombreMes(r.mes)} ${r.anio}`,
    `Total: ${formatearPesos(r.total)} (${r.cantidadGastos} gastos)`,
    "",
    ...lineas,
  ].join("\n");
}

// Genera la URL de un grafico de torta con QuickChart (servicio gratuito
// que renderiza un grafico de Chart.js a partir de la config en la URL).
export function urlGraficoTorta(r: ResumenMensual): string | null {
  if (r.porCategoria.length === 0) return null;
  const config = {
    type: "pie",
    data: {
      labels: r.porCategoria.map((c) => c.categoria),
      datasets: [{ data: r.porCategoria.map((c) => c.total) }],
    },
    options: {
      plugins: {
        title: { display: true, text: `Gastos de ${nombreMes(r.mes)} ${r.anio}` },
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
