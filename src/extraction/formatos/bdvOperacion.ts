import { claveComparacion } from "@/domain/texto";
import { valorDeEtiqueta, type Fila } from "../filas";
import type { CampoCrudo, CamposDeposito, Reconocedor } from "../tipos";
import { crudo, digitos, montoBs } from "./comun";

/**
 * Banco de Venezuela (BDVenlínea personas), "Tu transferencia de fondos ha sido realizada con éxito. El número de
 * operación es …": la operación va dentro de la frase y abajo filas etiqueta/valor (Instrumento Origen, Instrumento
 * Destino, Monto Operación, Concepto). No trae fecha. En pantallas angostas cada etiqueta se parte en dos filas
 * ("Instrumento 0102…" / "Destino:") y la app corta la cuenta destino: si no mide 20 dígitos queda para revisar.
 */

const OPERACION = /operaci[oó]n\s+es\s*(\d{6,})/i;
const MONTO = /\d{1,3}(?:\.\d{3})*[.,]\d{2}/;
const LARGO_CUENTA = 20;

function referencia(filas: Fila[]): CampoCrudo | undefined {
  const m = OPERACION.exec(filas.map((f) => f.texto).join(" "));
  return m ? crudo(m[1], "etiqueta") : undefined;
}

function monto(filas: Fila[]): CampoCrudo | undefined {
  const f = filas.find((f) => /^Monto\b/i.test(f.texto.trim()));
  const m = f ? MONTO.exec(f.texto) : null;
  return m ? montoBs(m[0], "etiqueta") : undefined;
}

/** "Instrumento Destino: 0102…" en una fila o, partida, "Instrumento 0102…" con "Destino:" en la fila de abajo. */
function cuentaDestino(filas: Fila[]): CampoCrudo | undefined {
  let cuenta = digitos(valorDeEtiqueta(filas, "Instrumento Destino"));
  if (!cuenta) {
    const i = filas.findIndex((f) => /^Destino\s*:?$/i.test(f.texto.trim()));
    if (i > 0 && /^Instrumento\b/i.test(filas[i - 1].texto.trim())) cuenta = digitos(filas[i - 1].texto);
  }
  return cuenta ? crudo(cuenta, cuenta.length === LARGO_CUENTA ? "etiqueta" : "heuristica") : undefined;
}

export const bdvOperacion: Reconocedor<CamposDeposito> = {
  id: "bdv-operacion",
  detecta(filas) {
    const todo = claveComparacion(filas.map((f) => f.texto).join(" "));
    // La captura puede venir recortada sin el título ni el pie: entonces basta la frase de la transferencia.
    const marca = ["BDVenlínea", "Banco de Venezuela", "Tu transferencia de fondos"].some((t) => todo.includes(claveComparacion(t)));
    if (!marca) return false;
    return OPERACION.test(filas.map((f) => f.texto).join(" ")) && todo.includes("instrumento");
  },
  extrae(filas) {
    const r: Partial<Record<CamposDeposito, CampoCrudo>> = { banco: crudo("Venezuela", "constante") };
    const campos = { montoBs: monto(filas), referencia: referencia(filas), cuentaDestino: cuentaDestino(filas) };
    for (const [k, v] of Object.entries(campos) as [CamposDeposito, CampoCrudo | undefined][]) if (v) r[k] = v;
    return r;
  },
};
