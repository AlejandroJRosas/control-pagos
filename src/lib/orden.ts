import Decimal from "decimal.js";

/** texto: sin mayúsculas ni acentos · decimal: montos como texto exacto · numero: number. Las fechas ISO se ordenan como texto. */
export type TipoOrden = "texto" | "decimal" | "numero";
export type Columna<T> = { tipo: TipoOrden; valor: (fila: T) => string | number | null };
export type Columnas<T, K extends string> = Record<K, Columna<T>>;
export type Orden<K extends string = string> = { key: K; dir: 1 | -1 } | null;

const colator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

function comparar(a: string | number, b: string | number, tipo: TipoOrden): number {
  if (tipo === "decimal") return new Decimal(a).cmp(b);
  if (tipo === "numero") return Number(a) - Number(b);
  return colator.compare(String(a), String(b));
}

/** Orden estable; los valores vacíos quedan al final en ambos sentidos. */
export function ordenar<T, K extends string>(filas: T[], columnas: Columnas<T, K>, orden: Orden<K>): T[] {
  if (!orden) return filas;
  const { tipo, valor } = columnas[orden.key];
  return [...filas].sort((x, y) => {
    const a = valor(x);
    const b = valor(y);
    const vacioA = a == null || a === "";
    const vacioB = b == null || b === "";
    if (vacioA || vacioB) return vacioA === vacioB ? 0 : vacioA ? 1 : -1;
    return comparar(a, b, tipo) * orden.dir;
  });
}

/** Clic en un encabezado: ascendente → descendente → orden original. */
export function siguienteOrden<K extends string>(actual: Orden<K>, key: K): Orden<K> {
  if (actual?.key !== key) return { key, dir: 1 };
  return actual.dir === 1 ? { key, dir: -1 } : null;
}
