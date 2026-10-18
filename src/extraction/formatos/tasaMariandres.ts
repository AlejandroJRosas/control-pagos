import { contiene, type Fila } from "../filas";
import { fechaDesdeDmy } from "../normalizar";
import type { CampoCrudo, CamposTasa, Reconocedor } from "../tipos";

/**
 * Imagen "TASA DEL DÍA" de INV Mariandres: fecha "16 / 10 / 2026" y valor "bs. 880,12".
 * El OCR suele leer mal o perder el "bs.", así que el valor es el número con coma decimal de una fila sin barras.
 */

const VALOR = /(?<![\d.])((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2,4})\s*$/;

const filaValor = (filas: Fila[]) => filas.find((f) => !f.texto.includes("/") && VALOR.test(f.texto));

export const tasaMariandres: Reconocedor<CamposTasa> = {
  id: "tasa-mariandres",
  detecta(filas) {
    return contiene(filas, "Tasa del día") && filaValor(filas) !== undefined;
  },
  extrae(filas) {
    const r: Partial<Record<CamposTasa, CampoCrudo>> = {};
    const v = filaValor(filas);
    const m = v ? VALOR.exec(v.texto) : null;
    if (m) r.valor = { texto: m[1], certeza: "etiqueta" };
    const f = filas.find((x) => fechaDesdeDmy(x.texto));
    if (f) r.fecha = { texto: f.texto, certeza: "etiqueta" };
    return r;
  },
};
