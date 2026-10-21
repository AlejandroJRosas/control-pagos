import { diaSemana, esFinDeSemana, fechaDeTasa, sumarDias } from "./dates";

/** tasa: con tasa propia · finde: sábado o domingo (usa la del lunes) · falta: día hábil sin tasa · futuro: aún no llega. */
export type EstadoDia = "tasa" | "finde" | "feriado" | "falta" | "futuro";

export type DiaCalendario<T> = { fecha: string; dia: number; delMes: boolean; estado: EstadoDia; tasa: T | null };

/** `mes` en formato YYYY-MM. */
export function mesSiguiente(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export type DiaDelMes = { fecha: string; dia: number; delMes: boolean };

/** Semanas (de lunes a domingo) que cubren el mes `YYYY-MM`, con los días vecinos para completarlas. */
export function semanasDelMes(mes: string): DiaDelMes[][] {
  const primero = `${mes}-01`;
  const ultimo = sumarDias(`${mesSiguiente(mes, 1)}-01`, -1);
  let fecha = sumarDias(primero, -((diaSemana(primero) + 6) % 7));
  const semanas: DiaDelMes[][] = [];
  while (fecha <= ultimo) {
    const semana: DiaDelMes[] = [];
    for (let i = 0; i < 7; i++) {
      semana.push({ fecha, dia: Number(fecha.slice(8)), delMes: fecha.startsWith(mes) });
      fecha = sumarDias(fecha, 1);
    }
    semanas.push(semana);
  }
  return semanas;
}

/** Calendario del mes (semanas de lunes a domingo) con el estado de la tasa de cada día. */
export function calendarioTasas<T extends { fecha: string }>(
  mes: string,
  tasas: T[],
  hoy: string,
  feriados: ReadonlySet<string> = new Set(),
): { semanas: DiaCalendario<T>[][]; faltan: number } {
  const porFecha = new Map(tasas.map((t) => [t.fecha, t]));
  let faltan = 0;
  const semanas = semanasDelMes(mes).map((semana) =>
    semana.map(({ fecha, dia, delMes }): DiaCalendario<T> => {
      const propia = porFecha.get(fecha) ?? null;
      let estado: EstadoDia;
      let tasa = propia;
      if (propia) estado = "tasa";
      else if (fecha > hoy) estado = "futuro";
      else if (esFinDeSemana(fecha) || feriados.has(fecha)) {
        estado = esFinDeSemana(fecha) ? "finde" : "feriado";
        tasa = porFecha.get(fechaDeTasa(fecha, feriados)) ?? null;
      } else estado = "falta";
      if (delMes && estado === "falta") faltan++;
      return { fecha, dia, delMes, estado, tasa };
    }),
  );
  return { semanas, faltan };
}
