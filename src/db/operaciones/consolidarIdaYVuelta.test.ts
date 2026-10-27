import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { crearDuplicado, depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito, deleteDeposito, updateDeposito } from "../repos/depositos";
import { getEquivalencias, marcarIntercambio } from "../repos/consolidacion";
import { createGerente } from "../repos/gerentes";
import { guardarAliasBanco } from "../repos/bancosAlias";
import { createAsignacion, setJefeAsignacion } from "../repos/asignaciones";
import { cargarEnvio } from "../queries/envioConsolidar";
import { armarPaquete, leerPaquete, type Paquete } from "@/domain/paquete";
import { clasificar, decisionesIniciales, motivoPendiente, type Decisiones, type PlanConsolidacion } from "@/domain/consolidar";
import { aplicarConsolidacion, cargarLocal, emparejamientoInicial, type Resultado } from "./consolidar";
import { moverDepositos } from "./moverDepositos";

// Dos instalaciones (A y B) con la misma campaña, que se mandan archivos por el camino real:
// cargarEnvio → armarPaquete → JSON → leerPaquete → emparejamientoInicial → cargarLocal → clasificar → decisionesIniciales → aplicar.

type Instalacion = { nombre: string; db: SqlDriver; s: Awaited<ReturnType<typeof seedBasico>> };

