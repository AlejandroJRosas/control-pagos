/**
 * Historial de cambios. Las notas de cada versión son el mensaje de su etiqueta anotada `vX.Y.Z` ("Novedades:" y
 * una línea "- …" por cambio); se leen de git al compilar (`vite.config.ts`, módulo `virtual:novedades`) y viajan
 * dentro de la app. Este archivo no importa nada del proyecto: lo usa también la configuración de Vite.
 */
export type Novedad = { version: string; /** YYYY-MM-DD */ fecha: string; notas: string[] };

/** Separadores del `--format` de `git for-each-ref` (%00 y %1e). */
export const SEP_CAMPO = "\0";
export const SEP_ETIQUETA = "\x1e";

/** Sin la "v" ni el sufijo ("0.0.0-test" = 0.0.0). */
const numeros = (v: string) => v.replace(/^v/, "").split("-")[0].split(".").map(Number);

export function compararVersiones(a: string, b: string): number {
  const [x, y] = [numeros(a), numeros(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Un punto por línea "- …"; las líneas siguientes sin guion se unen al punto anterior. */
export function parseNotas(texto: string): string[] {
  const notas: string[] = [];
  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea || /^novedades:?$/i.test(linea)) continue;
    if (linea.startsWith("- ")) notas.push(linea.slice(2).trim());
    else if (notas.length > 0 && !cruda.startsWith("-")) notas[notas.length - 1] += ` ${linea}`;
    else notas.push(linea);
  }
  return notas;
}

/** Salida de `git for-each-ref refs/tags --format=%(refname:short)%00%(creatordate:short)%00%(contents)%1e`. */
export function leerEtiquetas(salida: string): Novedad[] {
  return salida
    .split(SEP_ETIQUETA)
    .map((bloque) => bloque.replace(/^\s+/, "").split(SEP_CAMPO))
    .filter(([nombre]) => /^v\d+\.\d+\.\d+$/.test(nombre ?? ""))
    .map(([nombre, fecha, texto]) => ({ version: nombre.slice(1), fecha: fecha ?? "", notas: parseNotas(texto ?? "") }))
    .sort((a, b) => compararVersiones(b.version, a.version));
}

/**
 * Lo que hay que mostrar al abrir la versión `actual`: las posteriores a `vista` (la última de la que se vieron las
 * novedades) hasta la actual, la más nueva primero. Sin `vista` registrada, solo la actual.
 */
export function novedadesPendientes(lista: readonly Novedad[], vista: string | null, actual: string): Novedad[] {
  if (!lista.some((n) => n.version === actual)) return [];
  if (vista === null) return lista.filter((n) => n.version === actual);
  return lista.filter((n) => compararVersiones(n.version, vista) > 0 && compararVersiones(n.version, actual) <= 0);
}
