import { expect, it } from "vitest";
import { createTestDb } from "../testing/sqljsDriver";
import { createTasa, getTasa, getTasaByFecha } from "../repos/tasas";
import { deshacerImportarTasas, importarTasas } from "./importarTasas";

it("crea las nuevas con su captura y actualiza las elegidas; Deshacer lo revierte", async () => {
  const db = await createTestDb();
  const id = await createTasa(db, { fecha: "2026-11-02", valor: "219.45", notas: "ojo", imagenPath: "imagenes/vieja.png" });
  const h = await importarTasas(
    db,
    [
      { tipo: "nueva", fecha: "2026-11-03", valor: "220", notas: null, imagen: "n.png" },
      { tipo: "actualizar", id, fecha: "2026-11-02", valor: "219.5", notas: "ojo", imagen: "nueva.png", imagenPath: "imagenes/vieja.png" },
    ],
    new Map([
      ["n.png", "imagenes/local-n.png"],
      ["nueva.png", "imagenes/local-nueva.png"],
    ]),
  );
  expect(await getTasaByFecha(db, "2026-11-03")).toMatchObject({ valor: "220", imagenPath: "imagenes/local-n.png" });
  expect(await getTasa(db, id)).toMatchObject({ valor: "219.5", notas: "ojo", imagenPath: "imagenes/local-nueva.png" });

  await deshacerImportarTasas(db, h);
  expect(await getTasaByFecha(db, "2026-11-03")).toBeNull();
  expect(await getTasa(db, id)).toMatchObject({ valor: "219.45", notas: "ojo", imagenPath: "imagenes/vieja.png" });
});

it("una captura que no llegó deja la que tenía; si una falla no queda nada", async () => {
  const db = await createTestDb();
  const id = await createTasa(db, { fecha: "2026-11-02", valor: "219", notas: null, imagenPath: "imagenes/mia.png" });
  await importarTasas(db, [{ tipo: "actualizar", id, fecha: "2026-11-02", valor: "218", notas: null, imagen: "falta.png", imagenPath: "imagenes/mia.png" }], new Map());
  expect((await getTasa(db, id))?.imagenPath).toBe("imagenes/mia.png");

  await expect(
    importarTasas(
      db,
      [
        { tipo: "actualizar", id, fecha: "2026-11-02", valor: "300", notas: null, imagen: null, imagenPath: null },
        { tipo: "nueva", fecha: "2026-11-03", valor: "220", notas: null, imagen: null },
        // Sábado: createTasa la rechaza.
        { tipo: "nueva", fecha: "2026-11-07", valor: "221", notas: null, imagen: null },
      ],
      new Map(),
    ),
  ).rejects.toThrow();
  expect((await getTasa(db, id))?.valor).toBe("218");
  expect(await getTasaByFecha(db, "2026-11-03")).toBeNull();
});
