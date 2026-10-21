import { isValidIsoDate } from "./dates";

export type ConNacimiento = { id: number; nombre: string; nacimiento: string | null };
export type CumpleProximo = { id: number; nombre: string; fecha: string; dias: number; edad: number };
export type CumpleDelDia = { id: number; nombre: string; edad: number };

/** Clave en `ajustes` de los días de antelación del aviso. */
export const AJUSTE_ANTELACION_CUMPLE = "cumple_antelacion";
export const ANTELACION_CUMPLE_DEFECTO = 3;
export const ANTELACION_CUMPLE_MAX = 30;

export function antelacionDeAjuste(valor: string | null): number {
  const n = valor === null || !/^-?\d+$/.test(valor.trim()) ? ANTELACION_CUMPLE_DEFECTO : Number(valor);
  return Math.min(ANTELACION_CUMPLE_MAX, Math.max(0, n));
}

/** Fecha del cumpleaños en `anio`; quien nació un 29 de febrero lo celebra el 28 en años no bisiestos. */
export function cumpleEnAnio(nacimiento: string, anio: number): string {
  const mmdd = nacimiento.slice(5);
  const fecha = `${anio}-${mmdd}`;
  return isValidIsoDate(fecha) ? fecha : `${anio}-02-28`;
}

const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);

/** Próximo cumpleaños desde `hoy` (incluido): fecha, días que faltan y edad que cumple. */
export function proximoCumple(nacimiento: string, hoy: string): { fecha: string; dias: number; edad: number } {
  let anio = Number(hoy.slice(0, 4));
  let fecha = cumpleEnAnio(nacimiento, anio);
  if (fecha < hoy) fecha = cumpleEnAnio(nacimiento, ++anio);
  return { fecha, dias: diasEntre(hoy, fecha), edad: anio - Number(nacimiento.slice(0, 4)) };
}

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
const valida = (g: ConNacimiento, hoy: string): g is ConNacimiento & { nacimiento: string } =>
  g.nacimiento !== null && isValidIsoDate(g.nacimiento) && g.nacimiento <= hoy;

/** Cumpleaños de hoy a `antelacion` días, el más cercano primero (y por nombre). */
export function cumpleanosProximos(gerentes: ConNacimiento[], hoy: string, antelacion: number): CumpleProximo[] {
  return gerentes
    .filter((g) => valida(g, hoy))
    .map((g) => ({ id: g.id, nombre: g.nombre, ...proximoCumple(g.nacimiento, hoy) }))
    .filter((c) => c.dias <= antelacion)
    .sort((a, b) => a.dias - b.dias || porNombre(a, b));
}

/** Cumpleaños de cada día del mes (`YYYY-MM`) con la edad que se cumple ese año. */
export function cumpleanosDelMes(mes: string, gerentes: ConNacimiento[]): Map<string, CumpleDelDia[]> {
  const anio = Number(mes.slice(0, 4));
  const r = new Map<string, CumpleDelDia[]>();
  for (const g of [...gerentes].sort(porNombre)) {
    if (g.nacimiento === null || !isValidIsoDate(g.nacimiento)) continue;
    const fecha = cumpleEnAnio(g.nacimiento, anio);
    const edad = anio - Number(g.nacimiento.slice(0, 4));
    if (!fecha.startsWith(mes) || edad <= 0) continue;
    r.set(fecha, [...(r.get(fecha) ?? []), { id: g.id, nombre: g.nombre, edad }]);
  }
  return r;
}

export const textoFaltan = (dias: number): string => (dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`);
