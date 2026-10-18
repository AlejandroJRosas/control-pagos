import { claveComparacion } from "@/domain/texto";
import type { Caja, OcrLinea, OcrResultado } from "./ocr/types";

/** Líneas del OCR que están a la misma altura en la imagen (p. ej. etiqueta a la izquierda, valor a la derecha). */
export type Fila = { texto: string; lineas: OcrLinea[]; caja: Caja };

function union(a: Caja, b: Caja): Caja {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

const centroY = (c: Caja) => c.y + c.h / 2;

/** Agrupa en filas las líneas que se solapan verticalmente al menos la mitad de la altura menor. */
export function agruparFilas(r: OcrResultado): Fila[] {
  const lineas = [...r.lineas].sort((a, b) => centroY(a.caja) - centroY(b.caja));
  const grupos: { caja: Caja; lineas: OcrLinea[] }[] = [];
  for (const l of lineas) {
    const g = grupos.at(-1);
    if (g) {
      const solape = Math.min(g.caja.y + g.caja.h, l.caja.y + l.caja.h) - Math.max(g.caja.y, l.caja.y);
      if (solape >= Math.min(g.caja.h, l.caja.h) / 2) {
        g.lineas.push(l);
        g.caja = union(g.caja, l.caja);
        continue;
      }
    }
    grupos.push({ caja: l.caja, lineas: [l] });
  }
  return grupos.map((g) => {
    const orden = g.lineas.sort((a, b) => a.caja.x - b.caja.x);
    return { texto: orden.map((l) => l.texto).join(" "), lineas: orden, caja: g.caja };
  });
}

export function contiene(filas: Fila[], texto: string): boolean {
  const clave = claveComparacion(texto);
  return filas.some((f) => claveComparacion(f.texto).includes(clave));
}

/** Texto que sigue a la etiqueta (con o sin ":") en la primera fila que empieza por ella. */
export function valorDeEtiqueta(filas: Fila[], etiqueta: string): string | null {
  const clave = claveComparacion(etiqueta);
  const n = etiqueta.trim().split(/\s+/).length;
  for (const f of filas) {
    const palabras = f.texto.replace(/:(?=\S)/, ": ").trim().split(/\s+/);
    if (palabras.length <= n) continue;
    if (claveComparacion(palabras.slice(0, n).join("").replace(/:+$/, "")) !== clave) continue;
    const valor = palabras.slice(n).join(" ").replace(/^:\s*/, "").trim();
    if (valor) return valor;
  }
  return null;
}
