import { expect, it } from "vitest";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito } from "../repos/depositos";
import { createAsignacion } from "../repos/asignaciones";
import { createCampana } from "../repos/campanas";
import { loadDuplicadosCampana } from "./duplicados";

const ids = (g: { id: number }[][]) => g.map((x) => x.map((y) => y.id));

it("trae los grupos que tocan la campaña, aunque el otro depósito esté en otra", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db); // Ana en Marzo
  const a = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "123" }));
  const b = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "0123", banco: "banesco" }));
  const c = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "777" }));
  const abril = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const asigAbril = await createAsignacion(db, { campanaId: abril, gerenteId: s.anaId, saldoUsd: "50" });
  const d = await createDeposito(db, asigAbril, depositoBase(s.tasaId, { referencia: "777" }));
  const e = await createDeposito(db, asigAbril, depositoBase(s.tasaId, { referencia: "999" }));
  const f = await createDeposito(db, asigAbril, depositoBase(s.tasaId, { referencia: "999" }));

  const marzo = await loadDuplicadosCampana(db, s.campanaId);
  expect(ids(marzo)).toEqual([
    [a, b],
    [c, d],
  ]);
  expect(marzo[1][1]).toMatchObject({ campanaId: abril, campanaNombre: "Abril", gerenteNombre: "Ana", montoBs: "3650", tasaValor: "36.5", campanaEstado: "activa" });
  expect(ids(await loadDuplicadosCampana(db, abril))).toEqual([
    [c, d],
    [e, f],
  ]);
});
