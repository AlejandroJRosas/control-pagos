import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/**
 * Interpreta un monto escrito por el usuario en formato venezolano.
 * - Con coma: la coma es decimal y los puntos son separadores de miles ("1.234,56").
 * - Sin coma: un único punto seguido de exactamente 3 dígitos es separador de miles ("1.234");
 *   cualquier otro punto único es decimal ("36.5"); varios puntos son miles ("1.234.567").
 * Devuelve el decimal canónico ("1234.56") o null si no es válido o es negativo.
 */
export function parseMonto(input: string): string | null {
  const s = input
    .replace(/\s/g, "")
    .replace(/^(Bs\.?|\$)/i, "")
    .replace(/(Bs\.?|\$)$/i, "");
  if (s === "") return null;
  // Un grupo de miles que empieza en 0 ("0.500") no es un monto: casi siempre es un decimal mal escrito.
  if (/^0+\.\d{3}(\.\d{3})*(,|$)/.test(s)) return null;

  let normalized: string;
  if (s.includes(",")) {
    if (s.indexOf(",") !== s.lastIndexOf(",")) return null;
    const [ent, dec] = s.split(",");
    if (!/^(\d{1,3}(\.\d{3})*|\d+)$/.test(ent) || !/^\d+$/.test(dec)) return null;
    normalized = `${ent.replace(/\./g, "")}.${dec}`;
  } else {
    const dots = (s.match(/\./g) ?? []).length;
    if (dots === 0) {
      if (!/^\d+$/.test(s)) return null;
      normalized = s;
    } else if (dots === 1 && !/^\d+\.\d{3}$/.test(s)) {
      if (!/^\d+\.\d+$/.test(s)) return null;
      normalized = s;
    } else {
      if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
      normalized = s.replace(/\./g, "");
    }
  }
  return new Decimal(normalized).toFixed();
}

/**
 * Como parseMonto, pero para tasas: un único punto sin coma siempre es decimal ("36.500" = 36,5).
 * Una tasa nunca se escribe con miles separados solo por un punto, y leerla como 36500 daría USD 1000 veces menores.
 */
export function parseTasa(input: string): string | null {
  const s = input.replace(/\s/g, "");
  if (!s.includes(",") && /^\d+\.\d+$/.test(s)) return new Decimal(s).toFixed();
  return parseMonto(input);
}

export function formatNumberVE(value: Decimal.Value, decimals = 2): string {
  const d = new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  const negative = d.isNegative() && !d.isZero();
  const [ent, dec] = d.abs().toFixed(decimals).split(".");
  const entFmt = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${entFmt}${dec ? `,${dec}` : ""}`;
}

export const formatBs = (v: Decimal.Value): string => `${formatNumberVE(v)} Bs`;

export function formatUsd(v: Decimal.Value): string {
  const s = formatNumberVE(v);
  return s.startsWith("-") ? `-$ ${s.slice(1)}` : `$ ${s}`;
}

export function formatTasa(v: Decimal.Value): string {
  const d = new Decimal(v);
  return formatNumberVE(d, Math.min(Math.max(d.decimalPlaces(), 2), 4));
}

export const formatPct = (pct: number): string => `${formatNumberVE(pct, 1)} %`;

/**
 * Formato del campo de monto mientras se escribe: los puntos de miles se ponen solos y el separador decimal es la
 * coma. `decimalEn` es la posición de un punto que acaba de escribir el usuario: ese punto es el decimal (los demás
 * puntos son los de miles que puso la máscara). `caret` se ajusta para quedar detrás del mismo dígito.
 */
export function mascaraMonto(texto: string, caret: number, decimalEn: number | null = null): { texto: string; caret: number } {
  if (/[^\d.,]/.test(texto)) {
    // Solo se aceptan dígitos, puntos y comas: lo demás se descarta y el cursor y el punto decimal se corren.
    const antes = (i: number) => texto.slice(0, i).replace(/[\d.,]/g, "").length;
    const limpio = texto.replace(/[^\d.,]/g, "");
    const dec = decimalEn != null && /[.,]/.test(texto[decimalEn] ?? "") ? decimalEn - antes(decimalEn) : null;
    return mascaraMonto(limpio, caret - antes(caret), dec);
  }
  const decimal = decimalEn ?? texto.lastIndexOf(",");
  const digitos = (s: string) => s.replace(/\D/g, "");
  const ent = digitos(decimal < 0 ? texto : texto.slice(0, decimal)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const out = decimal < 0 ? ent : `${ent},${digitos(texto.slice(decimal + 1))}`;
  // Dígitos (y el separador decimal) que había antes del cursor: el cursor va detrás de los mismos en `out`.
  const n = digitos(texto.slice(0, caret)).length + (decimal >= 0 && decimal < caret ? 1 : 0);
  let pos = 0;
  for (let vistos = 0; pos < out.length && vistos < n; pos++) if (out[pos] !== ".") vistos++;
  return { texto: out, caret: pos };
}

export function toInputVE(canonical: string): string {
  const d = new Decimal(canonical);
  return formatNumberVE(d, Math.max(d.decimalPlaces(), 2));
}

export function toUsd(montoBs: string, tasa: string): string {
  return new Decimal(montoBs).div(tasa).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
