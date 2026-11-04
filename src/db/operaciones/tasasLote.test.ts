import { expect, it } from "vitest";
import { createTestDb } from "../testing/sqljsDriver";
import { createTasa, getTasa, getTasaByFecha } from "../repos/tasas";
import { deshacerTasasLote, guardarTasasLote } from "./tasasLote";

it("crea y corrige tasas; las notas y la captura de la corregida quedan; Deshacer lo revierte", async () => {
  const db = await createTestDb();
  const id = await createTasa(db, { fecha: "2026-11-02", valor: "219.45", notas: "ojo", imagenPath: "imagenes/t.png" });
  const h = await guardarTasasLote(db, [
    { tipo: "nueva", fecha: "2026-10-30", valor: "218" },
    { tipo: "corregir", fecha: "2026-11-02", valor: "220.1", id, antes: "219.45", usos: 0 },
  ]);
  expect((await getTasaByFecha(db, "2026-10-30"))?.valor).toBe("218");
  expect(await getTasa(db, id)).toMatchObject({ valor: "220.1", notas: "ojo", imagenPath: "imagenes/t.png" });

  await deshacerTasasLote(db, h);
  expect(await getTasaByFecha(db, "2026-10-30")).toBeNull();
  expect((await getTasa(db, id))?.valor).toBe("219.45");
});

it("si una falla no queda nada", async () => {
  const db = await createTestDb();
  const id = await createTasa(db, { fecha: "2026-11-02", valor: "219.45", notas: null, imagenPath: null });
  await createTasa(db, { fecha: "2026-11-04", valor: "221", notas: null, imagenPath: null });
  await expect(
    guardarTasasLote(db, [
      { tipo: "corregir", fecha: "2026-11-02", valor: "220", id, antes: "219.45", usos: 0 },
      { tipo: "nueva", fecha: "2026-11-03", valor: "220.5" },
      // Ya existe: createTasa la rechaza.
      { tipo: "nueva", fecha: "2026-11-04", valor: "222" },
    ]),
  ).rejects.toThrow(/Ya existe una tasa/);
  expect((await getTasa(db, id))?.valor).toBe("219.45");
  expect(await getTasaByFecha(db, "2026-11-03")).toBeNull();
  expect((await getTasaByFecha(db, "2026-11-04"))?.valor).toBe("221");
});
