import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { seedBasico } from "../testing/fixtures";
import { setEstadoCampana } from "../repos/campanas";
import { createGerente } from "../repos/gerentes";
import { agregarGerentes } from "./agregarGerentes";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
});

const asignaciones = () =>
  db.select<{ gerenteId: number; saldoUsd: string }>(
    "SELECT gerente_id AS gerenteId, saldo_usd AS saldoUsd FROM asignaciones WHERE campana_id = ? ORDER BY id",
    [s.campanaId],
  );

it("agrega varios gerentes con su saldo", async () => {
  const beto = await createGerente(db, { nombre: "Beto", telefono: null });
  const caro = await createGerente(db, { nombre: "Caro", telefono: null });
  const ids = await agregarGerentes(db, s.campanaId, [
    { gerenteId: beto, saldoUsd: "100" },
    { gerenteId: caro, saldoUsd: "250.5" },
  ]);
  expect(ids).toHaveLength(2);
  expect((await asignaciones()).slice(1)).toEqual([
    { gerenteId: beto, saldoUsd: "100" },
    { gerenteId: caro, saldoUsd: "250.5" },
  ]);
});

it("si uno falla no deja ninguno agregado", async () => {
  const beto = await createGerente(db, { nombre: "Beto", telefono: null });
  const ana = (await asignaciones())[0].gerenteId;
  await expect(
    agregarGerentes(db, s.campanaId, [
      { gerenteId: beto, saldoUsd: "100" },
      { gerenteId: ana, saldoUsd: "5" },
    ]),
  ).rejects.toMatchObject({ code: "DUPLICADO" });
  expect(await asignaciones()).toHaveLength(1);
});

it("rechaza el mismo gerente dos veces en la lista", async () => {
  const beto = await createGerente(db, { nombre: "Beto", telefono: null });
  await expect(
    agregarGerentes(db, s.campanaId, [
      { gerenteId: beto, saldoUsd: "1" },
      { gerenteId: beto, saldoUsd: "2" },
    ]),
  ).rejects.toMatchObject({ code: "DUPLICADO" });
  expect(await asignaciones()).toHaveLength(1);
});

it("rechaza una campaña cerrada y una lista vacía", async () => {
  const beto = await createGerente(db, { nombre: "Beto", telefono: null });
  await expect(agregarGerentes(db, s.campanaId, [])).rejects.toMatchObject({ code: "VALIDACION" });
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await expect(agregarGerentes(db, s.campanaId, [{ gerenteId: beto, saldoUsd: "1" }])).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});
