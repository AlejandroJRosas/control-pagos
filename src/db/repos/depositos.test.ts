import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createTasa } from "./tasas";
import { setEstadoCampana } from "./campanas";
import { createDeposito, deleteDeposito, findDuplicados, getDeposito, listBancosUsados, updateDeposito } from "./depositos";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
});

it("crea y obtiene", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { observaciones: "primer pago" }));
  const d = await getDeposito(db, id);
  expect(d).toMatchObject({ id, asignacionId: s.asignacionId, tasaId: s.tasaId, montoBs: "3650", observaciones: "primer pago" });
  expect(d?.creadoEn).toBe(d?.actualizadoEn);
});

it("rechaza una tasa que no es de la fecha del depósito", async () => {
  await expect(createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { fecha: "2026-03-05" }))).rejects.toMatchObject({ code: "VALIDACION" });
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  await expect(updateDeposito(db, id, depositoBase(s.tasaId, { fecha: "2026-03-05" }))).rejects.toMatchObject({ code: "VALIDACION" });
  const t5 = await createTasa(db, { fecha: "2026-03-05", valor: "40", notas: null, imagenPath: null });
  await updateDeposito(db, id, depositoBase(t5, { fecha: "2026-03-05", montoBs: "4000" }));
  expect(await getDeposito(db, id)).toMatchObject({ fecha: "2026-03-05", tasaId: t5, montoBs: "4000" });
});

it("detecta duplicados sin distinguir mayúsculas ni espacios, excluyendo el propio", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Banesco ", referencia: " 123 " }));
  const dups = await findDuplicados(db, "banesco", "123");
  expect(dups).toEqual([{ id, fecha: "2026-03-02", montoBs: "3650", gerenteNombre: "Ana", campanaNombre: "Marzo" }]);
  expect(await findDuplicados(db, "BANESCO", "123", id)).toEqual([]);
  expect(await findDuplicados(db, "Mercantil", "123")).toEqual([]);
});

it("detecta duplicados con otra capitalización, acentos o espacios internos", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Venezolano de Crédito", referencia: "AB12 cd" }));
  expect((await findDuplicados(db, "VENEZOLANO DE CREDITO", "ab12CD")).map((d) => d.id)).toEqual([id]);
  expect(await findDuplicados(db, "Venezolano de Crédito", "AB12 ce")).toEqual([]);
});

it("bloquea cambios en campaña cerrada", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await expect(createDeposito(db, s.asignacionId, depositoBase(s.tasaId))).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  await expect(updateDeposito(db, id, depositoBase(s.tasaId))).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  await expect(deleteDeposito(db, id)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});

it("elimina y lista bancos usados sin repetir", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Mercantil" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Banesco", referencia: "9" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Banesco", referencia: "10" }));
  expect(await listBancosUsados(db)).toEqual(["Banesco", "Mercantil"]);
  await deleteDeposito(db, id);
  expect(await getDeposito(db, id)).toBeNull();
});
