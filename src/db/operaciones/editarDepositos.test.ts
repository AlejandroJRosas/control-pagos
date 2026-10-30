import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { crearDuplicado, depositoBase, seedBasico } from "../testing/fixtures";
import { setEstadoCampana } from "../repos/campanas";
import { createTasa } from "../repos/tasas";
import { createDeposito, getDeposito } from "../repos/depositos";
import { bancosConocidos } from "../repos/bancosAlias";
import { editarDepositos, restaurarEditados } from "./editarDepositos";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
let d1: number, d2: number;
const ANTES = "2026-03-02T10:00:00.000Z";
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
  d1 = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "1", banco: "Bco de Vzla", cuentaDestino: "0414-1234567" }));
  d2 = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "2", banco: "Bco de Vzla", observaciones: "primera" }));
  await db.execute("UPDATE depositos SET actualizado_en = ?", [ANTES]);
});

it("cambia solo los campos pedidos, marca la edición y restaurarEditados los deja como estaban", async () => {
  const antes = [(await getDeposito(db, d1))!, (await getDeposito(db, d2))!];
  const editados = await editarDepositos(db, [d1, d2], { cuentaDestino: " Juan Pérez ", nota: "pagado por la hermana" });
  const [a, b] = [(await getDeposito(db, d1))!, (await getDeposito(db, d2))!];
  expect(a).toMatchObject({ cuentaDestino: "Juan Pérez", observaciones: "pagado por la hermana", banco: "Bco de Vzla", fecha: "2026-03-02" });
  expect(b).toMatchObject({ cuentaDestino: "Juan Pérez", observaciones: "primera\npagado por la hermana" });
  expect(a.actualizadoEn > ANTES).toBe(true);
  await restaurarEditados(db, editados);
  expect([(await getDeposito(db, d1))!, (await getDeposito(db, d2))!]).toEqual(antes);
});

it("el banco va con su nombre canónico y se recuerda la equivalencia del nombre viejo; deshacer la olvida", async () => {
  const editados = await editarDepositos(db, [d1, d2], { banco: "bdv" });
  expect((await getDeposito(db, d1))!.banco).toBe("Venezuela");
  expect((await bancosConocidos(db)).get("bcodevzla")).toBe("Venezuela");
  await restaurarEditados(db, editados);
  expect((await getDeposito(db, d1))!.banco).toBe("Bco de Vzla");
  expect((await bancosConocidos(db)).get("bcodevzla")).toBe("Bco de Vzla");
});

it("no recuerda un banco que no se conoce ni el nombre de un banco conocido", async () => {
  await editarDepositos(db, [d1], { banco: "Banco Inventado" });
  expect((await getDeposito(db, d1))!.banco).toBe("Banco Inventado");
  const alias = await db.select<{ alias: string }>("SELECT alias FROM bancos_alias");
  expect(alias).toEqual([]);
  const d3 = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "3", banco: "Banesco" }));
  await editarDepositos(db, [d3], { banco: "Venezuela" });
  expect(await db.select("SELECT alias FROM bancos_alias")).toEqual([]);
});

it("la fecha nueva toma la tasa que rige ese día (fin de semana = la del siguiente hábil)", async () => {
  const lunes = await createTasa(db, { fecha: "2026-03-09", valor: "40", notas: null, imagenPath: null });
  const editados = await editarDepositos(db, [d1], { fecha: "2026-03-07" });
  expect(await getDeposito(db, d1)).toMatchObject({ fecha: "2026-03-07", tasaId: lunes });
  await restaurarEditados(db, editados);
  expect(await getDeposito(db, d1)).toMatchObject({ fecha: "2026-03-02", tasaId: s.tasaId });
});

it("sin tasa para la fecha nueva no cambia ninguno", async () => {
  await expect(editarDepositos(db, [d1, d2], { fecha: "2026-03-10", cuentaDestino: "X" })).rejects.toThrow(/No hay tasa del 10\/03\/2026/);
  expect((await getDeposito(db, d1))!.cuentaDestino).toBe("0414-1234567");
});

it("si el banco nuevo choca con otro depósito (o entre los marcados) no cambia ninguno", async () => {
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "2", banco: "Venezuela" }));
  await expect(editarDepositos(db, [d1, d2], { banco: "Venezuela" })).rejects.toMatchObject({ code: "DUPLICADO" });
  expect((await getDeposito(db, d1))!.banco).toBe("Bco de Vzla");

  const d4 = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "1", banco: "Mercantil" }));
  await expect(editarDepositos(db, [d1, d4], { banco: "Banesco" })).rejects.toThrow(/referencia 1/);
  expect(await db.select("SELECT alias FROM bancos_alias")).toEqual([]);
});

it("un duplicado de antes se puede editar si no cambia su banco ni su referencia", async () => {
  const dup = await crearDuplicado(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "1", banco: "Bco de Vzla" }));
  await editarDepositos(db, [dup], { cuentaDestino: "Juan" });
  expect((await getDeposito(db, dup))!.cuentaDestino).toBe("Juan");
});

it("pide algún cambio, al menos un depósito, y con la campaña cerrada no cambia nada", async () => {
  await expect(editarDepositos(db, [d1], {})).rejects.toThrow(/Indica qué cambiar/);
  await expect(editarDepositos(db, [], { cuentaDestino: "X" })).rejects.toThrow(/al menos un depósito/);
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await expect(editarDepositos(db, [d1], { cuentaDestino: "X" })).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});
