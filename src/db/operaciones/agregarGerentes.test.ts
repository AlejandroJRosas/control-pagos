import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { seedBasico } from "../testing/fixtures";
import { createCampana, setEstadoCampana } from "../repos/campanas";
import { createGerente } from "../repos/gerentes";
import { createAsignacion, jefesDeCampana } from "../repos/asignaciones";
import { jefesAnteriores } from "../queries/jefesAnteriores";
import { agregarGerentes } from "./agregarGerentes";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
});

const asignaciones = () =>
  db.select<{ gerenteId: number; saldoUsd: string }>(
    "SELECT gerente_id AS gerenteId, saldo_usd AS saldoUsd FROM asignaciones WHERE campana_id = ? ORDER BY id",
    [s.campanaId],
  );

it("agrega varios gerentes con su saldo", async () => {
  const beto = await createGerente(db, { nombre: "Beto", telefono: null });
  const caro = await createGerente(db, { nombre: "Caro", telefono: null });
  const ids = await agregarGerentes(db, s.campanaId, [
    { gerenteId: beto, saldoUsd: "100" },
    { gerenteId: caro, saldoUsd: "250.5" },
  ]);
  expect(ids).toHaveLength(2);
  expect((await asignaciones()).slice(1)).toEqual([
    { gerenteId: beto, saldoUsd: "100" },
    { gerenteId: caro, saldoUsd: "250.5" },
  ]);
});

it("si uno falla no deja ninguno agregado", async () => {
  const beto = await createGerente(db, { nombre: "Beto", telefono: null });
  const ana = (await asignaciones())[0].gerenteId;
  await expect(
    agregarGerentes(db, s.campanaId, [
      { gerenteId: beto, saldoUsd: "100" },
      { gerenteId: ana, saldoUsd: "5" },
    ]),
  ).rejects.toMatchObject({ code: "DUPLICADO" });
  expect(await asignaciones()).toHaveLength(1);
});

it("rechaza el mismo gerente dos veces en la lista", async () => {
  const beto = await createGerente(db, { nombre: "Beto", telefono: null });
  await expect(
    agregarGerentes(db, s.campanaId, [
      { gerenteId: beto, saldoUsd: "1" },
      { gerenteId: beto, saldoUsd: "2" },
    ]),
  ).rejects.toMatchObject({ code: "DUPLICADO" });
  expect(await asignaciones()).toHaveLength(1);
});

it("rechaza una campaña cerrada y una lista vacía", async () => {
  const beto = await createGerente(db, { nombre: "Beto", telefono: null });
  await expect(agregarGerentes(db, s.campanaId, [])).rejects.toMatchObject({ code: "VALIDACION" });
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await expect(agregarGerentes(db, s.campanaId, [{ gerenteId: beto, saldoUsd: "1" }])).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});

async function febrero() {
  const feb = await createCampana(db, { nombre: "Febrero", fechaInicio: "2026-02-01", fechaFin: null, notas: null });
  const luis = await createGerente(db, { nombre: "Luis", telefono: null });
  const pedro = await createGerente(db, { nombre: "Pedro", telefono: null });
  const rosa = await createGerente(db, { nombre: "Rosa", telefono: null });
  const anaF = await createAsignacion(db, { campanaId: feb, gerenteId: s.anaId, saldoUsd: "1" });
  const rosaF = await createAsignacion(db, { campanaId: feb, gerenteId: rosa, saldoUsd: "1" });
  await createAsignacion(db, { campanaId: feb, gerenteId: luis, saldoUsd: "1", jefeId: anaF });
  await createAsignacion(db, { campanaId: feb, gerenteId: pedro, saldoUsd: "1", jefeId: rosaF });
  return { luis, pedro };
}

it("propone el jefe de la campaña anterior si ese jefe está en la campaña", async () => {
  const { luis, pedro } = await febrero();
  const [luisM, pedroM] = await agregarGerentes(db, s.campanaId, [
    { gerenteId: luis, saldoUsd: "1" },
    { gerenteId: pedro, saldoUsd: "1" },
  ]);
  const jefes = await jefesDeCampana(db, s.campanaId);
  expect(jefes.get(luisM)).toBe(s.asignacionId);
  expect(jefes.get(pedroM)).toBeNull(); // su jefe anterior (Rosa) no está en marzo
});

it("el jefe puede llegar en la misma tanda", async () => {
  const marzo2 = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const { luis } = await febrero();
  const [anaA, luisA] = await agregarGerentes(db, marzo2, [
    { gerenteId: s.anaId, saldoUsd: "1" },
    { gerenteId: luis, saldoUsd: "1" },
  ]);
  expect((await jefesDeCampana(db, marzo2)).get(luisA)).toBe(anaA);
});

it("jefesAnteriores usa la campaña más reciente donde estuvo el gerente, sin contar la actual", async () => {
  const { luis } = await febrero();
  const [{ id: jefeMarzo }] = await db.select<{ id: number }>("SELECT id FROM asignaciones WHERE campana_id = ?", [s.campanaId]);
  const luisM = await createAsignacion(db, { campanaId: s.campanaId, gerenteId: luis, saldoUsd: "1", jefeId: jefeMarzo });
  expect(luisM).toBeGreaterThan(0);
  const abril = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  expect((await jefesAnteriores(db, abril, [luis])).get(luis)).toBe(s.anaId);
  expect((await jefesAnteriores(db, s.campanaId, [luis])).get(luis)).toBe(s.anaId); // la de febrero; marzo no cuenta
  expect((await jefesAnteriores(db, abril, [])).size).toBe(0);
});