const instalacion = async (nombre: string): Promise<Instalacion> => {
  const db = await createTestDb();
  return { nombre, db, s: await seedBasico(db) };
};
const reloj = (iso: string) => vi.setSystemTime(new Date(iso));
const importarImagen = async (nombre: string) => `imagenes/recibida-${nombre}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  reloj("2026-03-05T10:00:00.000Z");
});
afterEach(() => vi.useRealTimers());

/**
 * Arma el archivo de toda la campaña (o solo lo que cambió) y lo marca como enviado, como "Compartir para consolidar". `nombres`: solo esos
 * gerentes; `sinJefe`: como un archivo anterior al árbol.
 */
async function enviar(o: Instalacion, soloCambios = false, op: { nombres?: string[]; sinJefe?: boolean } = {}): Promise<Paquete> {
  const datos = await cargarEnvio(o.db, o.s.campanaId);
  const ids = datos.asignaciones.filter((a) => !op.nombres || op.nombres.includes(a.gerenteNombre)).map((a) => a.id);
  const creadoEn = new Date().toISOString();
  const { paquete } = armarPaquete(datos, { asignacionIds: ids, soloCambios }, { appVersion: "1.0.0", creadoEn, origen: o.nombre });
  await marcarIntercambio(o.db, ids, "envio", creadoEn);
  const json = JSON.parse(JSON.stringify(paquete)) as { asignaciones: { jefe?: unknown }[] };
  if (op.sinJefe) for (const a of json.asignaciones) delete a.jefe;
  return leerPaquete(JSON.stringify(json));
}

type Recibo = { plan: PlanConsolidacion; d: Decisiones; motivo: string | null; resultado: Resultado | null };

/** Clasifica el archivo y, si la pantalla dejaría consolidar, lo aplica con las decisiones iniciales (o las que ajuste `decidir`). */
async function recibir(o: Instalacion, p: Paquete, decidir?: (d: Decisiones, plan: PlanConsolidacion) => void): Promise<Recibo> {
  const e = await emparejamientoInicial(o.db, p, null);
  const plan = clasificar(p, await cargarLocal(o.db, e.campanaId as number), e.gerentes);
  const d = decisionesIniciales(plan);
  decidir?.(d, plan);
  const motivo = motivoPendiente(plan, e.gerentes, d);
  if (motivo) return { plan, d, motivo, resultado: null };
  const resultado = await aplicarConsolidacion(o.db, p, plan, e.gerentes, d, { importarImagen, ahora: new Date().toISOString() });
  return { plan, d, motivo, resultado };
}

const depositos = (db: SqlDriver) =>
  db.select<{ referencia: string; montoBs: string; observaciones: string | null }>(
    "SELECT referencia, monto_bs AS montoBs, observaciones FROM depositos ORDER BY referencia, id",
  );
const idDe = async (db: SqlDriver, referencia: string) => (await db.select<{ id: number }>("SELECT id FROM depositos WHERE referencia = ?", [referencia]))[0].id;
const editar = (o: Instalacion, referencia: string, cambios: Parameters<typeof depositoBase>[1]) =>
  idDe(o.db, referencia).then((id) => updateDeposito(o.db, id, depositoBase(o.s.tasaId, { referencia, ...cambios })));
const registrar = (o: Instalacion, cambios: Parameters<typeof depositoBase>[1]) => createDeposito(o.db, o.s.asignacionId, depositoBase(o.s.tasaId, cambios));

describe("consolidar ida y vuelta entre dos instalaciones", () => {
  it("A → B → A con correcciones: quedan iguales y una corrección no rebota", async () => {
    const a = await instalacion("A");
    const b = await instalacion("B");
    await registrar(a, { referencia: "111" });
    await registrar(b, { referencia: "222", montoBs: "7300" });

    reloj("2026-03-05T11:00:00.000Z");
    expect((await recibir(b, await enviar(a))).resultado).toMatchObject({ nuevos: 1 });
    reloj("2026-03-05T12:00:00.000Z");
    const vuelta = await recibir(a, await enviar(b));
    expect(vuelta.resultado).toMatchObject({ nuevos: 1, corregidos: 0 });
    expect(vuelta.plan.sinCambios).toBe(1);
    expect(await depositos(a.db)).toEqual(await depositos(b.db));

    // A corrige el depósito que registró B; B lo recibe como corrección.
    reloj("2026-03-06T09:00:00.000Z");
    await editar(a, "222", { montoBs: "8000" });
    reloj("2026-03-06T10:00:00.000Z");
    const correccion = await recibir(b, await enviar(a, true));
    expect(correccion.plan.correcciones.map((c) => c.local.referencia)).toEqual(["222"]);
    expect(correccion.plan.conflictos).toEqual([]);
    expect(correccion.resultado).toMatchObject({ corregidos: 1 });

    // B lo reenvía (cambió desde su último envío) y en A no es nada nuevo.
    reloj("2026-03-06T11:00:00.000Z");
    const rebote = await recibir(a, await enviar(b, true));
    expect(rebote.motivo).toBe("No hay nada nuevo para consolidar");
    expect(rebote.plan.sinCambios).toBe(1);
    expect(await depositos(a.db)).toEqual(await depositos(b.db));
    expect((await depositos(a.db)).map((x) => x.montoBs)).toEqual(["3650", "8000"]);
  });

  it("ediciones cruzadas (cada una envía antes de recibir) son conflicto, no una corrección callada", async () => {
    const a = await instalacion("A");
    const b = await instalacion("B");
    await registrar(a, { referencia: "111" });
    await registrar(b, { referencia: "222" });
    reloj("2026-03-05T11:00:00.000Z");
    await recibir(b, await enviar(a));
    reloj("2026-03-05T12:00:00.000Z");
    expect((await recibir(a, await enviar(b))).resultado).toMatchObject({ nuevos: 1 }); // último recibo de A

    reloj("2026-03-06T09:00:00.000Z");
    await editar(a, "111", { montoBs: "4000" });
    reloj("2026-03-06T10:00:00.000Z");
    await editar(b, "111", { montoBs: "5000" });
    reloj("2026-03-06T11:00:00.000Z");
    const deA = await enviar(a, true); // A envía su edición (último envío de A > su edición)…
    reloj("2026-03-06T12:00:00.000Z");
    const deB = await enviar(b, true); // …y B la suya, sin haber recibido la de A.

    const enA = await recibir(a, deB);
    expect(enA.plan.correcciones).toEqual([]);
    expect(enA.plan.conflictos.map((c) => [c.tipo, c.local.montoBs, c.remoto.montoBs])).toEqual([["editadoEnAmbas", "4000", "5000"]]);
    // En B la suya es más nueva que la de A: se queda (y ya ganó en A con "archivo"). Terminan iguales.
    const enB = await recibir(b, deA);
    expect(enB.plan.masNuevasAqui.map((c) => c.local.montoBs)).toEqual(["5000"]);
    expect(enB.plan.correcciones).toEqual([]);
    expect(await depositos(a.db)).toEqual(await depositos(b.db));
  });

  describe("el mismo depósito registrado en las dos (vinculado)", () => {
    async function vinculadas() {
      const a = await instalacion("A");
      const b = await instalacion("B");
      await registrar(a, { referencia: "111" });
      await registrar(b, { referencia: "111" });
      reloj("2026-03-05T11:00:00.000Z");
      expect((await recibir(b, await enviar(a))).resultado).toMatchObject({ nuevos: 0, vinculados: 1 });
      return { a, b };
    }

    it("una edición en B llega a A como corrección (no como duplicado con la mía) y no se revierte al volver", async () => {
      const { a, b } = await vinculadas();
      reloj("2026-03-06T09:00:00.000Z");
      await editar(b, "111", { montoBs: "5000" });
      reloj("2026-03-06T10:00:00.000Z");
      const enA = await recibir(a, await enviar(b, true));
      expect(enA.plan.conflictos.filter((c) => c.tipo === "duplicado")).toEqual([]);
      expect(enA.plan.vinculos).toEqual([]);
      const ediciones = [...enA.plan.correcciones, ...enA.plan.conflictos];
      expect(ediciones.map((c) => [c.local.montoBs, c.remoto.montoBs])).toEqual([["3650", "5000"]]);
      expect(Object.values(enA.d.conflictos)).not.toContain("mia");
      expect(enA.resultado).toMatchObject({ corregidos: 1, nuevos: 0 });
      expect(await depositos(a.db)).toEqual([{ referencia: "111", montoBs: "5000", observaciones: null }]);
      // A recuerda el uuid de B
      const [{ uuid: uuidB }] = await b.db.select<{ uuid: string }>("SELECT uuid FROM depositos");
      expect((await getEquivalencias(a.db, "depositos")).get(uuidB)).toBe(await idDe(a.db, "111"));

      reloj("2026-03-06T11:00:00.000Z");
      const enB = await recibir(b, await enviar(a));
      expect([enB.plan.correcciones, enB.plan.conflictos]).toEqual([[], []]);
      expect(await depositos(b.db)).toEqual([{ referencia: "111", montoBs: "5000", observaciones: null }]);
    });

    it("si B le cambia la referencia, A lo corrige en vez de agregar otro", async () => {
      const { a, b } = await vinculadas();
      reloj("2026-03-06T09:00:00.000Z");
      await editar(b, "111", { referencia: "112" });
      reloj("2026-03-06T10:00:00.000Z");
      const enA = await recibir(a, await enviar(b, true));
      expect(enA.plan.nuevos).toEqual([]);
      expect(enA.resultado).toMatchObject({ nuevos: 0, corregidos: 1 });
      expect(await depositos(a.db)).toEqual([{ referencia: "112", montoBs: "3650", observaciones: null }]);
    });

    it("eliminarlo en cualquiera de las dos lo ofrece eliminar en la otra", async () => {
      // B lo elimina y envía: A tiene el suyo (otro uuid) y se le ofrece eliminarlo.
      const { a, b } = await vinculadas();
      reloj("2026-03-06T09:00:00.000Z");
      await deleteDeposito(b.db, await idDe(b.db, "111"));
      reloj("2026-03-06T10:00:00.000Z");
      const enA = await recibir(a, await enviar(b, true));
      expect(enA.plan.eliminaciones.map((e) => e.local.referencia)).toEqual(["111"]);
      expect(enA.resultado).toMatchObject({ eliminados: 1 });
      expect(await depositos(a.db)).toEqual([]);

      // Al revés: A lo elimina y envía.
      reloj("2026-03-05T10:00:00.000Z");
      const otro = await vinculadas();
      reloj("2026-03-06T09:00:00.000Z");
      await deleteDeposito(otro.a.db, await idDe(otro.a.db, "111"));
      reloj("2026-03-06T10:00:00.000Z");
      const enB = await recibir(otro.b, await enviar(otro.a, true));
      expect(enB.resultado).toMatchObject({ eliminados: 1 });
      expect(await depositos(otro.b.db)).toEqual([]);
      // y lo que B mande después no lo revive en A
      reloj("2026-03-06T11:00:00.000Z");
      expect((await recibir(otro.a, await enviar(otro.b))).plan.nuevos).toEqual([]);
    });
  });

  it("después de limpiar duplicados en A, B se queda con el que A conservó", async () => {
    const a = await instalacion("A");
    const b = await instalacion("B");
    const x = await registrar(a, { referencia: "111" });
    reloj("2026-03-05T11:00:00.000Z");
    await recibir(b, await enviar(a));

    // En A aparece otro con el mismo banco y referencia (de antes del bloqueo) y en la pantalla de duplicados se quedan con él.
    reloj("2026-03-06T09:00:00.000Z");
    await crearDuplicado(a.db, a.s.asignacionId, depositoBase(a.s.tasaId, { referencia: "111", montoBs: "3700" }));
    await deleteDeposito(a.db, x);
    reloj("2026-03-06T10:00:00.000Z");
    const p = await enviar(a, true);

    // Si se desmarca la eliminación, no deja consolidar; y aplicar a la fuerza falla sin cambiar nada.
    const desmarcada = await recibir(b, p, (d) => d.eliminar.clear());
    expect(desmarcada.motivo).toBe("Banesco 111 del archivo reemplaza a uno que el archivo elimina: marca esa eliminación para consolidar");
    const e = await emparejamientoInicial(b.db, p, null);
    const forzado = { ...decisionesIniciales(desmarcada.plan), eliminar: new Set<string>() };
    await expect(aplicarConsolidacion(b.db, p, desmarcada.plan, e.gerentes, forzado, { importarImagen, ahora: new Date().toISOString() })).rejects.toMatchObject({
      code: "DUPLICADO",
    });
    expect(await depositos(b.db)).toEqual([{ referencia: "111", montoBs: "3650", observaciones: null }]);

    const enB = await recibir(b, p);
    expect(enB.plan.nuevos).toHaveLength(1);
    expect(enB.plan.eliminaciones).toHaveLength(1);
    expect([enB.plan.conflictos, enB.plan.vinculos]).toEqual([[], []]);
    expect(enB.resultado).toMatchObject({ nuevos: 1, eliminados: 1 });
    expect(await depositos(b.db)).toEqual([{ referencia: "111", montoBs: "3700", observaciones: null }]);
  });

  it("solo lo que cambió: cada envío lleva lo nuevo y las eliminaciones desde el anterior", async () => {
    const a = await instalacion("A");
    const b = await instalacion("B");
    const x1 = await registrar(a, { referencia: "111" });
    reloj("2026-03-05T11:00:00.000Z");
    await recibir(b, await enviar(a, true));

    reloj("2026-03-06T09:00:00.000Z");
    await registrar(a, { referencia: "222" });
    reloj("2026-03-06T10:00:00.000Z");
    const p2 = await enviar(a, true);
    expect(p2.depositos.map((d) => d.referencia)).toEqual(["222"]);
    expect((await recibir(b, p2)).resultado).toMatchObject({ nuevos: 1 });

    reloj("2026-03-07T09:00:00.000Z");
    await deleteDeposito(a.db, x1);
    reloj("2026-03-07T10:00:00.000Z");
    const p3 = await enviar(a, true);
    expect([p3.depositos, p3.eliminaciones.length]).toEqual([[], 1]);
    expect((await recibir(b, p3)).resultado).toMatchObject({ eliminados: 1 });

    reloj("2026-03-08T10:00:00.000Z");
    const p4 = await enviar(a, true);
    expect([p4.depositos, p4.eliminaciones]).toEqual([[], []]);
    expect((await recibir(b, p4)).motivo).toBe("No hay nada nuevo para consolidar");
    expect(await depositos(b.db)).toEqual(await depositos(a.db));
  });

  describe("un gerente que la otra no tiene en la campaña", () => {
    /** A tiene a Ana y a Luis (con un depósito); B solo a Ana. */
    async function conLuisEnA() {
      const a = await instalacion("A");
      const b = await instalacion("B");
      const luis = await createGerente(a.db, { nombre: "Luis", telefono: null });
      const asigLuis = await createAsignacion(a.db, { campanaId: a.s.campanaId, gerenteId: luis, saldoUsd: "40" });
      await createDeposito(a.db, asigLuis, depositoBase(a.s.tasaId, { referencia: "777", imagenPath: "imagenes/l.png" }));
      await registrar(a, { referencia: "111" });
      return { a, b };
    }
    const gerenteYAsignacion = (db: SqlDriver, nombre: string) =>
      db.select<{ gerenteUuid: string; asignacionUuid: string; saldoUsd: string }>(
        `SELECT g.uuid AS gerenteUuid, a.uuid AS asignacionUuid, a.saldo_usd AS saldoUsd FROM gerentes g JOIN asignaciones a ON a.gerente_id = g.id
         WHERE g.nombre = ? ORDER BY a.id`,
        [nombre],
      );

    it("B agrega a la campaña al gerente que no tenía, y el segundo archivo lo reconoce sin preguntar", async () => {
      const { a, b } = await conLuisEnA();
      reloj("2026-03-05T11:00:00.000Z");
      const r = await recibir(b, await enviar(a));
      expect(r.resultado).toMatchObject({ gerentesAgregados: 1, nuevos: 2 });
      // En B Luis tiene el mismo uuid que en A, su asignación en Marzo el mismo uuid y el monto de A, y su depósito.
      expect(await gerenteYAsignacion(b.db, "Luis")).toEqual(await gerenteYAsignacion(a.db, "Luis"));
      expect(await depositos(b.db)).toEqual(await depositos(a.db));
      expect([...(await getEquivalencias(b.db, "gerentes")).keys()]).not.toContain((await gerenteYAsignacion(a.db, "Luis"))[0].gerenteUuid);

      // A corrige el depósito de Luis y reenvía: en B es una corrección, sin otro Luis ni emparejamientos que decidir.
      reloj("2026-03-06T09:00:00.000Z");
      await editar(a, "777", { montoBs: "7300" });
      reloj("2026-03-06T10:00:00.000Z");
      const p = await enviar(a, true);
      const e = await emparejamientoInicial(b.db, p, null);
      expect(Object.values(e.gerentes).every((g) => g.estado === "recordado" || g.estado === "nombre")).toBe(true);
      const segunda = await recibir(b, p);
      expect(segunda.plan.agregadas).toEqual([]);
      expect(segunda.resultado).toMatchObject({ gerentesAgregados: 0, corregidos: 1, nuevos: 0 });
      expect(await gerenteYAsignacion(b.db, "Luis")).toHaveLength(1);
      expect(await depositos(b.db)).toEqual(await depositos(a.db));

      // Y de vuelta en A, lo de B no cambia nada de Luis.
      reloj("2026-03-06T11:00:00.000Z");
      const vuelta = await recibir(a, await enviar(b));
      expect(vuelta.plan.agregadas).toEqual([]);
      expect(vuelta.motivo).toBe("No hay nada nuevo para consolidar");
    });

    it("si aplicar falla, no queda el gerente ni la asignación agregados", async () => {
      const { a, b } = await conLuisEnA();
      const tablas = ["gerentes", "asignaciones", "depositos", "equivalencias", "consolidaciones", "tasas"];
      const volcado = async () => Promise.all(tablas.map((t) => b.db.select(`SELECT * FROM ${t} ORDER BY rowid`)));
      const antes = await volcado();
      const p = await enviar(a);
      const e = await emparejamientoInicial(b.db, p, null);
      const plan = clasificar(p, await cargarLocal(b.db, e.campanaId as number), e.gerentes);
      expect(plan.agregadas.map((x) => [x.gerenteId, x.gerenteNombre])).toEqual([[null, "Luis"]]);
      const falla = async () => {
        throw new Error("disco lleno");
      };
      await expect(aplicarConsolidacion(b.db, p, plan, e.gerentes, decisionesIniciales(plan), { importarImagen: falla, ahora: new Date().toISOString() }))
        .rejects.toThrow("disco lleno");
      expect(await volcado()).toEqual(antes);
    });

    it("se agrega con el gerente que B ya tenía fuera de la campaña (del mismo nombre) y se recuerda", async () => {
      const { a, b } = await conLuisEnA();
      const luisB = await createGerente(b.db, { nombre: "luis", telefono: null });
      reloj("2026-03-05T11:00:00.000Z");
      const p = await enviar(a);
      const r = await recibir(b, p);
      expect(r.plan.agregadas.map((x) => [x.gerenteId, x.gerenteNombre])).toEqual([[luisB, "luis"]]);
      expect(r.resultado).toMatchObject({ gerentesAgregados: 1, nuevos: 2 });
      expect(await b.db.select("SELECT id FROM gerentes WHERE nombre LIKE 'luis'")).toEqual([{ id: luisB }]);
      expect((await getEquivalencias(b.db, "gerentes")).get(p.asignaciones.find((x) => x.gerente.nombre === "Luis")!.gerente.uuid)).toBe(luisB);
    });

    it("No incluir no crea nada y el depósito queda fuera", async () => {
      const { a, b } = await conLuisEnA();
      const p = await enviar(a);
      const e = await emparejamientoInicial(b.db, p, null);
      const luis = p.asignaciones.find((x) => x.gerente.nombre === "Luis")!;
      const gerentes = { ...e.gerentes, [luis.uuid]: { asignacionId: null, estado: "elegido" as const } };
      const plan = clasificar(p, await cargarLocal(b.db, e.campanaId as number), gerentes);
      const r = await aplicarConsolidacion(b.db, p, plan, gerentes, decisionesIniciales(plan), { importarImagen, ahora: new Date().toISOString() });
      expect(r).toMatchObject({ gerentesAgregados: 0, nuevos: 1 });
      expect(await gerenteYAsignacion(b.db, "Luis")).toEqual([]);
    });
  });

  describe("el árbol de la campaña", () => {
    const asignacionDe = async (db: SqlDriver, nombre: string) =>
      (await db.select<{ id: number }>("SELECT a.id FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id WHERE g.nombre = ?", [nombre]))[0].id;
    /** Cada gerente de la campaña con el nombre de su jefe. */
    const arbol = (db: SqlDriver) =>
      db.select<{ nombre: string; jefe: string | null }>(
        `SELECT g.nombre, jg.nombre AS jefe FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id
         LEFT JOIN asignaciones j ON j.id = a.jefe_id LEFT JOIN gerentes jg ON jg.id = j.gerente_id ORDER BY g.nombre`,
      );
    const sumar = async (o: Instalacion, nombre: string, jefe?: string) => {
      const gerenteId = await createGerente(o.db, { nombre, telefono: null });
      const jefeId = jefe ? await asignacionDe(o.db, jefe) : null;
      return createAsignacion(o.db, { campanaId: o.s.campanaId, gerenteId, saldoUsd: "0", jefeId });
    };
    const ponerJefe = async (o: Instalacion, nombre: string, jefe: string | null) =>
      setJefeAsignacion(o.db, await asignacionDe(o.db, nombre), jefe === null ? null : await asignacionDe(o.db, jefe));

    it("la rama de Luis enviada desde A queda armada en B con gerentes agregados", async () => {
      const a = await instalacion("A");
      const b = await instalacion("B");
      await registrar(a, { referencia: "111" });
      reloj("2026-03-05T11:00:00.000Z");
      await recibir(b, await enviar(a)); // B recuerda a la Ana de A
      await sumar(a, "Luis", "Ana");
      await sumar(a, "Pedro", "Luis");
      await sumar(a, "María", "Luis");

      reloj("2026-03-05T12:00:00.000Z");
      const p = await enviar(a, false, { nombres: ["Luis", "Pedro", "María"] });
      expect(p.asignaciones.map((x) => x.gerente.nombre)).not.toContain("Ana");
      const r = await recibir(b, p);
      expect(r.plan.jefes.map((f) => [f.gerenteNombre, f.automatico])).toEqual([["Luis", true], ["María", true], ["Pedro", true]]);
      expect(r.resultado).toMatchObject({ gerentesAgregados: 3, jefesCambiados: 3 });
      expect(await arbol(b.db)).toEqual([
        { nombre: "Ana", jefe: null }, { nombre: "Luis", jefe: "Ana" }, { nombre: "María", jefe: "Luis" }, { nombre: "Pedro", jefe: "Luis" },
      ]);
      expect(await arbol(b.db)).toEqual(await arbol(a.db));
    });

    it("rama con gerentes que B ya tenía sin jefe: quedan armados solos", async () => {
      const a = await instalacion("A");
      const b = await instalacion("B");
      await sumar(b, "Luis");
      await sumar(b, "Pedro");
      await sumar(a, "Luis", "Ana");
      await sumar(a, "Pedro", "Luis");
      reloj("2026-03-05T12:00:00.000Z");
      const r = await recibir(b, await enviar(a));
      expect(r.plan.jefes.map((f) => [f.gerenteNombre, f.automatico])).toEqual([["Luis", true], ["Pedro", true]]);
      expect(r.resultado).toMatchObject({ gerentesAgregados: 0, jefesCambiados: 2 });
      expect(await arbol(b.db)).toEqual(await arbol(a.db));
      expect((await arbol(b.db)).filter((x) => x.jefe !== null)).toEqual([{ nombre: "Luis", jefe: "Ana" }, { nombre: "Pedro", jefe: "Luis" }]);
    });

    /** A y B con Ana, Karla y Luis; en A Luis está bajo Ana y en B bajo Karla. */
    async function jefeDistinto() {
      const a = await instalacion("A");
      const b = await instalacion("B");
      await sumar(a, "Karla");
      await sumar(a, "Luis");
      reloj("2026-03-05T11:00:00.000Z");
      expect((await recibir(b, await enviar(a))).resultado).toMatchObject({ gerentesAgregados: 2, jefesCambiados: 0 });
      reloj("2026-03-05T11:30:00.000Z");
      await ponerJefe(a, "Luis", "Ana");
      await ponerJefe(b, "Luis", "Karla");
      return { a, b };
    }
    const luisBajoArchivo = (d: Decisiones, plan: PlanConsolidacion) => {
      for (const f of plan.jefes) d.jefes[f.asignacionId] = "archivo";
    };

    it("jefe distinto en ambos lados: con 'mía' no cambia y con 'archivo' cambia", async () => {
      const { a, b } = await jefeDistinto();
      reloj("2026-03-05T12:00:00.000Z");
      const p = await enviar(a, true);
      const mia = await recibir(b, p);
      expect(mia.plan.jefes.map((f) => [f.gerenteNombre, f.automatico, f.bloqueo])).toEqual([["Luis", false, null]]);
      expect(mia.d.jefes).toEqual({ [mia.plan.jefes[0].asignacionId]: "mia" });
      expect(mia.motivo).toBe("No hay nada nuevo para consolidar");
      expect((await arbol(b.db)).find((x) => x.nombre === "Luis")?.jefe).toBe("Karla");

      const archivo = await recibir(b, p, luisBajoArchivo);
      expect(archivo.resultado).toMatchObject({ jefesCambiados: 1 });
      expect(await arbol(b.db)).toEqual(await arbol(a.db));
      expect((await arbol(b.db)).find((x) => x.nombre === "Luis")?.jefe).toBe("Ana");
    });

    it("si aplicar falla, los jefes quedan como estaban", async () => {
      const { a, b } = await jefeDistinto();
      await registrar(a, { referencia: "999", imagenPath: "imagenes/x.png" });
      reloj("2026-03-05T12:00:00.000Z");
      const p = await enviar(a, true);
      const volcado = () => b.db.select("SELECT * FROM asignaciones ORDER BY id");
      const antes = await volcado();
      const e = await emparejamientoInicial(b.db, p, null);
      const plan = clasificar(p, await cargarLocal(b.db, e.campanaId as number), e.gerentes);
      const d = decisionesIniciales(plan);
      luisBajoArchivo(d, plan);
      reloj("2026-03-05T13:00:00.000Z");
      const falla = async () => {
        throw new Error("disco lleno");
      };
      await expect(aplicarConsolidacion(b.db, p, plan, e.gerentes, d, { importarImagen: falla, ahora: new Date().toISOString() })).rejects.toThrow("disco lleno");
      expect(await volcado()).toEqual(antes);
    });

    it("un jefe del archivo que cerraría un ciclo con los de aquí queda bloqueado", async () => {
      const { a, b } = await jefeDistinto();
      // En B Karla queda bajo Luis: tomar a Luis bajo Karla del archivo lo dejaría debajo de sí mismo.
      await ponerJefe(a, "Luis", "Karla");
      await ponerJefe(b, "Luis", null);
      await ponerJefe(b, "Karla", "Luis");
      await registrar(a, { referencia: "999" });
      reloj("2026-03-05T12:00:00.000Z");
      const r = await recibir(b, await enviar(a, true), luisBajoArchivo);
      expect(r.plan.jefes.map((f) => [f.gerenteNombre, f.automatico, f.bloqueo])).toEqual([
        ["Karla", false, null], ["Luis", false, "Quedaría debajo de sí mismo"],
      ]);
      // Karla pasa a sin jefe (archivo) y Luis no puede tomar a Karla: no hay ciclo y no se toca a Luis.
      expect(r.resultado).toMatchObject({ jefesCambiados: 1, nuevos: 1 });
      expect((await arbol(b.db)).filter((x) => x.jefe !== null)).toEqual([]);
    });

    it("aplicar rechaza jefes elegidos que juntos forman un ciclo, sin cambiar nada", async () => {
      const { a, b } = await jefeDistinto();
      reloj("2026-03-05T12:00:00.000Z");
      const p = await enviar(a, true);
      const e = await emparejamientoInicial(b.db, p, null);
      const plan = clasificar(p, await cargarLocal(b.db, e.campanaId as number), e.gerentes);
      const [luis] = plan.jefes;
      const karla = await asignacionDe(b.db, "Karla");
      // Luis bajo Karla y Karla bajo Luis (como si cada una sola fuera válida)
      const enCiclo = { ...plan, jefes: [{ ...luis, archivo: karla }, { ...luis, asignacionId: karla, gerenteNombre: "Karla", local: null, archivo: luis.asignacionId }] };
      const d = { ...decisionesIniciales(enCiclo), jefes: { [luis.asignacionId]: "archivo" as const, [karla]: "archivo" as const } };
      const antes = await arbol(b.db);
      await expect(aplicarConsolidacion(b.db, p, enCiclo, e.gerentes, d, { importarImagen, ahora: new Date().toISOString() })).rejects.toThrow(
        "Luis y Karla quedarían uno debajo del otro: cambia la elección de su jefe",
      );
      expect(await arbol(b.db)).toEqual(antes);
    });

    it("archivo viejo sin jefe no toca el árbol", async () => {
      const { a, b } = await jefeDistinto();
      await ponerJefe(b, "Luis", null); // en B, Luis sin jefe: con jefe en el archivo sería automático
      await registrar(a, { referencia: "999" });
      reloj("2026-03-05T12:00:00.000Z");
      const r = await recibir(b, await enviar(a, true, { sinJefe: true }));
      expect(r.plan.jefes).toEqual([]);
      expect(r.resultado).toMatchObject({ nuevos: 1, jefesCambiados: 0 });
      expect((await arbol(b.db)).filter((x) => x.jefe !== null)).toEqual([]);
    });
  });

  it("un depósito pasado a otro gerente llega como corrección de gerente, no como nuevo, y no rebota", async () => {
    const a = await instalacion("A");
    const b = await instalacion("B");
    const luis = await createGerente(a.db, { nombre: "Luis", telefono: null });
    const asigLuis = await createAsignacion(a.db, { campanaId: a.s.campanaId, gerenteId: luis, saldoUsd: "40" });
    await registrar(a, { referencia: "111" });
    reloj("2026-03-05T11:00:00.000Z");
    expect((await recibir(b, await enviar(a))).resultado).toMatchObject({ gerentesAgregados: 1, nuevos: 1 });

    reloj("2026-03-06T09:00:00.000Z");
    await moverDepositos(a.db, [await idDe(a.db, "111")], asigLuis);
    reloj("2026-03-06T10:00:00.000Z");
    const r = await recibir(b, await enviar(a, true));
    expect(r.plan.nuevos).toEqual([]);
    expect(r.plan.correcciones.map((c) => c.cambios.map((x) => [x.campo, x.antes, x.despues]))).toEqual([[["gerente", "Ana", "Luis"]]]);
    expect(r.resultado).toMatchObject({ corregidos: 1 });
    const gerenteDe = (db: SqlDriver) =>
      db.select<{ nombre: string }>(
        "SELECT g.nombre FROM depositos d JOIN asignaciones a ON a.id = d.asignacion_id JOIN gerentes g ON g.id = a.gerente_id WHERE d.referencia = '111'",
      );
    expect(await gerenteDe(b.db)).toEqual([{ nombre: "Luis" }]);

    reloj("2026-03-06T11:00:00.000Z");
    expect((await recibir(a, await enviar(b, true))).motivo).toBe("No hay nada nuevo para consolidar");
    expect(await gerenteDe(a.db)).toEqual([{ nombre: "Luis" }]);
  });

  it("aplicar el mismo archivo dos veces no cambia nada la segunda", async () => {
    const a = await instalacion("A");
    const b = await instalacion("B");
    await registrar(a, { referencia: "111" });
    const borrar = await registrar(a, { referencia: "222" });
    reloj("2026-03-05T11:00:00.000Z");
    await recibir(b, await enviar(a));
    reloj("2026-03-06T09:00:00.000Z");
    await editar(a, "111", { montoBs: "4000" });
    await deleteDeposito(a.db, borrar);
    await registrar(a, { referencia: "333" });
    reloj("2026-03-06T10:00:00.000Z");
    const p = await enviar(a);

    expect((await recibir(b, p)).resultado).toMatchObject({ nuevos: 1, corregidos: 1, eliminados: 1 });
    const antes = await depositos(b.db);
    reloj("2026-03-06T11:00:00.000Z");
    const otra = await recibir(b, p);
    expect(otra.motivo).toBe("No hay nada nuevo para consolidar");
    expect([otra.plan.nuevos, otra.plan.correcciones, otra.plan.conflictos, otra.plan.eliminaciones]).toEqual([[], [], [], []]);
    expect(await depositos(b.db)).toEqual(antes);
    expect(antes).toEqual(await depositos(a.db));
  });

  it("el banco del archivo se lee con los alias que recuerda quien recibe: es el mismo depósito, no un nuevo que falla", async () => {
    const a = await instalacion("A");
    const b = await instalacion("B");
    await guardarAliasBanco(b.db, "BANCO XYZ", "Bancamiga");
    await registrar(b, { banco: "Bancamiga", referencia: "123" });
    await registrar(a, { banco: "BANCO XYZ", referencia: "123" });
    reloj("2026-03-05T11:00:00.000Z");
    const ida = await recibir(b, await enviar(a));
    expect(ida.plan.nuevos).toEqual([]);
    expect(ida.plan.vinculos).toHaveLength(1);
    expect(ida.resultado).toMatchObject({ nuevos: 0, vinculados: 1 });
    expect(await b.db.select("SELECT banco, referencia FROM depositos")).toEqual([{ banco: "Bancamiga", referencia: "123" }]);
  });

  describe("posibles repetidos del Provincial", () => {
    const pago = { banco: "BBVA Provincial", referencia: "V-12.345.678", montoBs: "5000" };
    const cuantos = async (db: SqlDriver) => (await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM depositos"))[0].n;

    it("dos pagos reales iguales del Provincial: entran los dos y no se pierde ninguno a la vuelta", async () => {
      const a = await instalacion("A");
      const b = await instalacion("B");
      await registrar(a, pago);
      await registrar(a, pago);
      reloj("2026-03-05T11:00:00.000Z");
      const ida = await recibir(b, await enviar(a));
      expect(ida.plan.posiblesRepetidos).toEqual([]);
      expect(ida.resultado).toMatchObject({ nuevos: 2 });
      expect(await cuantos(b.db)).toBe(2);
      expect((await b.db.select<{ banco: string }>("SELECT banco FROM depositos")).map((x) => x.banco)).toEqual(["Provincial", "Provincial"]);
      reloj("2026-03-05T12:00:00.000Z");
      const vuelta = await recibir(a, await enviar(b));
      expect(vuelta.plan.posiblesRepetidos).toEqual([]);
      expect(await cuantos(a.db)).toBe(2);
    });

    it("el mismo pago registrado en las dos apps: por defecto no se duplica y queda vinculado", async () => {
      const a = await instalacion("A");
      const b = await instalacion("B");
      await registrar(a, pago);
      // B lo registra a otra hora y con la cédula escrita de otra forma: al vincularlos, la cédula no cuenta como un cambio.
      reloj("2026-03-05T10:30:00.000Z");
      await registrar(b, { ...pago, referencia: "12345678" });
      reloj("2026-03-05T11:00:00.000Z");
      const ida = await recibir(b, await enviar(a));
      expect(ida.plan.posiblesRepetidos).toHaveLength(1);
      expect(ida.plan.nuevos).toEqual([]);
      expect(ida.resultado).toMatchObject({ nuevos: 0, vinculados: 1 });
      expect(await cuantos(b.db)).toBe(1);
      reloj("2026-03-05T12:00:00.000Z");
      const vuelta = await recibir(a, await enviar(b));
      expect(vuelta.plan.posiblesRepetidos).toEqual([]);
      expect(vuelta.plan.nuevos).toEqual([]);
      expect([vuelta.plan.correcciones, vuelta.plan.conflictos, vuelta.plan.masNuevasAqui]).toEqual([[], [], []]);
      expect(vuelta.motivo).toBe("No hay nada nuevo para consolidar");
      expect(await cuantos(a.db)).toBe(1);
      // Segundo intercambio: ya no pregunta en ninguna de las dos.
      reloj("2026-03-05T13:00:00.000Z");
      const otra = await recibir(b, await enviar(a));
      expect(otra.plan.posiblesRepetidos).toEqual([]);
      expect([otra.plan.correcciones, otra.plan.conflictos, otra.plan.masNuevasAqui]).toEqual([[], [], []]);
      expect(otra.motivo).toBe("No hay nada nuevo para consolidar");
      reloj("2026-03-05T14:00:00.000Z");
      const otraEnA = await recibir(a, await enviar(b));
      expect(otraEnA.plan.posiblesRepetidos).toEqual([]);
      expect([otraEnA.plan.correcciones, otraEnA.plan.conflictos, otraEnA.plan.masNuevasAqui]).toEqual([[], [], []]);
      expect(otraEnA.motivo).toBe("No hay nada nuevo para consolidar");
      expect([await cuantos(a.db), await cuantos(b.db)]).toEqual([1, 1]);
    });

    it("dos de A contra uno igual en B, con las decisiones iniciales: las dos quedan con 2", async () => {
      const a = await instalacion("A");
      const b = await instalacion("B");
      await registrar(a, pago);
      await registrar(a, pago);
      await registrar(b, pago);
      reloj("2026-03-05T11:00:00.000Z");
      const ida = await recibir(b, await enviar(a));
      expect(ida.plan.posiblesRepetidos).toHaveLength(1);
      expect(ida.resultado).toMatchObject({ nuevos: 1, vinculados: 1 });
      expect(await cuantos(b.db)).toBe(2);
      reloj("2026-03-05T12:00:00.000Z");
      const vuelta = await recibir(a, await enviar(b));
      expect(vuelta.plan.posiblesRepetidos).toEqual([]);
      expect(vuelta.plan.nuevos).toEqual([]);
      expect([await cuantos(a.db), await cuantos(b.db)]).toEqual([2, 2]);
      reloj("2026-03-05T13:00:00.000Z");
      const otra = await recibir(b, await enviar(a));
      expect(otra.motivo).toBe("No hay nada nuevo para consolidar");
      expect([await cuantos(a.db), await cuantos(b.db)]).toEqual([2, 2]);
    });

    it("Es otro pago: los marcados entran y un nuevo envío no vuelve a preguntar", async () => {
      const a = await instalacion("A");
      const b = await instalacion("B");
      await registrar(a, pago);
      await registrar(a, pago);
      await registrar(b, pago);
      reloj("2026-03-05T11:00:00.000Z");
      const ida = await recibir(b, await enviar(a), (d, plan) => plan.posiblesRepetidos.forEach((x) => d.entranRepetidos.add(x.remoto.uuid)));
      expect(ida.plan.posiblesRepetidos).toHaveLength(1); // Q es a lo sumo uno de los dos: el otro ya es nuevo
      expect(ida.plan.nuevos).toHaveLength(1);
      expect(ida.resultado).toMatchObject({ nuevos: 2, vinculados: 0 });
      expect(await cuantos(b.db)).toBe(3);
      reloj("2026-03-05T12:00:00.000Z");
      const otra = await recibir(b, await enviar(a));
      expect(otra.plan.posiblesRepetidos).toEqual([]);
      expect(otra.motivo).toBe("No hay nada nuevo para consolidar");
      expect(await cuantos(b.db)).toBe(3);
      // A recibe el de B: el suyo también es otro pago (los dos de A ya están en el archivo).
      reloj("2026-03-05T13:00:00.000Z");
      const vuelta = await recibir(a, await enviar(b));
      expect(vuelta.plan.posiblesRepetidos).toEqual([]);
      expect(vuelta.resultado).toMatchObject({ nuevos: 1 });
      expect(await cuantos(a.db)).toBe(3);
    });
  });
});
