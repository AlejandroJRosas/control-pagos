import { expect, it } from "vitest";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito, deleteDeposito } from "../repos/depositos";
import { createAsignacion } from "../repos/asignaciones";
import { createCampana } from "../repos/campanas";
import { marcarIntercambio, setEquivalencia } from "../repos/consolidacion";
import { cargarEnvio } from "./envioConsolidar";

it("cargarEnvio arma asignaciones, depósitos con su tasa y eliminaciones de la campaña", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const a = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "111", imagenPath: "imagenes/a.png" }));
  const b = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "222" }));
  await deleteDeposito(db, b);
  const abril = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const asigAbril = await createAsignacion(db, { campanaId: abril, gerenteId: s.anaId, saldoUsd: "50" });
  await createDeposito(db, asigAbril, depositoBase(s.tasaId, { referencia: "333" }));
  await marcarIntercambio(db, [s.asignacionId], "envio", "2026-03-10T10:00:00.000Z");
  await setEquivalencia(db, "depositos", "remoto-2", a);
  await setEquivalencia(db, "depositos", "remoto-1", a);

  const d = await cargarEnvio(db, s.campanaId);
  expect(d.campana).toMatchObject({ id: s.campanaId, nombre: "Marzo" });
  expect(d.asignaciones).toHaveLength(1);
  expect(d.asignaciones[0]).toMatchObject({ id: s.asignacionId, gerenteId: s.anaId, gerenteNombre: "Ana", saldoUsd: "100", ultimoEnvio: "2026-03-10T10:00:00.000Z" });
  expect(d.depositos).toHaveLength(1);
  expect(d.depositos[0]).toMatchObject({
    asignacionId: s.asignacionId, referencia: "111", tasaFecha: "2026-03-02", tasaValor: "36.5", imagenPath: "imagenes/a.png",
  });
  expect(d.depositos[0].asignacionUuid).toBe(d.asignaciones[0].uuid);
  expect(Object.keys(d.depositos[0]).sort()).toEqual(
    [
      "actualizadoEn", "asignacionId", "asignacionUuid", "banco", "creadoEn", "cuentaDestino", "equivalentes", "fecha", "imagenPath", "montoBs", "observaciones",
      "referencia", "tasaFecha", "tasaValor", "uuid",
    ],
  );
  expect(d.depositos[0].equivalentes).toEqual(["remoto-1", "remoto-2"]);
  expect(a).toBeGreaterThan(0);
  expect(d.eliminaciones).toHaveLength(1);
  expect(d.eliminaciones[0].asignacionUuid).toBe(d.asignaciones[0].uuid);
});
