const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

export function hoyEnArgentina(referencia: Date = new Date()): { anio: number; mes: number; dia: number } {
  const formateador = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [anio, mes, dia] = formateador.format(referencia).split("-").map(Number);
  return { anio, mes, dia };
}

export function hoyISOEnArgentina(referencia: Date = new Date()): string {
  const { anio, mes, dia } = hoyEnArgentina(referencia);
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
