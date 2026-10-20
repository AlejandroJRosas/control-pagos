import { claveComparacion, claveReferencia } from "./texto";

export const BANCOS_SUGERIDOS = [
  "100% Banco",
  "Activo",
  "Bancamiga",
  "Bancaribe",
  "Banco del Tesoro",
  "Bancrecer",
  "Banesco",
  "Banfanb",
  "Banplus",
  "Bicentenario",
  "BNC",
  "Del Sur",
  "Exterior",
  "Mercantil",
  "Mi Banco",
  "Provincial",
  "R4",
  "Sofitasa",
  "Venezolano de Crédito",
  "Venezuela",
];

export function sugerenciasBancos(usados: string[]): string[] {
  const porClave = new Map<string, string>();
  for (const b of [...BANCOS_SUGERIDOS, ...usados]) {
    const clave = b.trim().toLowerCase();
    if (clave && !porClave.has(clave)) porClave.set(clave, b.trim());
  }
  return [...porClave.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/** Otros nombres con que se escribe un banco → su nombre en `BANCOS_SUGERIDOS`. */
const ALIAS: Record<string, string> = {
  BDV: "Venezuela",
  "Banco de Venezuela": "Venezuela",
  "Banco Venezuela": "Venezuela",
  "Banco Mercantil": "Mercantil",
  "Mercantil Banco": "Mercantil",
  "Banesco Banco Universal": "Banesco",
  "Banco Banesco": "Banesco",
  "Banco Nacional de Crédito": "BNC",
  "BBVA Provincial": "Provincial",
  "Banco Provincial": "Provincial",
  Tesoro: "Banco del Tesoro",
  "Banco Bicentenario": "Bicentenario",
  "Banco Exterior": "Exterior",
  "Banco Activo": "Activo",
  "Banco Plaza": "Plaza",
};

const CANONICO = new Map(Object.entries(ALIAS).map(([alias, banco]) => [claveComparacion(alias), claveComparacion(banco)]));

/** Clave para comparar bancos: sin mayúsculas, acentos ni espacios, y con los alias conocidos unificados ("BDV" = "Venezuela"). */
export function claveBanco(banco: string): string {
  const k = claveComparacion(banco);
  return CANONICO.get(k) ?? k;
}

/** Clave de duplicado por banco y referencia; vacía si falta alguno. */
export function claveDuplicado(banco: string, referencia: string): string {
  const b = claveBanco(banco);
  const r = claveReferencia(referencia);
  return b && r ? `${b}\u001f${r}` : "";
}
