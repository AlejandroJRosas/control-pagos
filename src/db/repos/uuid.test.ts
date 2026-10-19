import { beforeEach, expect, it, vi } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito, deleteDeposito, getDeposito, restaurarDepositos, updateDeposito } from "./depositos";
import { updateGerente } from "./gerentes";
import { updateCampana } from "./campanas";
import { updateSaldoAsignacion } from "./asignaciones";
import { updateTasa } from "./tasas";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-02T10:00:00.000Z"));
  db = await createTestDb();
  s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
});

const fila = (tabla: string) => db.select<{ uuid: string; actualizado_en: string }>(`SELECT uuid, actualizado_en FROM ${tabla}`).then((r) => r[0]);

it("cada alta lleva uuid v4 y actualizado_en", async () => {
  for (const tabla of ["gerentes", "campanas", "asignaciones", "tasas", "depositos"]) {
    const r = await fila(tabla);
    expect(r.uuid).toMatch(UUID_V4);
    expect(r.actualizado_en).toBe("2026-03-02T10:00:00.000Z");
  }
});

it("cada modificación actualiza actualizado_en", async () => {
  vi.setSystemTime(new Date("2026-03-03T10:00:00.000Z"));
  await updateGerente(db, s.anaId, { nombre: "Ana M", telefono: null });
  await updateCampana(db, s.campanaId, { nombre: "Marzo 2", fechaInicio: "2026-03-01", fechaFin: null, notas: null });
  await updateSaldoAsignacion(db, s.asignacionId, "200");
  await updateTasa(db, s.tasaId, { valor: "37", notas: null, imagenPath: null });
  const [{ id }] = await db.select<{ id: number }>("SELECT id FROM depositos");
  await updateDeposito(db, id, depositoBase(s.tasaId, { montoBs: "1" }));
  for (const tabla of ["gerentes", "campanas", "asignaciones", "tasas", "depositos"]) {
    expect((await fila(tabla)).actualizado_en).toBe("2026-03-03T10:00:00.000Z");
  }
});

it("restaurar un depósito conserva su uuid", async () => {
  const [{ id }] = await db.select<{ id: number }>("SELECT id FROM depositos");
  const antes = await getDeposito(db, id);
  await restaurarDepositos(db, await deleteDeposito(db, id));
  expect((await getDeposito(db, id))?.uuid).toBe(antes?.uuid);
  expect(antes?.uuid).toMatch(UUID_V4);
});
