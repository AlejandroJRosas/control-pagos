import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { crearDuplicado, depositoBase, seedBasico } from "../testing/fixtures";
import { createTasa } from "./tasas";
import { createCampana, setEstadoCampana } from "./campanas";
import { createDeposito, deleteDeposito, deleteDepositos, findDuplicados, getDeposito, listBancosUsados, listCuentasDestinoUsadas, restaurarDepositos, updateDeposito } from "./depositos";
import { createGerente } from "./gerentes";
import { createAsignacion } from "./asignaciones";
import { listEliminaciones, uuidsEliminados } from "./consolidacion";
import { borradorDepositoVacio, encolarDeposito, getItemColaDeposito } from "./cola";

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
  expect(dups).toEqual([
    {
      id,
      asignacionId: s.asignacionId,
      fecha: "2026-03-02",
      banco: "Banesco ",
      referencia: " 123 ",
      montoBs: "3650",
      observaciones: null,
      imagenPath: null,
      gerenteNombre: "Ana",
      campanaNombre: "Marzo",
      campanaEstado: "activa",
    },
  ]);
  expect(await findDuplicados(db, "BANESCO", "123", id)).toEqual([]);
  expect(await findDuplicados(db, "Mercantil", "123")).toEqual([]);
});

it("detecta duplicados con otra capitalización, acentos o espacios internos", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Venezolano de Crédito", referencia: "AB12 cd" }));
  expect((await findDuplicados(db, "VENEZOLANO DE CREDITO", "ab12CD")).map((d) => d.id)).toEqual([id]);
  expect(await findDuplicados(db, "Venezolano de Crédito", "AB12 ce")).toEqual([]);
});

it("no deja crear ni cambiar a un banco y referencia que ya existen", async () => {
  const a = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Banesco", referencia: "123" }));
  await expect(createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "banesco", referencia: "0123" }))).rejects.toMatchObject({
    code: "DUPLICADO",
    message: expect.stringContaining("Ya existe un depósito de Banesco con la referencia 123"),
  });
  const b = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Banesco", referencia: "456" }));
  await expect(updateDeposito(db, b, depositoBase(s.tasaId, { referencia: "123" }))).rejects.toMatchObject({ code: "DUPLICADO" });
  // El propio depósito no cuenta.
  await updateDeposito(db, a, depositoBase(s.tasaId, { referencia: "123", montoBs: "7300" }));
  expect(await getDeposito(db, a)).toMatchObject({ montoBs: "7300" });
});

it("un duplicado que ya existía se puede editar sin cambiar su banco ni referencia", async () => {
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "123" }));
  const viejo = await crearDuplicado(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "123" }));
  await updateDeposito(db, viejo, depositoBase(s.tasaId, { referencia: "123", observaciones: "revisar" }));
  expect(await getDeposito(db, viejo)).toMatchObject({ observaciones: "revisar" });
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

it("un depósito de sábado o domingo usa la tasa del lunes", async () => {
  const lunes = await createTasa(db, { fecha: "2026-03-09", valor: "40", notas: null, imagenPath: null });
  const id = await createDeposito(db, s.asignacionId, depositoBase(lunes, { fecha: "2026-03-07" }));
  await updateDeposito(db, id, depositoBase(lunes, { fecha: "2026-03-08" }));
  expect(await getDeposito(db, id)).toMatchObject({ fecha: "2026-03-08", tasaId: lunes });
  await expect(updateDeposito(db, id, depositoBase(lunes, { fecha: "2026-03-06" }))).rejects.toMatchObject({ code: "VALIDACION" });
});

it("elimina varios depósitos a la vez, o ninguno si alguno es de una campaña cerrada", async () => {
  const a = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  const b = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "2" }));
  const c = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "3" }));
  await deleteDepositos(db, [a, b]);
  expect(await getDeposito(db, a)).toBeNull();
  expect(await getDeposito(db, b)).toBeNull();
  await expect(deleteDepositos(db, [c, 999])).rejects.toMatchObject({ code: "NO_ENCONTRADO" });
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await expect(deleteDepositos(db, [c])).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  expect(await getDeposito(db, c)).not.toBeNull();
  await deleteDepositos(db, []);
});

