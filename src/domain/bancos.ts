import Decimal from "decimal.js";
import { claveComparacion, claveReferencia } from "./texto";

export const BANCOS_SUGERIDOS = [
  "100% Banco",
  "Activo",
  "Bancamiga",
  "Bancaribe",
  "Banco del Tesoro",
  "Banco Digital de los Trabajadores",
  "Bancrecer",
  "Banesco",
  "Banfanb",
  "Banplus",
  "Bicentenario",
  "Caroní",
  "BNC",
  "Del Sur",
  "Exterior",
  "Mercantil",
  "Mi Banco",
  "Plaza",
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
  "Banco Caroní": "Caroní",
  "Banco Exterior": "Exterior",
  "Banco Activo": "Activo",
  "Banco Plaza": "Plaza",
  BDT: "Banco Digital de los Trabajadores",
  "Digital de los Trabajadores": "Banco Digital de los Trabajadores",
};

const CANONICO = new Map(Object.entries(ALIAS).map(([alias, banco]) => [claveComparacion(alias), claveComparacion(banco)]));

/** Clave para comparar bancos: sin mayúsculas, acentos ni espacios, y con los alias conocidos unificados ("BDV" = "Venezuela"). */
export function claveBanco(banco: string): string {
  const k = claveComparacion(banco);
  return CANONICO.get(k) ?? k;
}

/** Bancos conocidos que el usuario recordó: `claveComparacion` del nombre escrito → nombre del banco. */
export type BancosConocidos = ReadonlyMap<string, string>;

/**
 * Nombre canónico de un banco: el de `BANCOS_SUGERIDOS` (o el destino de un alias), o el recordado en `conocidos`.
 * `null` si no se reconoce o está vacío.
 */
export function bancoCanonico(nombre: string, conocidos: BancosConocidos = new Map()): string | null {
  const k = claveComparacion(nombre);
  if (!k) return null;
  for (const b of [...BANCOS_SUGERIDOS, ...Object.values(ALIAS)]) if (claveComparacion(b) === k) return b;
  for (const [alias, banco] of Object.entries(ALIAS)) if (claveComparacion(alias) === k) return banco;
  return conocidos.get(k) ?? null;
}

/** Bancos cuya referencia no identifica un pago (el Provincial entrega la cédula): no tienen clave de duplicado. */
export const BANCOS_SIN_REFERENCIA_UNICA = ["Provincial"];

export function sinReferenciaUnica(banco: string): boolean {
  const k = claveBanco(banco);
  return BANCOS_SIN_REFERENCIA_UNICA.some((b) => claveBanco(b) === k);
}

/** Cédula de la referencia del Provincial para comparar: solo los dígitos, sin ceros iniciales ("V-12.345.678" = "12345678"). */
export function claveCedula(referencia: string): string {
  return referencia.replace(/\D/g, "").replace(/^0+/, "");
}

/** Clave de "posible repetido" del Provincial: cédula (`claveCedula`), fecha y monto. Vacía si no aplica. */
export function clavePosibleRepetido(banco: string, referencia: string, fecha: string, montoBs: string): string {
  if (!sinReferenciaUnica(banco) || !fecha) return "";
  const cedula = claveCedula(referencia);
  if (!cedula) return "";
  let monto: string;
  try {
    monto = new Decimal(montoBs).toFixed();
  } catch {
    return "";
  }
  return `${cedula}\u001f${fecha}\u001f${monto}`;
}

/** Clave de duplicado por banco y referencia; vacía si falta alguno o el banco no tiene referencia única. */
export function claveDuplicado(banco: string, referencia: string): string {
  if (sinReferenciaUnica(banco)) return "";
  const b = claveBanco(banco);
  const r = claveReferencia(referencia);
  return b && r ? `${b}\u001f${r}` : "";
}
