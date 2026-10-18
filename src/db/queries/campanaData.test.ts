import { expect, it } from "vitest";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito } from "../repos/depositos";
import { createGerente } from "../repos/gerentes";
import { createAsignacion } from "../repos/asignaciones";
import { createCampana } from "../repos/campanas";
import { loadCampanaData } from "./campanaData";
import { buildCampanaView } from "@/domain/campanaView";

it("carga solo los datos de la campaña y alimenta buildCampanaView", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const luis = await createGerente(db, { nombre: "Luis", telefono: null });
  const asigLuis = await createAsignacion(db, { campanaId: s.campanaId, gerenteId: luis, saldoUsd: "50" });
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId)); // 100 USD
  await createDeposito(db, asigLuis, depositoBase(s.tasaId, { referencia: "9", montoBs: "730" })); // 20 USD

  const otra = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const asigOtra = await createAsignacion(db, { campanaId: otra, gerenteId: luis, saldoUsd: "999" });
  await createDeposito(db, asigOtra, depositoBase(s.tasaId, { referencia: "X" }));

  const data = await loadCampanaData(db, s.campanaId);
  expect(data.campana.nombre).toBe("Marzo");
  expect(data.asignaciones.map((a) => a.gerenteNombre)).toEqual(["Ana", "Luis"]);
  expect(data.depositos).toHaveLength(2);
  expect(data.depositos[0]).toMatchObject({ tasaValor: "36.5", cuentaDestino: "0102-0000-00-0000000000" });

  const view = buildCampanaView(data.asignaciones, data.depositos);
  expect(view.total).toMatchObject({ asignado: "150.00", pagado: "120.00", restante: "30.00" });
});

it("lanza NO_ENCONTRADO para una campaña inexistente", async () => {
  const db = await createTestDb();
  await expect(loadCampanaData(db, 42)).rejects.toMatchObject({ code: "NO_ENCONTRADO" });
});