it("restaura los depósitos eliminados con el mismo id, fechas de creación y enlace de la cola", async () => {
  const a = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { observaciones: "x", imagenPath: "imagenes/a.png" }));
  const b = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "2" }));
  const antes = [await getDeposito(db, a), await getDeposito(db, b)];
  const colaId = await encolarDeposito(db, s.campanaId, { imagenPath: "imagenes/a.png", nombreArchivo: null, borrador: borradorDepositoVacio() });
  await db.execute("UPDATE cola_depositos SET estado = 'hecho', deposito_id = ? WHERE id = ?", [a, colaId]);

  const eliminados = await deleteDepositos(db, [a, b]);
  expect(eliminados.depositos).toEqual(antes);
  await db.execute("UPDATE cola_depositos SET deposito_id = NULL WHERE id = ?", [colaId]);

  await restaurarDepositos(db, eliminados);
  expect([await getDeposito(db, a), await getDeposito(db, b)]).toEqual(antes);
  expect((await getItemColaDeposito(db, colaId))?.depositoId).toBe(a);
});

it("no restaura nada si la campaña se cerró mientras tanto", async () => {
  const a = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  const eliminados = await deleteDepositos(db, [a]);
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await expect(restaurarDepositos(db, eliminados)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  expect(await getDeposito(db, a)).toBeNull();
});

it("eliminar uno también devuelve lo necesario para restaurarlo", async () => {
  const a = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  const antes = await getDeposito(db, a);
  const eliminados = await deleteDeposito(db, a);
  await restaurarDepositos(db, eliminados);
  expect(await getDeposito(db, a)).toEqual(antes);
});

it("detecta duplicados con alias de banco y sin ceros iniciales", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Banco de Venezuela", referencia: "000777" }));
  expect((await findDuplicados(db, "BDV", "777")).map((d) => d.id)).toEqual([id]);
  expect(await findDuplicados(db, "Banesco", "777")).toEqual([]);
});

it("lista las cuentas destino usadas sin repetir", async () => {
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { cuentaDestino: "A", referencia: "1" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { cuentaDestino: " A ", referencia: "2" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { cuentaDestino: "B", referencia: "3" }));
  expect(await listCuentasDestinoUsadas(db)).toEqual(["A", "B"]);
});

it("deleteDepositos registra la eliminación con su campaña y asignación", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  const d = await getDeposito(db, id);
  const [{ uuid: campanaUuid }] = await db.select<{ uuid: string }>("SELECT uuid FROM campanas WHERE id = ?", [s.campanaId]);
  const [{ uuid: asignacionUuid }] = await db.select<{ uuid: string }>("SELECT uuid FROM asignaciones WHERE id = ?", [s.asignacionId]);
  await deleteDeposito(db, id);
  expect(await listEliminaciones(db, campanaUuid)).toEqual([{ uuid: d!.uuid, asignacionUuid, eliminadoEn: expect.any(String) }]);
  expect((await uuidsEliminados(db)).has(d!.uuid)).toBe(true);
});

it("restaurarDepositos quita la eliminación", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  const [{ uuid: campanaUuid }] = await db.select<{ uuid: string }>("SELECT uuid FROM campanas WHERE id = ?", [s.campanaId]);
  const e = await deleteDeposito(db, id);
  await restaurarDepositos(db, e);
  expect(await listEliminaciones(db, campanaUuid)).toEqual([]);
});

it("createDeposito con meta conserva uuid y fechas", async () => {
  const meta = { uuid: "11111111-1111-4111-8111-111111111111", creadoEn: "2026-03-02T10:00:00.000Z", actualizadoEn: "2026-03-03T10:00:00.000Z" };
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId), meta);
  expect(await getDeposito(db, id)).toMatchObject(meta);
  await expect(createDeposito(db, s.asignacionId, depositoBase(s.tasaId), { ...meta, uuid: crypto.randomUUID() })).rejects.toMatchObject({ code: "DUPLICADO" });
});

it("updateDeposito con meta pone actualizado_en y puede cambiar de asignación", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  const bea = await createGerente(db, { nombre: "Bea", telefono: null });
  const otra = await createAsignacion(db, { campanaId: s.campanaId, gerenteId: bea, saldoUsd: "50" });
  await updateDeposito(db, id, depositoBase(s.tasaId), { actualizadoEn: "2026-03-05T00:00:00.000Z", asignacionId: otra });
  expect(await getDeposito(db, id)).toMatchObject({ asignacionId: otra, actualizadoEn: "2026-03-05T00:00:00.000Z" });
  const c2 = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const cerrada = await createAsignacion(db, { campanaId: c2, gerenteId: bea, saldoUsd: "50" });
  await setEstadoCampana(db, c2, "cerrada");
  await expect(updateDeposito(db, id, depositoBase(s.tasaId), { actualizadoEn: "2026-03-06T00:00:00.000Z", asignacionId: cerrada })).rejects.toMatchObject({
    code: "CAMPANA_CERRADA",
  });
});
