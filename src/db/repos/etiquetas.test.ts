import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { createGerente, listGerentesConCampanas } from "./gerentes";
import { createEtiqueta, deleteEtiqueta, etiquetasDeGerente, listEtiquetas, setEtiquetasGerente, updateEtiqueta } from "./etiquetas";

let db: SqlDriver;
beforeEach(async () => {
  db = await createTestDb();
});

it("crea y lista ordenado por nombre, con cuántos gerentes la usan", async () => {
  const vip = await createEtiqueta(db, { nombre: "VIP", color: "amarillo" });
  await createEtiqueta(db, { nombre: "caracas", color: "azul" });
  const ana = await createGerente(db, { nombre: "Ana", telefono: null });
  await setEtiquetasGerente(db, ana, [vip]);
  expect(await listEtiquetas(db)).toEqual([
    { id: expect.any(Number), nombre: "caracas", color: "azul", gerentes: 0 },
    { id: vip, nombre: "VIP", color: "amarillo", gerentes: 1 },
  ]);
});

it("rechaza nombres repetidos sin distinguir mayúsculas, acentos ni espacios", async () => {
  const a = await createEtiqueta(db, { nombre: "Mérida", color: "verde" });
  await expect(createEtiqueta(db, { nombre: "me rida", color: "rojo" })).rejects.toMatchObject({ code: "DUPLICADO" });
  const b = await createEtiqueta(db, { nombre: "Zulia", color: "rojo" });
  await expect(updateEtiqueta(db, b, { nombre: "MERIDA", color: "rojo" })).rejects.toMatchObject({ code: "DUPLICADO" });
  await updateEtiqueta(db, a, { nombre: "Mérida Centro", color: "rosa" });
  expect((await listEtiquetas(db)).find((e) => e.id === a)).toMatchObject({ nombre: "Mérida Centro", color: "rosa" });
});

it("asigna, reemplaza y lista las etiquetas de un gerente", async () => {
  const x = await createEtiqueta(db, { nombre: "X", color: "gris" });
  const y = await createEtiqueta(db, { nombre: "Y", color: "gris" });
  const ana = await createGerente(db, { nombre: "Ana", telefono: null });
  await setEtiquetasGerente(db, ana, [x, y]);
  expect(await etiquetasDeGerente(db, ana)).toEqual([x, y]);
  await setEtiquetasGerente(db, ana, [y]);
  expect(await etiquetasDeGerente(db, ana)).toEqual([y]);
  const [g] = await listGerentesConCampanas(db);
  expect(g.etiquetas).toEqual([y]);
});

it("eliminar una etiqueta la quita de los gerentes", async () => {
  const x = await createEtiqueta(db, { nombre: "X", color: "gris" });
  const ana = await createGerente(db, { nombre: "Ana", telefono: null });
  await setEtiquetasGerente(db, ana, [x]);
  await deleteEtiqueta(db, x);
  expect(await listEtiquetas(db)).toEqual([]);
  expect(await etiquetasDeGerente(db, ana)).toEqual([]);
});

it("pone uuid y actualizado_en", async () => {
  await createEtiqueta(db, { nombre: "X", color: "gris" });
  const [r] = await db.select<{ uuid: string; actualizado_en: string }>("SELECT uuid, actualizado_en FROM etiquetas");
  expect(r.uuid).toMatch(/^[0-9a-f-]{36}$/);
  expect(r.actualizado_en).toBeTruthy();
});
