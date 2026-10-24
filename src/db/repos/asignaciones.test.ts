import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { createCampana, setEstadoCampana } from "./campanas";
import { createGerente } from "./gerentes";
import { createAsignacion, deleteAsignacion, getAsignacion, jefesDeCampana, setJefeAsignacion, updateSaldoAsignacion } from "./asignaciones";

let db: SqlDriver;
let campanaId: number;
let anaId: number;
beforeEach(async () => {
  db = await createTestDb();
  campanaId = await createCampana(db, { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, notas: null });
  anaId = await createGerente(db, { nombre: "Ana", telefono: null });
});

it("crea y obtiene con detalle", async () => {
  const id = await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  expect(await getAsignacion(db, id)).toEqual({
    id,
    campanaId,
    gerenteId: anaId,
    saldoUsd: "100",
    gerenteNombre: "Ana",
    gerenteTelefono: null,
    campanaNombre: "Marzo",
    campanaEstado: "activa",
    jefeId: null,
  });
});

it("no permite el mismo gerente dos veces en una campaña", async () => {
  await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  await expect(createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "5" })).rejects.toMatchObject({ code: "DUPLICADO" });
});

it("actualiza el saldo y rechaza cambios en una campaña cerrada", async () => {
  const id = await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  await updateSaldoAsignacion(db, id, "150.5");
  expect((await getAsignacion(db, id))?.saldoUsd).toBe("150.5");
  await setEstadoCampana(db, campanaId, "cerrada");
  await expect(updateSaldoAsignacion(db, id, "1")).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  const luis = await createGerente(db, { nombre: "Luis", telefono: null });
  await expect(createAsignacion(db, { campanaId, gerenteId: luis, saldoUsd: "1" })).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});

it("solo quita gerentes sin depósitos", async () => {
  const id = await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  await db.execute("INSERT INTO tasas (fecha, valor) VALUES ('2026-03-01', '36.5')");
  await db.execute(
    "INSERT INTO depositos (asignacion_id, tasa_id, fecha, banco, referencia, cuenta_destino, monto_bs, creado_en, actualizado_en) VALUES (?, 1, '2026-03-01', 'B', 'R', 'C', '10', 'x', 'x')",
    [id],
  );
  await expect(deleteAsignacion(db, id)).rejects.toMatchObject({ code: "VALIDACION" });
  await db.execute("DELETE FROM depositos");
  await deleteAsignacion(db, id);
  expect(await getAsignacion(db, id)).toBeNull();
});

async function equipo() {
  const luisId = await createGerente(db, { nombre: "Luis", telefono: null });
  const pedroId = await createGerente(db, { nombre: "Pedro", telefono: null });
  const a = await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "10" });
  const l = await createAsignacion(db, { campanaId, gerenteId: luisId, saldoUsd: "10" });
  const p = await createAsignacion(db, { campanaId, gerenteId: pedroId, saldoUsd: "10" });
  return { luisId, pedroId, a, l, p };
}

it("setJefeAsignacion guarda el jefe y rechaza ciclos, otra campaña y la campaña cerrada", async () => {
  const { a, l, p } = await equipo();
  const otra = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const x = await createAsignacion(db, { campanaId: otra, gerenteId: anaId, saldoUsd: "10" });
  await setJefeAsignacion(db, l, a);
  await setJefeAsignacion(db, p, l);
  expect(await jefesDeCampana(db, campanaId)).toEqual(
    new Map([
      [a, null],
      [l, a],
      [p, l],
    ]),
  );
  await expect(setJefeAsignacion(db, a, p)).rejects.toThrow("Un gerente no puede quedar debajo de sí mismo");
  await expect(setJefeAsignacion(db, a, a)).rejects.toThrow("Un gerente no puede quedar debajo de sí mismo");
  await expect(setJefeAsignacion(db, l, x)).rejects.toThrow("El jefe tiene que ser un gerente de la misma campaña");
  await expect(setJefeAsignacion(db, l, 9999)).rejects.toThrow("El jefe tiene que ser un gerente de la misma campaña");
  await setEstadoCampana(db, campanaId, "cerrada");
  await expect(setJefeAsignacion(db, l, null)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});

it("al quitar un jefe de la campaña, su gente pasa al jefe de él", async () => {
  const { a, l, p } = await equipo();
  const mId = await createGerente(db, { nombre: "Maria", telefono: null });
  const m = await createAsignacion(db, { campanaId, gerenteId: mId, saldoUsd: "10" });
  await setJefeAsignacion(db, l, a);
  await setJefeAsignacion(db, p, l);
  await setJefeAsignacion(db, m, l);
  await deleteAsignacion(db, l);
  const jefes = await jefesDeCampana(db, campanaId);
  expect(jefes.get(p)).toBe(a);
  expect(jefes.get(m)).toBe(a);
  expect(jefes.has(l)).toBe(false);
});

it("createAsignacion acepta uuid y jefe", async () => {
  const { luisId, a } = await equipo();
  const otroId = await createGerente(db, { nombre: "Otro", telefono: null });
  const id = await createAsignacion(db, { campanaId, gerenteId: otroId, saldoUsd: "10", jefeId: a }, { uuid: "u-1" });
  expect((await getAsignacion(db, id))?.jefeId).toBe(a);
  expect((await db.select<{ uuid: string }>("SELECT uuid FROM asignaciones WHERE id = ?", [id]))[0].uuid).toBe("u-1");
  expect(luisId).toBeGreaterThan(0);
});

it("createAsignacion rechaza un jefe de otra campaña", async () => {
  const otra = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const x = await createAsignacion(db, { campanaId: otra, gerenteId: anaId, saldoUsd: "10" });
  const luisId = await createGerente(db, { nombre: "Luis", telefono: null });
  await expect(createAsignacion(db, { campanaId, gerenteId: luisId, saldoUsd: "1", jefeId: x })).rejects.toThrow(
    "El jefe tiene que ser un gerente de la misma campaña",
  );
});
