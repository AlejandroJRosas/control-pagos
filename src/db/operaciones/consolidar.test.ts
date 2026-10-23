import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito, deleteDeposito, getDeposito, updateDeposito } from "../repos/depositos";
import { createAsignacion, updateSaldoAsignacion } from "../repos/asignaciones";
import { createCampana, setEstadoCampana } from "../repos/campanas";
import { createGerente } from "../repos/gerentes";
import { createTasa, getTasaByFecha, updateTasa } from "../repos/tasas";
import { getEquivalencias, getIntercambios, marcarIntercambio } from "../repos/consolidacion";
import { cargarEnvio } from "../queries/envioConsolidar";
import { loadCampanaData } from "../queries/campanaData";
import { armarPaquete, type Paquete } from "@/domain/paquete";
import { clasificar, decisionesIniciales, motivoPendiente, type Decisiones, type GerenteEmparejado, type PlanConsolidacion } from "@/domain/consolidar";
import { buildCampanaView } from "@/domain/campanaView";
import { aplicarConsolidacion, cargarLocal, emparejamientoInicial, type Resultado } from "./consolidar";

type Seed = Awaited<ReturnType<typeof seedBasico>>;
type Instalacion = { db: SqlDriver; s: Seed };

const instalacion = async (): Promise<Instalacion> => {
  const db = await createTestDb();
  return { db, s: await seedBasico(db) };
};
const reloj = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  reloj("2026-03-05T10:00:00.000Z");
});
afterEach(() => vi.useRealTimers());

async function paqueteDe(o: Instalacion, opts: { soloCambios?: boolean; asignacionIds?: number[] } = {}): Promise<Paquete> {
  const datos = await cargarEnvio(o.db, o.s.campanaId);
  const sel = { asignacionIds: opts.asignacionIds ?? datos.asignaciones.map((a) => a.id), soloCambios: opts.soloCambios ?? false };
  return armarPaquete(datos, sel, { appVersion: "1.0.0", creadoEn: new Date().toISOString(), origen: "PC-ORIGEN" }).paquete;
}

async function planificar(destino: SqlDriver, p: Paquete): Promise<{ plan: PlanConsolidacion; gerentes: Record<string, GerenteEmparejado>; d: Decisiones }> {
  const e = await emparejamientoInicial(destino, p, null);
  const plan = clasificar(p, await cargarLocal(destino, e.campanaId as number), e.gerentes);
  return { plan, gerentes: e.gerentes, d: decisionesIniciales(plan) };
}

const importarImagen = async (nombre: string) => `imagenes/recibida-${nombre}`;

/** Envía el paquete del origen y lo aplica en el destino con las decisiones iniciales (o las que ajuste `decidir`). */
async function consolidar(
  origen: Instalacion,
  destino: SqlDriver,
  opts: { soloCambios?: boolean; ahora?: string; decidir?: (d: Decisiones, plan: PlanConsolidacion) => void } = {},
): Promise<{ plan: PlanConsolidacion; resultado: Resultado; p: Paquete }> {
  const p = await paqueteDe(origen, opts);
  const { plan, gerentes, d } = await planificar(destino, p);
  opts.decidir?.(d, plan);
  const resultado = await aplicarConsolidacion(destino, p, plan, gerentes, d, { importarImagen, ahora: opts.ahora ?? new Date().toISOString() });
  await marcarIntercambio(origen.db, [origen.s.asignacionId], "envio", new Date().toISOString());
  return { plan, resultado, p };
}

const tablas = ["depositos", "tasas", "asignaciones", "gerentes", "campanas", "eliminaciones", "equivalencias", "consolidaciones"];
async function volcado(db: SqlDriver): Promise<Record<string, unknown[]>> {
  const r: Record<string, unknown[]> = {};
  for (const t of tablas) r[t] = await db.select(`SELECT * FROM ${t} ORDER BY rowid`);
  return r;
}

