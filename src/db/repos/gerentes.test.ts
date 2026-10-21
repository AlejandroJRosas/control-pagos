import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { createGerente, getGerente, listGerentes, listGerentesConCampanas, setGerenteActivo, updateGerente } from "./gerentes";

let db: SqlDriver;
beforeEach(async () => {
  db = await createTestDb();
});

it("crea, lista ordenado y obtiene", async () => {
  const luis = await createGerente(db, { nombre: "luis", telefono: null });
  await createGerente(db, { nombre: "Ana", telefono: "0414-1234567" });
  expect((await listGerentes(db)).map((g) => g.nombre)).toEqual(["Ana", "luis"]);
  expect(await getGerente(db, luis)).toMatchObject({ id: luis, nombre: "luis", telefono: null, activo: true });
  expect(await getGerente(db, 999)).toBeNull();
});

it("actualiza y desactiva", async () => {
  const id = await createGerente(db, { nombre: "Ana", telefono: null });
  await updateGerente(db, id, { nombre: "Ana María", telefono: "0412" });
  await setGerenteActivo(db, id, false);
  expect(await getGerente(db, id)).toMatchObject({ nombre: "Ana María", telefono: "0412", activo: false });
  expect(await listGerentes(db, { soloActivos: true })).toEqual([]);
});

it("guarda, cambia y quita la fecha de nacimiento", async () => {
  const id = await createGerente(db, { nombre: "Ana", telefono: null, nacimiento: "1990-10-23" });
  expect(await getGerente(db, id)).toMatchObject({ nacimiento: "1990-10-23" });
  expect((await listGerentesConCampanas(db))[0]).toMatchObject({ nacimiento: "1990-10-23" });
  await updateGerente(db, id, { nombre: "Ana", telefono: null, nacimiento: "1991-01-02" });
  expect(await getGerente(db, id)).toMatchObject({ nacimiento: "1991-01-02" });
  await updateGerente(db, id, { nombre: "Ana", telefono: null, nacimiento: null });
  expect(await getGerente(db, id)).toMatchObject({ nacimiento: null });
  expect(await getGerente(db, await createGerente(db, { nombre: "Luis", telefono: null }))).toMatchObject({ nacimiento: null });
});

it("lista las campañas de cada gerente", async () => {
  const ana = await createGerente(db, { nombre: "Ana", telefono: null });
  await createGerente(db, { nombre: "Luis", telefono: null });
  await db.execute("INSERT INTO campanas (nombre, fecha_inicio, creado_en) VALUES ('Marzo, 2026', '2026-03-01', 'x'), ('Abril', '2026-04-01', 'x')");
  await db.execute("INSERT INTO asignaciones (campana_id, gerente_id, saldo_usd) VALUES (1, ?, '10'), (2, ?, '10')", [ana, ana]);
  const r = await listGerentesConCampanas(db);
  expect(r.find((g) => g.id === ana)?.campanas.sort()).toEqual(["Abril", "Marzo, 2026"]);
  expect(r.find((g) => g.nombre === "Luis")?.campanas).toEqual([]);
});
