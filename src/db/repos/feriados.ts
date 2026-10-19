import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { getAjuste, setAjuste } from "./ajustes";
import { DomainError } from "@/domain/errors";
import { esFinDeSemana, fechaDeTasa, formatFecha } from "@/domain/dates";
import { feriadosNacionales } from "@/domain/feriados";

/** Día bancario sin tasa propia: rige la del último día hábil anterior. */
export type Feriado = { fecha: string; nombre: string | null };

export async function listFeriados(db: SqlDriver): Promise<Feriado[]> {
  return db.select<Feriado>("SELECT fecha, nombre FROM feriados ORDER BY fecha");
}

export async function feriadosSet(db: SqlDriver): Promise<Set<string>> {
  return new Set((await listFeriados(db)).map((f) => f.fecha));
}

const tieneTasa = async (db: SqlDriver, fecha: string) =>
  (await db.select<{ id: number }>("SELECT id FROM tasas WHERE fecha = ?", [fecha])).length > 0;

const esFeriado = async (db: SqlDriver, fecha: string) =>
  (await db.select<{ fecha: string }>("SELECT fecha FROM feriados WHERE fecha = ?", [fecha])).length > 0;

/** Marcar feriado un día con tasa propia cambiaría la tasa (y el USD) de lo ya registrado: se rechaza. */
export async function createFeriado(db: SqlDriver, f: Feriado): Promise<void> {
  if (esFinDeSemana(f.fecha)) throw new DomainError("VALIDACION", "Los sábados y domingos ya usan la tasa del viernes");
  if (await esFeriado(db, f.fecha)) throw new DomainError("DUPLICADO", `El ${formatFecha(f.fecha)} ya es feriado`);
  if (await tieneTasa(db, f.fecha)) throw new DomainError("VALIDACION", "Ese día ya tiene tasa registrada; elimínala primero");
  await db.execute("INSERT INTO feriados (fecha, nombre, creado_en) VALUES (?, ?, ?)", [f.fecha, f.nombre?.trim() || null, nowIso()]);
}

/** Los depósitos de un feriado usan la tasa de otro día: sin el feriado, su tasa ya no sería válida. */
export async function deleteFeriado(db: SqlDriver, fecha: string): Promise<void> {
  const [{ n }] = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM depositos WHERE fecha = ?", [fecha]);
  if (n > 0) {
    const fer = await feriadosSet(db);
    throw new DomainError("VALIDACION", `Hay ${n} depósito(s) de ese día que usan la tasa del ${formatFecha(fechaDeTasa(fecha, fer))}`);
  }
  await db.execute("DELETE FROM feriados WHERE fecha = ?", [fecha]);
}

/**
 * Carga una vez por año (el actual y el siguiente) los feriados nacionales. Se omiten los días que ya tienen
 * tasa propia, para no contradecir lo registrado. Si luego se borra uno, no vuelve.
 */
export async function precargarFeriados(db: SqlDriver, hoy: string): Promise<number> {
  const anio = Number(hoy.slice(0, 4));
  let n = 0;
  for (const a of [anio, anio + 1]) {
    const marca = `feriados_precargados_${a}`;
    if (await getAjuste(db, marca)) continue;
    for (const f of feriadosNacionales(a)) {
      if (esFinDeSemana(f.fecha) || (await esFeriado(db, f.fecha)) || (await tieneTasa(db, f.fecha))) continue;
      await db.execute("INSERT INTO feriados (fecha, nombre, creado_en) VALUES (?, ?, ?)", [f.fecha, f.nombre, nowIso()]);
      n++;
    }
    await setAjuste(db, marca, nowIso());
  }
  return n;
}
