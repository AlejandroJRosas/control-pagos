import type { SqlDriver } from "../driver";
import { claveComparacion } from "@/domain/texto";
import { bancoCanonico, type BancosConocidos } from "@/domain/bancos";
import { listBancosUsados } from "./depositos";

/** Recuerda que `nombre` (como se escribe) es el banco `banco`; si ya estaba, lo reemplaza. */
export async function guardarAliasBanco(db: SqlDriver, nombre: string, banco: string): Promise<void> {
  await db.execute("INSERT INTO bancos_alias (alias, banco) VALUES (?, ?) ON CONFLICT(alias) DO UPDATE SET banco = excluded.banco", [claveComparacion(nombre), banco]);
}

/** Bancos ya usados en depósitos (cada uno apunta a sí mismo) y alias recordados; los recordados ganan. */
export async function bancosConocidos(db: SqlDriver): Promise<BancosConocidos> {
  const mapa = new Map<string, string>();
  for (const b of await listBancosUsados(db)) if (claveComparacion(b)) mapa.set(claveComparacion(b), b);
  const alias = await db.select<{ alias: string; banco: string }>("SELECT alias, banco FROM bancos_alias");
  for (const a of alias) mapa.set(a.alias, a.banco);
  return mapa;
}

/**
 * Al corregir el banco de un depósito: el nombre viejo pasa a ser alias del nuevo, si el nuevo se conoce y el viejo no es
 * ya un banco de la lista fija (así `unificarBancos` corrige los demás al abrir). Devuelve si aprendió algo.
 */
export async function aprenderAliasBanco(db: SqlDriver, viejo: string, nuevo: string): Promise<boolean> {
  const clave = claveComparacion(viejo);
  if (!clave || clave === claveComparacion(nuevo) || bancoCanonico(viejo)) return false;
  const canonico = bancoCanonico(nuevo, await bancosConocidos(db));
  if (!canonico || claveComparacion(canonico) === clave) return false;
  await guardarAliasBanco(db, viejo, canonico);
  return true;
}
