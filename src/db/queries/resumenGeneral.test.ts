import { expect, it } from "vitest";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito } from "../repos/depositos";
import { createGerente } from "../repos/gerentes";
import { createAsignacion } from "../repos/asignaciones";
import { createCampana, setEstadoCampana } from "../repos/campanas";
import { borradorDepositoVacio, encolarDeposito } from "../repos/cola";
import { loadResumenGeneral } from "./resumenGeneral";

it("carga solo las campañas activas con sus asignaciones, depósitos y cola pendiente", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db); // Ana en Marzo
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  await encolarDeposito(db, s.campanaId, { imagenPath: "a.png", nombreArchivo: null, borrador: borradorDepositoVacio() });

  const luis = await createGerente(db, { nombre: "Luis", telefono: null });
  const abril = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const asigAbril = await createAsignacion(db, { campanaId: abril, gerenteId: luis, saldoUsd: "50" });
  const cerrada = await createCampana(db, { nombre: "Enero", fechaInicio: "2026-01-01", fechaFin: null, notas: null });
  await createAsignacion(db, { campanaId: cerrada, gerenteId: luis, saldoUsd: "70" });
  await setEstadoCampana(db, cerrada, "cerrada");

  const r = await loadResumenGeneral(db);
  expect(r.map((c) => [c.campanaNombre, c.enCola, c.asignaciones.map((a) => a.id), c.depositos.length])).toEqual([
    ["Abril", 0, [asigAbril], 0],
    ["Marzo", 1, [s.asignacionId], 1],
  ]);
  expect(r[1].depositos[0]).toMatchObject({ asignacionId: s.asignacionId, montoBs: "3650", tasaValor: "36.5" });
});
