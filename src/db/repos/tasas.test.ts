import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { countUsosTasa, createTasa, deleteTasa, getTasa, getTasaByFecha, listTasas, updateTasa } from "./tasas";
import { createDeposito } from "./depositos";

let db: SqlDriver;
beforeEach(async () => {
  db = await createTestDb();
});

it("crea, busca por fecha y lista con usos en orden descendente", async () => {
  const a = await createTasa(db, { fecha: "2026-03-01", valor: "36.5", notas: null, imagenPath: null });
  await createTasa(db, { fecha: "2026-03-03", valor: "37", notas: "BCV", imagenPath: "imagenes/x.png" });
  expect(await getTasaByFecha(db, "2026-03-01")).toEqual({ id: a, fecha: "2026-03-01", valor: "36.5", imagenPath: null, notas: null });
  expect(await getTasaByFecha(db, "2026-03-02")).toBeNull();
  expect((await listTasas(db)).map((t) => [t.fecha, t.usos])).toEqual([
    ["2026-03-03", 0],
    ["2026-03-01", 0],
  ]);
});

it("rechaza una segunda tasa para la misma fecha", async () => {
  await createTasa(db, { fecha: "2026-03-01", valor: "36.5", notas: null, imagenPath: null });
  await expect(createTasa(db, { fecha: "2026-03-01", valor: "40", notas: null, imagenPath: null })).rejects.toMatchObject({ code: "DUPLICADO" });
});

it("actualiza valor, notas e imagen", async () => {
  const id = await createTasa(db, { fecha: "2026-03-01", valor: "36.5", notas: null, imagenPath: null });
  await updateTasa(db, id, { valor: "36.75", notas: "corregida", imagenPath: "imagenes/t.png" });
  expect(await getTasa(db, id)).toMatchObject({ valor: "36.75", notas: "corregida", imagenPath: "imagenes/t.png", fecha: "2026-03-01" });
});

it("no borra una tasa en uso", async () => {
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  expect(await countUsosTasa(db, s.tasaId)).toBe(1);
  await expect(deleteTasa(db, s.tasaId)).rejects.toMatchObject({ code: "TASA_EN_USO" });
  const libre = await createTasa(db, { fecha: "2026-03-09", valor: "1", notas: null, imagenPath: null });
  await deleteTasa(db, libre);
  expect(await getTasa(db, libre)).toBeNull();
});