describe("aplicarConsolidacion", () => {
  it("primer intercambio: entran los depósitos con su uuid y fechas, y se recuerdan campaña y gerente", async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111", imagenPath: "imagenes/a.png" }));
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "222", montoBs: "7300" }));

    reloj("2026-03-05T12:00:00.000Z");
    const { resultado, p } = await consolidar(origen, destino.db, { ahora: "2026-03-05T12:00:00.000Z" });

    expect(resultado).toEqual({ nuevos: 2, corregidos: 0, eliminados: 0, vinculados: 0, tasasCreadas: 0, tasasCambiadas: 0, saldosCambiados: 0 });
    const filas = await destino.db.select<{ uuid: string; creadoEn: string; actualizadoEn: string; imagenPath: string | null; asignacionId: number }>(
      "SELECT uuid, creado_en AS creadoEn, actualizado_en AS actualizadoEn, imagen_path AS imagenPath, asignacion_id AS asignacionId FROM depositos ORDER BY id",
    );
    expect(filas).toEqual(
      p.depositos.map((r) => ({
        uuid: r.uuid, creadoEn: r.creadoEn, actualizadoEn: r.actualizadoEn, imagenPath: r.imagen ? `imagenes/recibida-${r.imagen}` : null, asignacionId: destino.s.asignacionId,
      })),
    );
    expect((await getEquivalencias(destino.db, "gerentes")).get(p.asignaciones[0].gerente.uuid)).toBe(destino.s.anaId);
    expect((await getEquivalencias(destino.db, "campanas")).get(p.campana.uuid)).toBe(destino.s.campanaId);
    expect((await getIntercambios(destino.db, destino.s.campanaId)).get(destino.s.asignacionId)).toEqual({ envio: null, recibo: "2026-03-05T12:00:00.000Z" });

    const vista = async (i: Instalacion) => {
      const c = await loadCampanaData(i.db, i.s.campanaId);
      return buildCampanaView(c.asignaciones, c.depositos).total;
    };
    expect(await vista(destino)).toEqual(await vista(origen));

    const e = await emparejamientoInicial(destino.db, p, null);
    expect(e).toMatchObject({ campanaId: destino.s.campanaId, estadoCampana: "recordado" });
    expect(e.gerentes[p.asignaciones[0].uuid]).toEqual({ asignacionId: destino.s.asignacionId, estado: "recordado" });
  });

  it("aplicar el mismo paquete dos veces no cambia nada", async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111" }));
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "222" }));
    reloj("2026-03-05T12:00:00.000Z");
    const { p } = await consolidar(origen, destino.db);

    const { plan, gerentes, d } = await planificar(destino.db, p);
    expect(plan.sinCambios).toBe(2);
    for (const k of ["nuevos", "correcciones", "conflictos", "eliminaciones", "vinculos", "masNuevasAqui", "noIncluidos", "tasasNuevas", "tasasDistintas", "saldos"] as const) {
      expect(plan[k]).toEqual([]);
    }
    expect(motivoPendiente(plan, gerentes, d)).toBe("No hay nada nuevo para consolidar");
  });

  it("corrección de ida y vuelta: queda el monto nuevo con el actualizadoEn del origen", async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    const id = await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111" }));
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "222" }));
    reloj("2026-03-05T12:00:00.000Z");
    await consolidar(origen, destino.db);

    reloj("2026-03-06T10:00:00.000Z");
    await updateDeposito(origen.db, id, depositoBase(origen.s.tasaId, { referencia: "111", montoBs: "5000" }));
    reloj("2026-03-06T12:00:00.000Z");
    const { p, resultado } = await consolidar(origen, destino.db, { soloCambios: true });

    expect(p.depositos).toHaveLength(1);
    expect(resultado).toMatchObject({ nuevos: 0, corregidos: 1 });
    const [local] = await destino.db.select<{ montoBs: string; actualizadoEn: string }>(
      "SELECT monto_bs AS montoBs, actualizado_en AS actualizadoEn FROM depositos WHERE uuid = ?",
      [p.depositos[0].uuid],
    );
    expect(local).toEqual({ montoBs: "5000", actualizadoEn: "2026-03-06T10:00:00.000Z" });
  });

  it("eliminación confirmada: se borra y se registra en eliminaciones", async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    const id = await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111" }));
    reloj("2026-03-05T12:00:00.000Z");
    const primero = await consolidar(origen, destino.db);
    const uuid = primero.p.depositos[0].uuid;

    reloj("2026-03-06T10:00:00.000Z");
    await deleteDeposito(origen.db, id);
    reloj("2026-03-06T12:00:00.000Z");
    const { resultado } = await consolidar(origen, destino.db, { soloCambios: true });

    expect(resultado).toMatchObject({ eliminados: 1 });
    expect(await destino.db.select("SELECT id FROM depositos WHERE uuid = ?", [uuid])).toEqual([]);
    expect(await destino.db.select("SELECT uuid, campana_uuid AS c FROM eliminaciones")).toEqual([{ uuid, c: primero.plan.campana.uuid }]);
  });

  it("eliminación desmarcada no se aplica", async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    const id = await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111" }));
    reloj("2026-03-05T12:00:00.000Z");
    const primero = await consolidar(origen, destino.db);

    reloj("2026-03-06T10:00:00.000Z");
    await deleteDeposito(origen.db, id);
    reloj("2026-03-06T12:00:00.000Z");
    const { plan, resultado } = await consolidar(origen, destino.db, { soloCambios: true, decidir: (d) => d.eliminar.clear() });

    expect(plan.eliminaciones).toHaveLength(1);
    expect(resultado.eliminados).toBe(0);
    expect(await destino.db.select("SELECT id FROM depositos WHERE uuid = ?", [primero.p.depositos[0].uuid])).toHaveLength(1);
    expect(await destino.db.select("SELECT * FROM eliminaciones")).toEqual([]);
  });

  it("rechaza dos gerentes del archivo emparejados con la misma asignación, sin escribir nada", async () => {
    const origen = await instalacion();
    const luis = await createGerente(origen.db, { nombre: "Luis", telefono: null });
    const aLuis = await createAsignacion(origen.db, { campanaId: origen.s.campanaId, gerenteId: luis, saldoUsd: "10" });
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111" }));
    await createDeposito(origen.db, aLuis, depositoBase(origen.s.tasaId, { referencia: "222" }));
    const destino = await instalacion();
    const antes = await volcado(destino.db);

    const p = await paqueteDe(origen);
    const gerentes = Object.fromEntries(p.asignaciones.map((a) => [a.uuid, { asignacionId: destino.s.asignacionId, estado: "elegido" as const }]));
    const plan = clasificar(p, await cargarLocal(destino.db, destino.s.campanaId), gerentes);
    const deps = { importarImagen, ahora: "2026-03-05T12:00:00.000Z" };
    await expect(aplicarConsolidacion(destino.db, p, plan, gerentes, decisionesIniciales(plan), deps)).rejects.toThrow(
      "Ana y Luis no pueden ser el mismo gerente de tu campaña",
    );
    expect(await volcado(destino.db)).toEqual(antes);
  });

  it('tasa distinta con "archivo" cambia la tasa local; sin elegir no se aplica', async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    await updateTasa(origen.db, origen.s.tasaId, { valor: "37", notas: null, imagenPath: null });
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111" }));

    const p = await paqueteDe(origen);
    const { plan, gerentes, d } = await planificar(destino.db, p);
    expect(plan.tasasDistintas).toEqual([{ fecha: "2026-03-02", local: "36.5", archivo: "37", usos: 0 }]);
    const deps = { importarImagen, ahora: "2026-03-05T12:00:00.000Z" };
    await expect(aplicarConsolidacion(destino.db, p, plan, gerentes, d, deps)).rejects.toThrow("Elige la tasa del 02/03/2026");
    expect(await destino.db.select("SELECT * FROM depositos")).toEqual([]);

    d.tasas["2026-03-02"] = "archivo";
    const r = await aplicarConsolidacion(destino.db, p, plan, gerentes, d, deps);
    expect(r).toMatchObject({ nuevos: 1, tasasCambiadas: 1 });
    expect((await getTasaByFecha(destino.db, "2026-03-02"))?.valor).toBe("37");
  });

  it("crea la tasa que falta y la usa en el depósito nuevo", async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    const t = await createTasa(origen.db, { fecha: "2026-03-03", valor: "36.7", notas: null, imagenPath: null });
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(t, { fecha: "2026-03-03", referencia: "111" }));

    const { resultado } = await consolidar(origen, destino.db);

    expect(resultado).toMatchObject({ nuevos: 1, tasasCreadas: 1 });
    const tasa = await getTasaByFecha(destino.db, "2026-03-03");
    expect(tasa?.valor).toBe("36.7");
    expect(await destino.db.select("SELECT tasa_id AS t FROM depositos")).toEqual([{ t: tasa?.id }]);
  });

  it("gerente solo en el origen no crea nada", async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    const beto = await createGerente(origen.db, { nombre: "Beto", telefono: null });
    const asigBeto = await createAsignacion(origen.db, { campanaId: origen.s.campanaId, gerenteId: beto, saldoUsd: "50" });
    await createDeposito(origen.db, asigBeto, depositoBase(origen.s.tasaId, { referencia: "999" }));
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111" }));
    const antes = await volcado(destino.db);

    const { plan, resultado } = await consolidar(origen, destino.db);

    expect(resultado.nuevos).toBe(1);
    expect(plan.noIncluidos.map((n) => n.gerenteNombre)).toEqual(["Beto"]);
    const despues = await volcado(destino.db);
    expect(despues.gerentes).toEqual(antes.gerentes);
    expect(despues.asignaciones).toEqual(antes.asignaciones);
    expect(await destino.db.select("SELECT referencia FROM depositos")).toEqual([{ referencia: "111" }]);
    expect([...(await getEquivalencias(destino.db, "gerentes")).values()]).toEqual([destino.s.anaId]);
  });

  it("el mismo depósito registrado en las dos se vincula y el siguiente intercambio lo reconoce", async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111" }));
    const local = await createDeposito(destino.db, destino.s.asignacionId, depositoBase(destino.s.tasaId, { referencia: "111" }));

    const { resultado, p } = await consolidar(origen, destino.db);

    expect(resultado).toMatchObject({ nuevos: 0, vinculados: 1 });
    expect((await getEquivalencias(destino.db, "depositos")).get(p.depositos[0].uuid)).toBe(local);
    expect(await destino.db.select("SELECT id FROM depositos")).toEqual([{ id: local }]);
    const otra = await planificar(destino.db, p);
    expect(otra.plan.sinCambios).toBe(1);
    expect(otra.plan.vinculos).toEqual([]);
  });

  it('conflicto quedándose con "mia": no cambia los campos y al reaplicar no se vuelve una corrección', async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    const id = await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111" }));
    reloj("2026-03-05T12:00:00.000Z");
    const { p: p1 } = await consolidar(origen, destino.db);
    const uuid = p1.depositos[0].uuid;
    const [{ id: idLocal }] = await destino.db.select<{ id: number }>("SELECT id FROM depositos WHERE uuid = ?", [uuid]);

    reloj("2026-03-06T09:00:00.000Z");
    await updateDeposito(destino.db, idLocal, depositoBase(destino.s.tasaId, { referencia: "111", observaciones: "mía" }));
    reloj("2026-03-06T10:00:00.000Z");
    await updateDeposito(origen.db, id, depositoBase(origen.s.tasaId, { referencia: "111", montoBs: "5000" }));

    reloj("2026-03-06T12:00:00.000Z");
    const p = await paqueteDe(origen, { soloCambios: true });
    const { plan, gerentes, d } = await planificar(destino.db, p);
    expect(plan.conflictos.map((c) => c.tipo)).toEqual(["editadoEnAmbas"]);
    d.conflictos[uuid] = "mia";
    const r = await aplicarConsolidacion(destino.db, p, plan, gerentes, d, { importarImagen, ahora: "2026-03-06T12:00:00.000Z" });

    expect(r.corregidos).toBe(0);
    expect(await getDeposito(destino.db, idLocal)).toMatchObject({ montoBs: "3650", observaciones: "mía", actualizadoEn: "2026-03-06T12:00:00.000Z" });
    const otra = await planificar(destino.db, p);
    expect(otra.plan.correcciones).toEqual([]);
    expect(otra.plan.conflictos.length + otra.plan.masNuevasAqui.length).toBe(1);
  });

  it('conflicto con "archivo": toma los campos del archivo y su actualizadoEn', async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    const id = await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111" }));
    reloj("2026-03-05T12:00:00.000Z");
    const { p: p1 } = await consolidar(origen, destino.db);
    const [{ id: idLocal }] = await destino.db.select<{ id: number }>("SELECT id FROM depositos WHERE uuid = ?", [p1.depositos[0].uuid]);

    reloj("2026-03-06T09:00:00.000Z");
    await updateDeposito(destino.db, idLocal, depositoBase(destino.s.tasaId, { referencia: "111", observaciones: "mía" }));
    reloj("2026-03-06T10:00:00.000Z");
    await updateDeposito(origen.db, id, depositoBase(origen.s.tasaId, { referencia: "111", montoBs: "5000" }));
    reloj("2026-03-06T12:00:00.000Z");
    const { plan, resultado } = await consolidar(origen, destino.db, { soloCambios: true });

    expect(plan.conflictos).toHaveLength(1);
    expect(resultado.corregidos).toBe(1);
    expect(await getDeposito(destino.db, idLocal)).toMatchObject({ montoBs: "5000", observaciones: null, actualizadoEn: "2026-03-06T10:00:00.000Z" });
  });

  it("si falla a mitad revierte todo", async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    const borrar = await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111" }));
    const corregir = await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "222" }));
    reloj("2026-03-05T12:00:00.000Z");
    await consolidar(origen, destino.db);

    reloj("2026-03-06T10:00:00.000Z");
    await deleteDeposito(origen.db, borrar);
    await updateDeposito(origen.db, corregir, depositoBase(origen.s.tasaId, { referencia: "222", montoBs: "4000" }));
    await updateSaldoAsignacion(origen.db, origen.s.asignacionId, "200");
    const t = await createTasa(origen.db, { fecha: "2026-03-03", valor: "36.7", notas: null, imagenPath: null });
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(t, { fecha: "2026-03-03", referencia: "333", imagenPath: "imagenes/n1.png" }));
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(t, { fecha: "2026-03-03", referencia: "444", imagenPath: "imagenes/n2.png" }));

    reloj("2026-03-06T12:00:00.000Z");
    const p = await paqueteDe(origen, { soloCambios: true });
    const { plan, gerentes, d } = await planificar(destino.db, p);
    d.saldos[destino.s.asignacionId] = "archivo";
    expect(plan.tasasNuevas).toHaveLength(1);
    expect(plan.saldos).toHaveLength(1);
    expect(plan.eliminaciones).toHaveLength(1);
    expect(plan.correcciones).toHaveLength(1);
    expect(plan.nuevos).toHaveLength(2);
    const antes = await volcado(destino.db);

    let llamadas = 0;
    const falla = async (nombre: string) => {
      if (++llamadas === 2) throw new Error("disco lleno");
      return `imagenes/recibida-${nombre}`;
    };
    await expect(aplicarConsolidacion(destino.db, p, plan, gerentes, d, { importarImagen: falla, ahora: "2026-03-06T12:00:00.000Z" })).rejects.toThrow("disco lleno");

    expect(llamadas).toBe(2);
    expect(await volcado(destino.db)).toEqual(antes);
  });

  it("campaña cerrada: no aplica nada", async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    await createDeposito(origen.db, origen.s.asignacionId, depositoBase(origen.s.tasaId, { referencia: "111" }));
    const p = await paqueteDe(origen);
    const { plan, gerentes, d } = await planificar(destino.db, p);
    await setEstadoCampana(destino.db, destino.s.campanaId, "cerrada");
    const antes = await volcado(destino.db);

    await expect(aplicarConsolidacion(destino.db, p, plan, gerentes, d, { importarImagen, ahora: "2026-03-05T12:00:00.000Z" })).rejects.toMatchObject({
      code: "CAMPANA_CERRADA",
    });
    expect(await volcado(destino.db)).toEqual(antes);
  });
});

describe("emparejamientoInicial", () => {
  it("usa la campaña sugerida solo si no hay recordada ni una por nombre", async () => {
    const origen = await instalacion();
    const destino = await instalacion();
    const otra = await createCampana(destino.db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
    const p = await paqueteDe(origen);

    expect(await emparejamientoInicial(destino.db, p, otra)).toMatchObject({ campanaId: destino.s.campanaId, estadoCampana: "nombre" });

    const renombrado = { ...p, campana: { ...p.campana, nombre: "Campaña de marzo" } };
    const e = await emparejamientoInicial(destino.db, renombrado, otra);
    expect(e).toMatchObject({ campanaId: otra, estadoCampana: "elegido" });
    expect(e.gerentes[p.asignaciones[0].uuid]).toEqual({ asignacionId: null, estado: "ninguno" });

    expect(await emparejamientoInicial(destino.db, renombrado, null)).toEqual({ campanaId: null, estadoCampana: "ninguno", gerentes: {} });
  });
});
