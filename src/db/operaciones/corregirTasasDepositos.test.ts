import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { seedBasico } from "../testing/fixtures";
import { createTasa } from "../repos/tasas";
import { createFeriado } from "../repos/feriados";
import { corregirTasasDepositos } from "./corregirTasasDepositos";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
let viernesId: number;
const T0 = "2026-01-01T00:00:00.000Z";

beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db); // tasa del lunes 02/03/2026
  viernesId = await createTasa(db, { fecha: "2026-02-27", valor: "36", notas: null, imagenPath: null });
});

/** Como quedaron los registrados con la regla vieja (fin de semana = tasa del viernes): con SQL, saltándose la validación. */
async function insertar(fecha: string, tasaId: number, i: number) {
  await db.execute(
    `INSERT INTO depositos (asignacion_id, tasa_id, fecha, banco, referencia, cuenta_destino, monto_bs, creado_en, actualizado_en, uuid)
     VALUES (?, ?, ?, 'Banesco', ?, 'X', '10', ?, ?, ?)`,
    [s.asignacionId, tasaId, fecha, String(i), T0, T0, `u${i}`],
  );
}
const leer = () => db.select<{ fecha: string; tasaId: number; actualizadoEn: string }>("SELECT fecha, tasa_id AS tasaId, actualizado_en AS actualizadoEn FROM depositos ORDER BY id");

it("pasa los de fin de semana con la tasa del viernes a la del siguiente día hábil, sin tocar actualizado_en, y es idempotente", async () => {
  await insertar("2026-02-28", viernesId, 1); // sábado
  await insertar("2026-03-01", viernesId, 2); // domingo
  await insertar("2026-02-27", viernesId, 3); // el viernes mismo: está bien
  await insertar("2026-03-02", s.tasaId, 4);

  expect(await corregirTasasDepositos(db)).toBe(2);
  const deps = await leer();
  expect(deps.map((d) => d.tasaId)).toEqual([s.tasaId, s.tasaId, viernesId, s.tasaId]);
  expect(deps.every((d) => d.actualizadoEn === T0)).toBe(true);
  expect(await corregirTasasDepositos(db)).toBe(0);
});

it("sigue los feriados: si el lunes es feriado, va a la del martes", async () => {
  await db.execute("DELETE FROM tasas WHERE id = ?", [s.tasaId]);
  await createFeriado(db, { fecha: "2026-03-02", nombre: "X" });
  const martesId = await createTasa(db, { fecha: "2026-03-03", valor: "37", notas: null, imagenPath: null });
  await insertar("2026-03-01", viernesId, 1);
  expect(await corregirTasasDepositos(db)).toBe(1);
  expect((await leer())[0].tasaId).toBe(martesId);
});

it("si falta la tasa que rige, lo deja como está", async () => {
  await insertar("2026-03-07", viernesId, 1); // sábado; no hay tasa del lunes 09/03
  expect(await corregirTasasDepositos(db)).toBe(0);
  expect((await leer())[0].tasaId).toBe(viernesId);
});

it("no toca las campañas cerradas", async () => {
  await insertar("2026-03-01", viernesId, 1);
  await db.execute("UPDATE campanas SET estado = 'cerrada' WHERE id = ?", [s.campanaId]);
  expect(await corregirTasasDepositos(db)).toBe(0);
  expect((await leer())[0].tasaId).toBe(viernesId);
});
