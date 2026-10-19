import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { createCampana, setEstadoCampana } from "./campanas";
import { createGerente } from "./gerentes";
import { createAsignacion, deleteAsignacion, getAsignacion, updateSaldoAsignacion } from "./asignaciones";

let db: SqlDriver;
let campanaId: number;
let anaId: number;
beforeEach(async () => {
  db = await createTestDb();
  campanaId = await createCampana(db, { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, notas: null });
  anaId = await createGerente(db, { nombre: "Ana", telefono: null });
});

it("crea y obtiene con detalle", async () => {
  const id = await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  expect(await getAsignacion(db, id)).toEqual({
    id,
    campanaId,
    gerenteId: anaId,
    saldoUsd: "100",
    gerenteNombre: "Ana",
    gerenteTelefono: null,
    campanaNombre: "Marzo",
    campanaEstado: "activa",
  });
});

it("no permite el mismo gerente dos veces en una campaña", async () => {
  await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  await expect(createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "5" })).rejects.toMatchObject({ code: "DUPLICADO" });
});

it("actualiza el saldo y rechaza cambios en una campaña cerrada", async () => {
  const id = await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  await updateSaldoAsignacion(db, id, "150.5");
  expect((await getAsignacion(db, id))?.saldoUsd).toBe("150.5");
  await setEstadoCampana(db, campanaId, "cerrada");
  await expect(updateSaldoAsignacion(db, id, "1")).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  const luis = await createGerente(db, { nombre: "Luis", telefono: null });
  await expect(createAsignacion(db, { campanaId, gerenteId: luis, saldoUsd: "1" })).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});

it("solo quita gerentes sin depósitos", async () => {
  const id = await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  await db.execute("INSERT INTO tasas (fecha, valor) VALUES ('2026-03-01', '36.5')");
  await db.execute(
    "INSERT INTO depositos (asignacion_id, tasa_id, fecha, banco, referencia, cuenta_destino, monto_bs, creado_en, actualizado_en) VALUES (?, 1, '2026-03-01', 'B', 'R', 'C', '10', 'x', 'x')",
    [id],
  );
  await expect(deleteAsignacion(db, id)).rejects.toMatchObject({ code: "VALIDACION" });
  await db.execute("DELETE FROM depositos");
  await deleteAsignacion(db, id);
  expect(await getAsignacion(db, id)).toBeNull();
});
