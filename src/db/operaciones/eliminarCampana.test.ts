import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createCampana, getCampana, setEstadoCampana } from "../repos/campanas";
import { createAsignacion } from "../repos/asignaciones";
import { createDeposito } from "../repos/depositos";
import { borradorDepositoVacio, encolarDeposito } from "../repos/cola";
import { eliminarCampana, resumenEliminacion } from "./eliminarCampana";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
});

const contar = async (tabla: string) => (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tabla}`))[0].n;
const encolar = (campanaId: number) =>
  encolarDeposito(db, campanaId, { imagenPath: "x.png", nombreArchivo: null, borrador: borradorDepositoVacio() });

it("resume lo que se va a borrar", async () => {
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "456" }));
  await encolar(s.campanaId);
  expect(await resumenEliminacion(db, s.campanaId)).toEqual({ gerentes: 1, depositos: 2, pendientes: 1 });
});

it("borra la campaña con sus asignaciones, depósitos y cola; conserva gerentes, tasas y otras campañas", async () => {
  const otra = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const asigOtra = await createAsignacion(db, { campanaId: otra, gerenteId: s.anaId, saldoUsd: "50" });
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  await createDeposito(db, asigOtra, depositoBase(s.tasaId, { referencia: "999" }));
  await encolar(s.campanaId);
  await encolar(otra);

  await eliminarCampana(db, s.campanaId);

  expect(await getCampana(db, s.campanaId)).toBeNull();
  expect(await getCampana(db, otra)).not.toBeNull();
  expect(await contar("asignaciones")).toBe(1);
  expect(await contar("depositos")).toBe(1);
  expect(await contar("cola_depositos")).toBe(1);
  expect(await contar("gerentes")).toBe(1);
  expect(await contar("tasas")).toBe(1);
});

it("no borra una campaña cerrada ni una inexistente", async () => {
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await expect(eliminarCampana(db, s.campanaId)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  expect(await getCampana(db, s.campanaId)).not.toBeNull();
  await expect(eliminarCampana(db, 999)).rejects.toMatchObject({ code: "NO_ENCONTRADO" });
});
