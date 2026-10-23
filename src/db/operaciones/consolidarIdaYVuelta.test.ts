import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { crearDuplicado, depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito, deleteDeposito, updateDeposito } from "../repos/depositos";
import { getEquivalencias, marcarIntercambio } from "../repos/consolidacion";
import { cargarEnvio } from "../queries/envioConsolidar";
import { armarPaquete, leerPaquete, type Paquete } from "@/domain/paquete";
import { clasificar, decisionesIniciales, motivoPendiente, type Decisiones, type PlanConsolidacion } from "@/domain/consolidar";
import { aplicarConsolidacion, cargarLocal, emparejamientoInicial, type Resultado } from "./consolidar";

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

/** Arma el archivo de toda la campaña (o solo lo que cambió) y lo marca como enviado, como "Compartir para consolidar". */
async function enviar(o: Instalacion, soloCambios = false): Promise<Paquete> {
  const datos = await cargarEnvio(o.db, o.s.campanaId);
  const ids = datos.asignaciones.map((a) => a.id);
  const creadoEn = new Date().toISOString();
  const { paquete } = armarPaquete(datos, { asignacionIds: ids, soloCambios }, { appVersion: "1.0.0", creadoEn, origen: o.nombre });
  await marcarIntercambio(o.db, ids, "envio", creadoEn);
  return leerPaquete(JSON.stringify(paquete));
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
});
