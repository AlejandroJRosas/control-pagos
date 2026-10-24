import type { BorradorDeposito } from "@/db/repos/cola";
import { parseMonto } from "@/domain/money";
import { validateDestino } from "@/domain/validation";
import type { CamposDeposito } from "@/extraction/tipos";

/** Lo que un borrador no sabe por sí solo: depende de lo registrado y del resto de la cola. */
export type ContextoIncidencia = { duplicado: boolean; posibleRepetido: boolean; faltaTasa: boolean };

const CAMPOS: CamposDeposito[] = ["fecha", "banco", "referencia", "cuentaDestino", "montoBs"];
const CONFIANZA_MINIMA = 0.9;

/** Por qué un pendiente de la cola merece una mirada antes de darle "Hecho" (vacío = nada que revisar). */
export function motivosBorrador(formato: string | null, b: BorradorDeposito, ctx: ContextoIncidencia): string[] {
  const { draft } = b;
  const motivos: string[] = [];
  if (formato === null) motivos.push("No se reconoció el comprobante");
  if (!draft.fecha) motivos.push("Falta la fecha");
  if (!draft.banco.trim()) motivos.push("Falta el banco");
  if (!draft.referencia.trim()) motivos.push("Falta la referencia");
  if (!parseMonto(draft.montoBs)) motivos.push("Falta el monto");
  const destino = validateDestino(b.destino);
  if (!destino.ok && destino.errors.sel) motivos.push("Falta el gerente");
  for (const c of CAMPOS) {
    if (b.auto.estado[c] === "ocr" && (b.auto.confianza[c] ?? 1) < CONFIANZA_MINIMA) motivos.push(`Revisar: ${c}`);
  }
  if (ctx.duplicado) motivos.push("Duplicado");
  if (ctx.posibleRepetido) motivos.push("Posible repetido");
  if (ctx.faltaTasa) motivos.push("Falta la tasa");
  return motivos;
}
