import { expect, it } from "vitest";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito } from "../repos/depositos";
import { createGerente } from "../repos/gerentes";
import { createAsignacion } from "../repos/asignaciones";
import { createCampana, setEstadoCampana } from "../repos/campanas";
import { loadGerenteData } from "./gerenteData";
import { buildCampanaView } from "@/domain/campanaView";

it("carga las campañas del gerente con sus depósitos", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db); // Ana en Marzo
  const luis = await createGerente(db, { nombre: "Luis", telefono: null });
  const asigLuis = await createAsignacion(db, { campanaId: s.campanaId, gerenteId: luis, saldoUsd: "50" });
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId)); // 100 USD de Ana
  await createDeposito(db, asigLuis, depositoBase(s.tasaId, { referencia: "9", montoBs: "730" })); // 20 USD de Luis

  const abril = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const asigAbril = await createAsignacion(db, { campanaId: abril, gerenteId: luis, saldoUsd: "100" });
  await createDeposito(db, asigAbril, depositoBase(s.tasaId, { referencia: "X", montoBs: "365" })); // 10 USD
  await setEstadoCampana(db, abril, "cerrada");

  const data = await loadGerenteData(db, luis);
  expect(data.gerente.nombre).toBe("Luis");
  // Campañas más recientes primero.
  expect(data.campanas.map((c) => [c.asignacionId, c.campanaNombre, c.campanaEstado])).toEqual([
    [asigAbril, "Abril", "cerrada"],
    [asigLuis, "Marzo", "activa"],
  ]);
  expect(data.depositos).toHaveLength(2);

  const view = buildCampanaView(data.asignaciones, data.depositos);
  expect(view.gerentes.find((g) => g.asignacionId === asigAbril)).toMatchObject({ pagado: "10.00", restante: "90.00" });
  expect(view.gerentes.find((g) => g.asignacionId === asigLuis)).toMatchObject({ pagado: "20.00", restante: "30.00" });
  expect(view.total).toMatchObject({ asignado: "150.00", pagado: "30.00", restante: "120.00" });
});

it("un gerente sin campañas da listas vacías", async () => {
  const db = await createTestDb();
  const id = await createGerente(db, { nombre: "Ana", telefono: null });
  expect(await loadGerenteData(db, id)).toMatchObject({ campanas: [], asignaciones: [], depositos: [] });
});

it("lanza NO_ENCONTRADO para un gerente inexistente", async () => {
  const db = await createTestDb();
  await expect(loadGerenteData(db, 42)).rejects.toMatchObject({ code: "NO_ENCONTRADO" });
});
