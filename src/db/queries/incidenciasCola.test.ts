import { expect, it } from "vitest";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito } from "../repos/depositos";
import { borradorDepositoVacio, encolarDeposito, listColaDepositos, type BorradorDeposito } from "../repos/cola";
import { contextoIncidencias } from "./incidenciasCola";

const borrador = (sel: string, draft: Partial<BorradorDeposito["draft"]>): BorradorDeposito => {
  const b = borradorDepositoVacio(sel);
  return { ...b, draft: { ...b.draft, fecha: "2026-03-02", banco: "Banesco", referencia: "77", cuentaDestino: "0102", montoBs: "3.650", ...draft } };
};

async function encolar(db: Awaited<ReturnType<typeof createTestDb>>, campanaId: number, b: BorradorDeposito) {
  return encolarDeposito(db, campanaId, { imagenPath: "imagenes/x.png", nombreArchivo: null, borrador: b });
}

it("marca el duplicado contra lo registrado", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "77" }));
  const dup = await encolar(db, s.campanaId, borrador(`a:${s.asignacionId}`, { referencia: "77" }));
  const otro = await encolar(db, s.campanaId, borrador(`a:${s.asignacionId}`, { referencia: "88" }));
  const ctx = await contextoIncidencias(db, await listColaDepositos(db, s.campanaId));
  expect(ctx.get(dup)).toEqual({ duplicado: true, posibleRepetido: false, faltaTasa: false });
  expect(ctx.get(otro)).toEqual({ duplicado: false, posibleRepetido: false, faltaTasa: false });
});

it("marca el duplicado entre dos pendientes de la cola", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const a = await encolar(db, s.campanaId, borrador(`a:${s.asignacionId}`, { referencia: "5" }));
  const b = await encolar(db, s.campanaId, borrador(`a:${s.asignacionId}`, { referencia: "05" }));
  const ctx = await contextoIncidencias(db, await listColaDepositos(db, s.campanaId));
  expect(ctx.get(a)?.duplicado).toBe(true);
  expect(ctx.get(b)?.duplicado).toBe(true);
});

it("dos pendientes del Provincial iguales son posibles repetidos; con uno registrado también", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const prov = { banco: "Provincial", referencia: "V-12.345.678" };
  const a = await encolar(db, s.campanaId, borrador(`a:${s.asignacionId}`, prov));
  const b = await encolar(db, s.campanaId, borrador(`a:${s.asignacionId}`, { ...prov, referencia: "12345678" }));
  const c = await encolar(db, s.campanaId, borrador(`a:${s.asignacionId}`, { ...prov, referencia: "999" }));
  let ctx = await contextoIncidencias(db, await listColaDepositos(db, s.campanaId));
  expect(ctx.get(a)).toMatchObject({ posibleRepetido: true, duplicado: false });
  expect(ctx.get(b)?.posibleRepetido).toBe(true);
  expect(ctx.get(c)?.posibleRepetido).toBe(false);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { ...prov, referencia: "999", montoBs: "3650" }));
  ctx = await contextoIncidencias(db, await listColaDepositos(db, s.campanaId));
  expect(ctx.get(c)?.posibleRepetido).toBe(true);
});

it("falta la tasa cuando no hay una en la fecha que rige", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db); // tasa del lunes 02/03/2026
  const sabadoConTasa = await encolar(db, s.campanaId, borrador(`a:${s.asignacionId}`, { fecha: "2026-02-28", referencia: "0" }));
  const sabado = await encolar(db, s.campanaId, borrador(`a:${s.asignacionId}`, { fecha: "2026-03-07", referencia: "1" }));
  const lunes = await encolar(db, s.campanaId, borrador(`a:${s.asignacionId}`, { fecha: "2026-03-02", referencia: "2" }));
  const martes = await encolar(db, s.campanaId, borrador(`a:${s.asignacionId}`, { fecha: "2026-03-03", referencia: "3" }));
  const ctx = await contextoIncidencias(db, await listColaDepositos(db, s.campanaId));
  expect(ctx.get(sabadoConTasa)?.faltaTasa).toBe(false); // el sábado 28/02 usa la del lunes 02/03
  expect(ctx.get(sabado)?.faltaTasa).toBe(true); // el sábado 07/03 usaría la del lunes 09/03
  expect(ctx.get(lunes)?.faltaTasa).toBe(false);
  expect(ctx.get(martes)?.faltaTasa).toBe(true);
});
