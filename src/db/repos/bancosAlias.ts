import type { SqlDriver } from "../driver";
import { claveComparacion } from "@/domain/texto";
import type { BancosConocidos } from "@/domain/bancos";
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
