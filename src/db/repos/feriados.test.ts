import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createFeriado, deleteFeriado, feriadosSet, listFeriados, precargarFeriados } from "./feriados";
import { createTasa, getTasaParaFecha } from "./tasas";
import { createDeposito } from "./depositos";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db); // tasa 2026-03-02 (lunes)
});

it("precargarFeriados carga el año actual y el siguiente, omitiendo fechas con tasa propia", async () => {
  await createTasa(db, { fecha: "2026-10-12", valor: "40", notas: null, imagenPath: null });
  const n = await precargarFeriados(db, "2026-10-19");
  const f = (await listFeriados(db)).map((x) => x.fecha);
  expect(f).not.toContain("2026-10-12");
  expect(f).toContain("2026-12-25");
  expect(f).toContain("2027-01-01");
  expect(n).toBe(22); // 14 + 14, sin los que caen en fin de semana (2 en 2026, 3 en 2027) ni el 12/10/2026
  expect((await listFeriados(db)).find((x) => x.fecha === "2026-12-25")?.nombre).toBe("Navidad");
});

it("precarga una sola vez por año aunque se borre uno", async () => {
  await precargarFeriados(db, "2026-10-19");
  await deleteFeriado(db, "2026-12-24");
  expect(await precargarFeriados(db, "2026-10-19")).toBe(0);
  expect(await feriadosSet(db)).not.toContain("2026-12-24");
});

it("createFeriado guarda y rechaza duplicados, fines de semana y días con tasa", async () => {
  await createFeriado(db, { fecha: "2026-03-03", nombre: "Bancario" });
  expect(await listFeriados(db)).toEqual([{ fecha: "2026-03-03", nombre: "Bancario" }]);
  await expect(createFeriado(db, { fecha: "2026-03-03", nombre: null })).rejects.toMatchObject({ code: "DUPLICADO" });
  await expect(createFeriado(db, { fecha: "2026-03-07", nombre: null })).rejects.toThrow(/sábados y domingos/);
  await expect(createFeriado(db, { fecha: "2026-03-02", nombre: null })).rejects.toThrow(/ya tiene tasa/);
});

it("deleteFeriado rechaza si hay depósitos de ese día", async () => {
  await createFeriado(db, { fecha: "2026-03-03", nombre: null });
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { fecha: "2026-03-03" }));
  await expect(deleteFeriado(db, "2026-03-03")).rejects.toThrow(/1 depósito\(s\) de ese día que usan la tasa del 02\/03\/2026/);
});

it("createTasa rechaza un feriado", async () => {
  await createFeriado(db, { fecha: "2026-03-03", nombre: null });
  await expect(createTasa(db, { fecha: "2026-03-03", valor: "37", notas: null, imagenPath: null })).rejects.toThrow(
    "El 03/03/2026 es feriado: usa la tasa del 02/03/2026",
  );
});

it("getTasaParaFecha de un feriado da la del día hábil anterior", async () => {
  await createFeriado(db, { fecha: "2026-03-03", nombre: null });
  expect((await getTasaParaFecha(db, "2026-03-03"))?.id).toBe(s.tasaId);
  expect(await getTasaParaFecha(db, "2026-03-04")).toBeNull();
});

it("un depósito del feriado se guarda con la tasa del día hábil anterior", async () => {
  await createFeriado(db, { fecha: "2026-03-03", nombre: null });
  await expect(createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { fecha: "2026-03-03" }))).resolves.toBeGreaterThan(0);
  await expect(createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { fecha: "2026-03-04", referencia: "9" }))).rejects.toThrow(/La tasa es del/);
});
