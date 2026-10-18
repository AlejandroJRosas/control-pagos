import type { CampoPropuesto } from "./tipos";

/** Estado de cada campo frente al OCR; ausente = sin tocar (el valor por defecto también cuenta como sin tocar). */
export type EstadoCampo = "ocr" | "tocado";
export type Autollenado<F extends string> = {
  estado: Partial<Record<F, EstadoCampo>>;
  confianza: Partial<Record<F, number>>;
};

export const autollenadoNuevo = <F extends string>(): Autollenado<F> => ({ estado: {}, confianza: {} });

/** Al editar un registro guardado, lo que ya tiene valor cuenta como escrito por la usuaria. */
export function autollenadoExistente<F extends string>(valores: Record<F, string>): Autollenado<F> {
  const estado: Partial<Record<F, EstadoCampo>> = {};
  for (const k of Object.keys(valores) as F[]) if (valores[k].trim()) estado[k] = "tocado";
  return { estado, confianza: {} };
}

export function marcarTocado<F extends string>(a: Autollenado<F>, campo: F): Autollenado<F> {
  const confianza = { ...a.confianza };
  delete confianza[campo];
  return { estado: { ...a.estado, [campo]: "tocado" }, confianza };
}

/**
 * Deshace lo que puso una imagen anterior y aplica lo leído de la nueva, sin pisar campos tocados.
 * Con `propuestos = {}` solo limpia (se quitó la imagen).
 */
export function aplicarExtraccion<F extends string>(
  valores: Record<F, string>,
  a: Autollenado<F>,
  propuestos: Partial<Record<F, CampoPropuesto>>,
  defaults: Record<F, string>,
): { valores: Record<F, string>; auto: Autollenado<F> } {
  const v = { ...valores };
  const estado = { ...a.estado };
  const confianza = { ...a.confianza };
  for (const k of Object.keys(estado) as F[]) {
    if (estado[k] !== "ocr") continue;
    v[k] = defaults[k];
    delete estado[k];
    delete confianza[k];
  }
  for (const k of Object.keys(propuestos) as F[]) {
    const p = propuestos[k];
    if (!p || estado[k] === "tocado") continue;
    v[k] = p.value;
    estado[k] = "ocr";
    confianza[k] = p.confidence;
  }
  return { valores: v, auto: { estado, confianza } };
}

const CONFIANZA_TASA_OTRA_FECHA = 0.6;

/** Si la fecha del formulario no la cambia el OCR y la imagen es de otro día, su valor queda para revisar. */
export function tasaParaFecha(
  propuestos: Partial<Record<"fecha" | "valor", CampoPropuesto>>,
  fechaFormulario: string,
  fechaFija: boolean,
): Partial<Record<"fecha" | "valor", CampoPropuesto>> {
  const { fecha, valor } = propuestos;
  if (!fechaFija || !fecha || !valor || fecha.value === fechaFormulario) return propuestos;
  return { ...propuestos, valor: { ...valor, confidence: Math.min(valor.confidence, CONFIANZA_TASA_OTRA_FECHA) } };
}
