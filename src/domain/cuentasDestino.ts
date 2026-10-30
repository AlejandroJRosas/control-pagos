import { claveComparacion } from "./texto";

/** Cuentas destino ya usadas en los depósitos de la campaña: las sugerencias del campo al registrar. */
export function cuentasDeCampana(depositos: { cuentaDestino: string }[]): string[] {
  const cuentas = new Set(depositos.map((d) => d.cuentaDestino.trim()).filter(Boolean));
  return [...cuentas].sort((a, b) => a.localeCompare(b, "es"));
}

/** Variantes recordadas de las cuentas destino: `claveComparacion` de cómo se escribió → nombre unificado. */
export type CuentasAlias = Map<string, string>;

/** Nombre unificado de una cuenta destino: el recordado para esa variante (sin mayúsculas, acentos ni espacios) o la misma. */
export function cuentaCanonica(cuenta: string, alias: CuentasAlias): string {
  return alias.get(claveComparacion(cuenta)) ?? cuenta;
}

export type VarianteCuenta = { variante: string; depositos: number; unificada: boolean };

/**
 * Nombres viejos de los depósitos marcados que se pueden recordar como variantes de la cuenta `nueva`: los distintos de ella
 * que no apuntan ya a ella. `unificada` = ya es el nombre unificado de otras variantes (más bien una corrección entre cuentas buenas).
 */
export function variantesParaRecordar(viejas: string[], nueva: string, alias: CuentasAlias): VarianteCuenta[] {
  const destino = claveComparacion(cuentaCanonica(nueva, alias));
  const unificadas = new Set([...alias.values()].map(claveComparacion));
  const porClave = new Map<string, VarianteCuenta>();
  for (const v of viejas) {
    const clave = claveComparacion(v);
    if (!clave || clave === destino || claveComparacion(cuentaCanonica(v, alias)) === destino) continue;
    const ya = porClave.get(clave);
    if (ya) ya.depositos++;
    else porClave.set(clave, { variante: v.trim(), depositos: 1, unificada: unificadas.has(clave) });
  }
  return [...porClave.values()].sort((a, b) => a.variante.localeCompare(b.variante, "es"));
}
