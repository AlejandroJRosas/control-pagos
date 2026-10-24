import { beforeEach, expect, it } from "vitest";
import type { SqlDriver, SqlValue } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { createCampana, setEstadoCampana } from "../repos/campanas";
import { createGerente } from "../repos/gerentes";
import { createAsignacion, jefesDeCampana, setJefeAsignacion } from "../repos/asignaciones";
import { moverAJefe, restaurarJefes } from "./moverAJefe";

let db: SqlDriver;
let campanaId: number;
let a: number, b: number, c: number, d: number;
beforeEach(async () => {
  db = await createTestDb();
  campanaId = await createCampana(db, { nombre: "Octubre", fechaInicio: "2026-10-01", fechaFin: null, notas: null });
  const nueva = async (nombre: string) => createAsignacion(db, { campanaId, gerenteId: await createGerente(db, { nombre, telefono: null }), saldoUsd: "1" });
  a = await nueva("A");
  b = await nueva("B");
  c = await nueva("C");
  d = await nueva("D");
  await setJefeAsignacion(db, c, d);
});

it("mueve varios bajo un jefe, devuelve sus jefes anteriores y restaurarJefes los deja como estaban", async () => {
  const antes = await moverAJefe(db, [b, c], a);
  expect(antes).toEqual(
    new Map([
      [b, null],
      [c, d],
    ]),
  );
  const jefes = await jefesDeCampana(db, campanaId);
  expect(jefes.get(b)).toBe(a);
  expect(jefes.get(c)).toBe(a);
  await restaurarJefes(db, antes);
  const vuelta = await jefesDeCampana(db, campanaId);
  expect(vuelta.get(b)).toBeNull();
  expect(vuelta.get(c)).toBe(d);
});

it("sin jefe (null) quita el jefe a todos", async () => {
  await moverAJefe(db, [c], null);
  expect((await jefesDeCampana(db, campanaId)).get(c)).toBeNull();
});

it("rechaza dejar a alguien debajo de sí mismo o de su nieto, sin cambiar ninguno", async () => {
  await setJefeAsignacion(db, b, c); // d > c > b
  const antes = await jefesDeCampana(db, campanaId);
  await expect(moverAJefe(db, [a, d], b)).rejects.toMatchObject({ code: "VALIDACION", message: "Un gerente no puede quedar debajo de sí mismo" });
  await expect(moverAJefe(db, [a, b], b)).rejects.toMatchObject({ code: "VALIDACION" });
  expect(await jefesDeCampana(db, campanaId)).toEqual(antes);
});

it("si la escritura del segundo falla, el primero vuelve a su jefe y el error es el original", async () => {
  let updates = 0;
  const falla: SqlDriver = {
    select: (s, p) => db.select(s, p),
    execute: async (s: string, p?: SqlValue[]) => {
      if (s.startsWith("UPDATE asignaciones SET jefe_id") && ++updates === 2) throw new Error("disco lleno");
      return db.execute(s, p);
    },
  };
  await expect(moverAJefe(falla, [b, c], a)).rejects.toThrow("disco lleno");
  const jefes = await jefesDeCampana(db, campanaId);
  expect(jefes.get(b)).toBeNull();
  expect(jefes.get(c)).toBe(d);
});

it("campaña cerrada: CAMPANA_CERRADA", async () => {
  await setEstadoCampana(db, campanaId, "cerrada");
  await expect(moverAJefe(db, [b], a)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});
