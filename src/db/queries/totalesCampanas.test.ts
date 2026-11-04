import { expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createCampana, setEstadoCampana } from "../repos/campanas";
import { createAsignacion } from "../repos/asignaciones";
import { createGerente } from "../repos/gerentes";
import { createDeposito } from "../repos/depositos";
import { loadCampanaData } from "./campanaData";
import { loadTotalesCampanas } from "./totalesCampanas";
import { buildCampanaView } from "@/domain/campanaView";

/** Cuenta las consultas que pasan por el driver. */
function contando(db: SqlDriver) {
  let n = 0;
  const envuelto: SqlDriver = { ...db, select: (sql, p) => (n++, db.select(sql, p)), execute: (sql, p) => db.execute(sql, p) };
  return { db: envuelto, consultas: () => n };
}

it("da los mismos totales que la vista de cada campaña, con pocas consultas aunque haya muchas campañas", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { montoBs: "1825", referencia: "1" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { montoBs: "100", referencia: "2" }));
  const ids = [s.campanaId];
  for (let i = 0; i < 5; i++) {
    const c = await createCampana(db, { nombre: `C${i}`, fechaInicio: `2026-0${i + 4}-01`, fechaFin: null, notas: null });
    const g = await createGerente(db, { nombre: `G${i}`, telefono: null });
    const a = await createAsignacion(db, { campanaId: c, gerenteId: g, saldoUsd: "50" });
    if (i % 2) await createDeposito(db, a, depositoBase(s.tasaId, { montoBs: "365", referencia: `x${i}` }));
    if (i === 4) await setEstadoCampana(db, c, "cerrada");
    ids.push(c);
  }
  const vacia = await createCampana(db, { nombre: "Vacía", fechaInicio: "2026-12-01", fechaFin: null, notas: null });
  ids.push(vacia);

  const { db: medido, consultas } = contando(db);
  const filas = await loadTotalesCampanas(medido);
  expect(consultas()).toBeLessThanOrEqual(3);

  expect(filas.map((f) => f.campana.id).sort()).toEqual([...ids].sort());
  for (const id of ids) {
    const d = await loadCampanaData(db, id);
    const fila = filas.find((f) => f.campana.id === id)!;
    expect(fila.total).toEqual(buildCampanaView(d.asignaciones, d.depositos).total);
    expect(fila.gerentes).toBe(d.asignaciones.length);
  }
});
