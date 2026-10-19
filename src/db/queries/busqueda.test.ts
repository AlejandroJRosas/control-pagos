import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createCampana } from "../repos/campanas";
import { createGerente } from "../repos/gerentes";
import { createAsignacion } from "../repos/asignaciones";
import { createDeposito } from "../repos/depositos";
import { buscarGlobal } from "./busqueda";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
});

it("encuentra depósitos de cualquier campaña por referencia o monto, con su gerente, campaña y USD", async () => {
  const abril = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const luis = await createGerente(db, { nombre: "Luis Pérez", telefono: "0414-1234567" });
  const asig = await createAsignacion(db, { campanaId: abril, gerenteId: luis, saldoUsd: "50" });
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "000555" }));
  const id = await createDeposito(db, asig, depositoBase(s.tasaId, { referencia: "778899", montoBs: "1234567.5" }));

  const r = await buscarGlobal(db, "7788");
  expect(r.depositos).toEqual([
    expect.objectContaining({
      id,
      referencia: "778899",
      gerenteNombre: "Luis Pérez",
      campanaId: abril,
      campanaNombre: "Abril",
      asignacionId: asig,
      usd: "33823.77",
    }),
  ]);
  expect((await buscarGlobal(db, "1.234.567")).depositos.map((d) => d.id)).toEqual([id]);
});

it("encuentra campañas y gerentes por nombre sin acentos, y gerentes por teléfono", async () => {
  await createGerente(db, { nombre: "Luis Pérez", telefono: "0414-1234567" });
  const r = await buscarGlobal(db, "perez");
  expect(r.gerentes.map((g) => g.nombre)).toEqual(["Luis Pérez"]);
  expect((await buscarGlobal(db, "0414")).gerentes.map((g) => g.nombre)).toEqual(["Luis Pérez"]);
  expect((await buscarGlobal(db, "MARZ")).campanas.map((c) => c.id)).toEqual([s.campanaId]);
});

it("sin texto no devuelve nada y limita la cantidad de depósitos", async () => {
  for (let i = 0; i < 30; i++) await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: `99${i}` }));
  expect(await buscarGlobal(db, "  ")).toEqual({ campanas: [], gerentes: [], depositos: [] });
  expect((await buscarGlobal(db, "99")).depositos).toHaveLength(20);
});
