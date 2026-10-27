import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createCampana, setEstadoCampana } from "../repos/campanas";
import { createGerente } from "../repos/gerentes";
import { createAsignacion } from "../repos/asignaciones";
import { createDeposito, getDeposito, updateDeposito } from "../repos/depositos";
import { moverDepositos, restaurarMovidos } from "./moverDepositos";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
let beto: number;
let d1: number, d2: number;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
  beto = await createAsignacion(db, { campanaId: s.campanaId, gerenteId: await createGerente(db, { nombre: "Beto", telefono: null }), saldoUsd: "50" });
  d1 = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "1" }));
  d2 = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "2" }));
  await db.execute("UPDATE depositos SET actualizado_en = '2026-03-02T10:00:00.000Z'");
});

it("pasa los depósitos al otro gerente, marca la edición y restaurarMovidos los devuelve tal como estaban", async () => {
  const movidos = await moverDepositos(db, [d1, d2], beto);
  for (const id of [d1, d2]) {
    const d = (await getDeposito(db, id))!;
    expect(d.asignacionId).toBe(beto);
    expect(d.actualizadoEn > "2026-03-02T10:00:00.000Z").toBe(true);
  }
  await restaurarMovidos(db, movidos);
  for (const id of [d1, d2]) {
    const d = (await getDeposito(db, id))!;
    expect(d.asignacionId).toBe(s.asignacionId);
    expect(d.actualizadoEn).toBe("2026-03-02T10:00:00.000Z");
  }
});

it("conserva el uuid, la fecha y la creación", async () => {
  const antes = (await getDeposito(db, d1))!;
  await moverDepositos(db, [d1], beto);
  const despues = (await getDeposito(db, d1))!;
  expect(despues).toMatchObject({ uuid: antes.uuid, creadoEn: antes.creadoEn, fecha: antes.fecha, tasaId: antes.tasaId });
});

it("no mueve a un gerente de otra campaña, y no cambia ninguno", async () => {
  const otra = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const ajena = await createAsignacion(db, { campanaId: otra, gerenteId: s.anaId, saldoUsd: "1" });
  await expect(moverDepositos(db, [d1, d2], ajena)).rejects.toThrow(/misma campaña/);
  expect((await getDeposito(db, d1))!.asignacionId).toBe(s.asignacionId);
});

it("con la campaña cerrada no se mueve nada", async () => {
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await expect(moverDepositos(db, [d1], beto)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});

it("pide al menos un depósito y que existan todos", async () => {
  await expect(moverDepositos(db, [], beto)).rejects.toThrow(/al menos un depósito/);
  await expect(moverDepositos(db, [d1, 999], beto)).rejects.toMatchObject({ code: "NO_ENCONTRADO" });
  expect((await getDeposito(db, d1))!.asignacionId).toBe(s.asignacionId);
});

it("updateDeposito tampoco pasa un depósito a un gerente de otra campaña", async () => {
  const otra = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const ajena = await createAsignacion(db, { campanaId: otra, gerenteId: s.anaId, saldoUsd: "1" });
  await expect(updateDeposito(db, d1, depositoBase(s.tasaId, { referencia: "1" }), { asignacionId: ajena })).rejects.toThrow(/misma campaña/);
  await updateDeposito(db, d1, depositoBase(s.tasaId, { referencia: "1" }), { asignacionId: beto });
  expect((await getDeposito(db, d1))!.asignacionId).toBe(beto);
});
