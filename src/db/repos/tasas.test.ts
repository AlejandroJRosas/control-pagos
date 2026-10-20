import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { countUsosTasa, createTasa, deleteTasa, getTasa, getTasaByFecha, getTasaParaFecha, listTasas, updateTasa } from "./tasas";
import { createDeposito } from "./depositos";

let db: SqlDriver;
beforeEach(async () => {
  db = await createTestDb();
});

it("crea, busca por fecha y lista con usos en orden descendente", async () => {
  const a = await createTasa(db, { fecha: "2026-02-27", valor: "36.5", notas: null, imagenPath: null });
  await createTasa(db, { fecha: "2026-03-03", valor: "37", notas: "BCV", imagenPath: "imagenes/x.png" });
  expect(await getTasaByFecha(db, "2026-02-27")).toEqual({ id: a, fecha: "2026-02-27", valor: "36.5", imagenPath: null, notas: null });
  expect(await getTasaByFecha(db, "2026-03-02")).toBeNull();
  expect((await listTasas(db)).map((t) => [t.fecha, t.usos])).toEqual([
    ["2026-03-03", 0],
    ["2026-02-27", 0],
  ]);
});

it("rechaza una segunda tasa para la misma fecha", async () => {
  await createTasa(db, { fecha: "2026-02-27", valor: "36.5", notas: null, imagenPath: null });
  await expect(createTasa(db, { fecha: "2026-02-27", valor: "40", notas: null, imagenPath: null })).rejects.toMatchObject({ code: "DUPLICADO" });
});

it("actualiza valor, notas e imagen", async () => {
  const id = await createTasa(db, { fecha: "2026-02-27", valor: "36.5", notas: null, imagenPath: null });
  await updateTasa(db, id, { valor: "36.75", notas: "corregida", imagenPath: "imagenes/t.png" });
  expect(await getTasa(db, id)).toMatchObject({ valor: "36.75", notas: "corregida", imagenPath: "imagenes/t.png", fecha: "2026-02-27" });
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

it("sábado y domingo no llevan tasa propia: usan la del lunes", async () => {
  await expect(createTasa(db, { fecha: "2026-10-17", valor: "40", notas: null, imagenPath: null })).rejects.toMatchObject({ code: "VALIDACION" });
  expect(await getTasaParaFecha(db, "2026-10-18")).toBeNull();
  const lunes = await createTasa(db, { fecha: "2026-10-19", valor: "40", notas: null, imagenPath: null });
  expect((await getTasaParaFecha(db, "2026-10-17"))?.id).toBe(lunes);
  expect((await getTasaParaFecha(db, "2026-10-18"))?.id).toBe(lunes);
  expect((await getTasaParaFecha(db, "2026-10-19"))?.id).toBe(lunes);
  expect(await getTasaParaFecha(db, "2026-10-16")).toBeNull();
});

it("una tasa de fin de semana registrada antes sigue teniendo prioridad", async () => {
  await createTasa(db, { fecha: "2026-10-19", valor: "40", notas: null, imagenPath: null });
  await db.execute("INSERT INTO tasas (fecha, valor) VALUES ('2026-10-17', '41')");
  expect((await getTasaParaFecha(db, "2026-10-17"))?.valor).toBe("41");
  expect((await getTasaParaFecha(db, "2026-10-18"))?.valor).toBe("40");
});
