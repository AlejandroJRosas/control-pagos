import Decimal from "decimal.js";
import { DomainError } from "./errors";
import { esFinDeSemana, isValidIsoDate } from "./dates";

/**
 * Archivo de tasas (`.ctasas`): zip con `paquete.json` (este formato) e `imagenes/<captura>`. Lleva todas las tasas con
 * sus capturas para pasarlas a otra instalación o recuperarlas.
 */
export const FORMATO_TASAS = "control-pagos/tasas";
export const EXTENSION_TASAS = "ctasas";

export type TasaArchivo = { fecha: string; valor: string; notas: string | null; imagen: string | null }; // imagen: nombre dentro de imagenes/
export type ArchivoTasas = { formato: typeof FORMATO_TASAS; version: 1; creadoEn: string; tasas: TasaArchivo[] };

type TasaLocal = { fecha: string; valor: string; notas: string | null; imagenPath: string | null };

/** Arma el archivo y la lista de capturas a incluir ("imagenes/x.jpg", como las guarda la BD). */
export function armarArchivoTasas(tasas: TasaLocal[], creadoEn: string): { archivo: ArchivoTasas; imagenes: string[] } {
  const ordenadas = [...tasas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return {
    archivo: {
      formato: FORMATO_TASAS,
      version: 1,
      creadoEn,
      tasas: ordenadas.map((t) => ({ fecha: t.fecha, valor: t.valor, notas: t.notas, imagen: t.imagenPath ? t.imagenPath.replace(/^imagenes\//, "") : null })),
    },
    imagenes: ordenadas.flatMap((t) => (t.imagenPath ? [t.imagenPath] : [])),
  };
}

const INVALIDO = "El archivo no es un archivo de tasas de Control de Pagos válido";
const invalido = (): never => {
  throw new DomainError("VALIDACION", INVALIDO);
};
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fecha = (v: unknown): string => (typeof v === "string" && isValidIsoDate(v) ? v : invalido());
const valor = (v: unknown): string => (typeof v === "string" && /^\d+(\.\d+)?$/.test(v) && new Decimal(v).gt(0) ? v : invalido());
const textoONulo = (v: unknown): string | null => (v === null || v === undefined ? null : typeof v === "string" ? v : invalido());
const imagen = (v: unknown): string | null =>
  v === null || v === undefined ? null : typeof v === "string" && /^[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/i.test(v) ? v : invalido();

export function leerArchivoTasas(texto: string): ArchivoTasas {
  let raw: unknown;
  try {
    raw = JSON.parse(texto);
  } catch {
    return invalido();
  }
  if (!esObj(raw) || raw.formato !== FORMATO_TASAS) return invalido();
  if (typeof raw.version === "number" && raw.version > 1)
    throw new DomainError("VALIDACION", "El archivo de tasas viene de una versión más nueva de la app: actualiza para abrirlo");
  if (raw.version !== 1 || !Array.isArray(raw.tasas)) return invalido();
  return {
    formato: FORMATO_TASAS,
    version: 1,
    creadoEn: typeof raw.creadoEn === "string" ? raw.creadoEn : "",
    tasas: raw.tasas.map((t) => (esObj(t) ? { fecha: fecha(t.fecha), valor: valor(t.valor), notas: textoONulo(t.notas), imagen: imagen(t.imagen) } : invalido())),
  };
}

export type TasaExistenteImportar = { id: number; valor: string; notas: string | null; imagenPath: string | null; usos: number };

/**
 * Cómo entra cada tasa del archivo: `nueva` (la fecha no tiene tasa), `igual` (mismo valor; no cambia nada),
 * `captura` (mismo valor, la local no tiene captura y el archivo sí: se le agrega), `distinta` (otro valor: se reemplaza
 * solo si se elige) o `invalida` (con su motivo; no entra).
 */
export type FilaImportarTasa = TasaArchivo &
  (
    | { tipo: "nueva" }
    | { tipo: "igual" | "captura" | "distinta"; actual: TasaExistenteImportar }
    | { tipo: "invalida"; motivo: string }
  );

export function planImportarTasas(
  archivo: ArchivoTasas,
  existentes: ReadonlyMap<string, TasaExistenteImportar>,
  feriados: ReadonlySet<string>,
): FilaImportarTasa[] {
  const vistas = new Set<string>();
  return archivo.tasas.map((t): FilaImportarTasa => {
    if (vistas.has(t.fecha)) return { ...t, tipo: "invalida", motivo: "Fecha repetida en el archivo" };
    vistas.add(t.fecha);
    const actual = existentes.get(t.fecha);
    if (!actual) {
      if (esFinDeSemana(t.fecha)) return { ...t, tipo: "invalida", motivo: "Sábado o domingo: no lleva tasa propia" };
      if (feriados.has(t.fecha)) return { ...t, tipo: "invalida", motivo: "Es feriado aquí: no lleva tasa propia" };
      return { ...t, tipo: "nueva" };
    }
    if (!new Decimal(actual.valor).eq(t.valor)) return { ...t, tipo: "distinta", actual };
    return { ...t, tipo: !actual.imagenPath && t.imagen ? "captura" : "igual", actual };
  });
}

/** Lo que se escribe: nuevas, capturas agregadas y las distintas que se eligió reemplazar (`reemplazar`, por fecha). */
export type CambioImportarTasa =
  | { tipo: "nueva"; fecha: string; valor: string; notas: string | null; imagen: string | null }
  | { tipo: "actualizar"; id: number; fecha: string; valor: string; notas: string | null; imagen: string | null; imagenPath: string | null };

export function cambiosImportarTasas(plan: FilaImportarTasa[], reemplazar: ReadonlySet<string>): CambioImportarTasa[] {
  return plan.flatMap((f): CambioImportarTasa[] => {
    if (f.tipo === "nueva") return [{ tipo: "nueva", fecha: f.fecha, valor: f.valor, notas: f.notas, imagen: f.imagen }];
    if (f.tipo === "captura")
      return [{ tipo: "actualizar", id: f.actual.id, fecha: f.fecha, valor: f.actual.valor, notas: f.actual.notas ?? f.notas, imagen: f.imagen, imagenPath: null }];
    if (f.tipo === "distinta" && reemplazar.has(f.fecha))
      // Sin captura o notas en el archivo, la tasa conserva las suyas.
      return [{ tipo: "actualizar", id: f.actual.id, fecha: f.fecha, valor: f.valor, notas: f.notas ?? f.actual.notas, imagen: f.imagen, imagenPath: f.actual.imagenPath }];
    return [];
  });
}
