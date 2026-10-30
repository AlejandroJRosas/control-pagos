import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { seedBasico } from "../testing/fixtures";
import { recordarVariantesCuenta } from "../repos/cuentasAlias";
import { unificarCuentas } from "./unificarCuentas";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
const T0 = "2026-01-01T00:00:00.000Z";
const MA = "M A Colecciones 2006 CA";

beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
});

async function insertar(cuenta: string, i: number) {
  await db.execute(
    `INSERT INTO depositos (asignacion_id, tasa_id, fecha, banco, referencia, cuenta_destino, monto_bs, creado_en, actualizado_en, uuid)
     VALUES (?, ?, '2026-03-02', 'Banesco', ?, ?, '10', ?, ?, ?)`,
    [s.asignacionId, s.tasaId, String(i), cuenta, T0, T0, `u${i}`],
  );
}
const borrador = (cuentaDestino: string) =>
  JSON.stringify({ draft: { fecha: "", banco: "", referencia: "", cuentaDestino }, destino: { sel: "" }, auto: { estado: {}, confianza: {} } });

it("pasa las variantes recordadas al nombre unificado en depósitos y borradores de la cola, y es idempotente", async () => {
  await recordarVariantesCuenta(db, ["MYA Colecciones 2006 ca"], MA);
  await insertar("MYA Colecciones 2006 ca", 1);
  await insertar("mya colecciones 2006 CA", 2);
  await insertar(" Otra Cuenta ", 3);
  await db.execute("INSERT INTO cola_depositos (campana_id, imagen_path, borrador, orden, creado_en, actualizado_en) VALUES (?, 'a.png', ?, 0, ?, ?)", [
    s.campanaId,
    borrador("MYA colecciones 2006 ca"),
    T0,
    T0,
  ]);

  expect(await unificarCuentas(db)).toBe(2);
  const deps = await db.select<{ cuenta: string; actualizado_en: string }>("SELECT cuenta_destino AS cuenta, actualizado_en FROM depositos ORDER BY id");
  expect(deps.map((d) => d.cuenta)).toEqual([MA, MA, " Otra Cuenta "]);
  expect(deps[0].actualizado_en).not.toBe(T0);
  expect(deps[2].actualizado_en).toBe(T0);
  const [cola] = await db.select<{ cuenta: string }>("SELECT json_extract(borrador, '$.draft.cuentaDestino') AS cuenta FROM cola_depositos");
  expect(cola.cuenta).toBe(MA);

  expect(await unificarCuentas(db)).toBe(0);
});
