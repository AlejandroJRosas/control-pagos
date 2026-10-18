import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { assertCampanaActiva, createCampana, getCampana, listCampanas, setEstadoCampana, updateCampana } from "./campanas";

let db: SqlDriver;
beforeEach(async () => {
  db = await createTestDb();
});

const base = { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, notas: null };

it("crea, lista por fecha de inicio descendente y obtiene", async () => {
  const marzo = await createCampana(db, base);
  await createCampana(db, { ...base, nombre: "Abril", fechaInicio: "2026-04-01" });
  expect((await listCampanas(db)).map((c) => c.nombre)).toEqual(["Abril", "Marzo"]);
  expect(await getCampana(db, marzo)).toMatchObject({ nombre: "Marzo", estado: "activa", fechaFin: null });
});

it("actualiza y cambia de estado", async () => {
  const id = await createCampana(db, base);
  await updateCampana(db, id, { ...base, nombre: "Marzo 2026", fechaFin: "2026-03-31", notas: "n" });
  await setEstadoCampana(db, id, "cerrada");
  expect(await getCampana(db, id)).toMatchObject({ nombre: "Marzo 2026", fechaFin: "2026-03-31", notas: "n", estado: "cerrada" });
});

it("una campaña cerrada no se puede editar", async () => {
  const id = await createCampana(db, base);
  await setEstadoCampana(db, id, "cerrada");
  await expect(updateCampana(db, id, base)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  await expect(assertCampanaActiva(db, id)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  await expect(assertCampanaActiva(db, 999)).rejects.toMatchObject({ code: "NO_ENCONTRADO" });
});
