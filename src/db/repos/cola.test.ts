import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createCampana, setEstadoCampana } from "./campanas";
import { createDeposito, deleteDeposito } from "./depositos";
import { createTasa } from "./tasas";
import {
  asignarGerenteCola,
  borradorDepositoVacio,
  borradorTasaVacio,
  contarPendientesDepositos,
  contarPendientesTasas,
  descartarDeposito,
  descartarDepositos,
  descartarTasa,
  encolarDeposito,
  encolarTasa,
  getItemColaDeposito,
  getItemColaTasa,
  guardarBorradorDeposito,
  guardarBorradorTasa,
  listColaDepositos,
  listColaTasas,
  marcarDepositoHecho,
  marcarTasaHecha,
  quitarHechoDeposito,
  quitarHechoTasa,
  quitarHechosDepositos,
  quitarHechosTasas,
  type BorradorDeposito,
} from "./cola";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
});

const encolar = (n: number, borrador: BorradorDeposito = borradorDepositoVacio()) =>
  encolarDeposito(db, s.campanaId, { imagenPath: `imagenes/${n}.png`, nombreArchivo: `${n}.png`, borrador });

it("borrador vacío: sin fecha y con el gerente indicado", () => {
  const b = borradorDepositoVacio("a:3");
  expect(b.draft).toEqual({ fecha: "", banco: "", referencia: "", cuentaDestino: "", montoBs: "", observaciones: "" });
  expect(b.destino).toEqual({ sel: "a:3", nombre: "", saldo: "" });
  expect(borradorDepositoVacio().destino.sel).toBe("");
  expect(borradorTasaVacio().draft).toEqual({ fecha: "", valor: "", notas: "" });
});

it("encola, lista en orden y conserva el borrador JSON", async () => {
  const b = borradorDepositoVacio("a:1");
  b.draft.montoBs = "1.250,00";
  b.auto = { estado: { montoBs: "ocr" }, confianza: { montoBs: 0.9 } };
  const a = await encolar(1, b);
  const c = await encolar(2);
  const items = await listColaDepositos(db, s.campanaId);
  expect(items.map((i) => [i.id, i.orden, i.estado])).toEqual([
    [a, 1, "pendiente"],
    [c, 2, "pendiente"],
  ]);
  expect(items[0]).toMatchObject({ campanaId: s.campanaId, imagenPath: "imagenes/1.png", nombreArchivo: "1.png", formato: null, depositoId: null });
  expect(items[0].borrador).toEqual(b);
});

it("guarda el borrador y el formato", async () => {
  const id = await encolar(1);
  const b2 = borradorDepositoVacio("a:1");
  b2.draft.banco = "Banco de Venezuela";
  await guardarBorradorDeposito(db, id, b2, "bdv-transferencia");
  expect(await getItemColaDeposito(db, id)).toMatchObject({ borrador: b2, formato: "bdv-transferencia" });
  b2.draft.referencia = "123";
  await guardarBorradorDeposito(db, id, b2);
  expect(await getItemColaDeposito(db, id)).toMatchObject({ borrador: b2, formato: "bdv-transferencia" });
});

it("asigna gerente solo a pendientes", async () => {
  const a = await encolar(1);
  const b = await encolar(2, borradorDepositoVacio("nuevo"));
  const c = await encolar(3, borradorDepositoVacio("a:9"));
  const dep = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  await marcarDepositoHecho(db, c, dep);
  expect(await asignarGerenteCola(db, [a, b, c], "a:7")).toBe(2);
  expect((await getItemColaDeposito(db, a))?.borrador.destino).toEqual({ sel: "a:7", nombre: "", saldo: "" });
  expect((await getItemColaDeposito(db, b))?.borrador.destino).toEqual({ sel: "a:7", nombre: "", saldo: "" });
  expect((await getItemColaDeposito(db, c))?.borrador.destino.sel).toBe("a:9");
});

it("no edita ni descarta un elemento hecho", async () => {
  const id = await encolar(1);
  const dep = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  await marcarDepositoHecho(db, id, dep);
  expect(await getItemColaDeposito(db, id)).toMatchObject({ estado: "hecho", depositoId: dep });
  await expect(guardarBorradorDeposito(db, id, borradorDepositoVacio())).rejects.toMatchObject({ code: "VALIDACION" });
  await expect(descartarDeposito(db, id)).rejects.toMatchObject({ code: "VALIDACION" });
  await expect(marcarDepositoHecho(db, id, dep)).rejects.toMatchObject({ code: "VALIDACION" });
});

it("rechaza operar sobre un elemento que no existe", async () => {
  await expect(marcarDepositoHecho(db, 99, 1)).rejects.toMatchObject({ code: "NO_ENCONTRADO" });
  await expect(guardarBorradorDeposito(db, 99, borradorDepositoVacio())).rejects.toMatchObject({ code: "NO_ENCONTRADO" });
});

it("descartar devuelve la imagen y borra la fila", async () => {
  const id = await encolar(1);
  expect(await descartarDeposito(db, id)).toBe("imagenes/1.png");
  expect(await getItemColaDeposito(db, id)).toBeNull();
});

it("descarta varios a la vez y devuelve sus imágenes; si uno ya está hecho no descarta ninguno", async () => {
  const a = await encolar(1);
  const b = await encolar(2);
  const c = await encolar(3);
  expect(await descartarDepositos(db, [a, c])).toEqual(["imagenes/1.png", "imagenes/3.png"]);
  expect((await listColaDepositos(db, s.campanaId)).map((i) => i.id)).toEqual([b]);

  const d = await encolar(4);
  await marcarDepositoHecho(db, d, await createDeposito(db, s.asignacionId, depositoBase(s.tasaId)));
  await expect(descartarDepositos(db, [b, d])).rejects.toMatchObject({ code: "VALIDACION" });
  expect((await listColaDepositos(db, s.campanaId)).map((i) => i.id)).toEqual([b, d]);
});

it("quita un hecho de la cola, pero no un pendiente", async () => {
  const a = await encolar(1);
  const b = await encolar(2);
  await marcarDepositoHecho(db, a, await createDeposito(db, s.asignacionId, depositoBase(s.tasaId)));
  await expect(quitarHechoDeposito(db, b)).rejects.toMatchObject({ code: "VALIDACION" });
  await quitarHechoDeposito(db, a);
  expect((await listColaDepositos(db, s.campanaId)).map((i) => i.id)).toEqual([b]);

  const t = await encolarTasa(db, { imagenPath: "imagenes/t1.png", nombreArchivo: null, borrador: borradorTasaVacio() });
  await marcarTasaHecha(db, t, await createTasa(db, { fecha: "2026-10-16", valor: "880.12", notas: null, imagenPath: null }));
  await quitarHechoTasa(db, t);
  expect(await listColaTasas(db)).toEqual([]);
});

it("quita los hechos y cuenta pendientes", async () => {
  const a = await encolar(1);
  await encolar(2);
  const dep = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  await marcarDepositoHecho(db, a, dep);
  expect(await contarPendientesDepositos(db, s.campanaId)).toBe(1);
  expect(await quitarHechosDepositos(db, s.campanaId)).toBe(1);
  expect((await listColaDepositos(db, s.campanaId)).map((i) => i.estado)).toEqual(["pendiente"]);
});

it("las colas de cada campaña van por separado", async () => {
  const otra = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  await encolar(1);
  await encolarDeposito(db, otra, { imagenPath: "imagenes/x.png", nombreArchivo: null, borrador: borradorDepositoVacio() });
  expect(await listColaDepositos(db, otra)).toHaveLength(1);
  expect((await listColaDepositos(db, otra))[0].orden).toBe(1);
  expect(await contarPendientesDepositos(db, s.campanaId)).toBe(1);
});

it("no encola en una campaña cerrada", async () => {
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await expect(encolar(1)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});

it("si se borra el depósito, la fila sigue hecha sin enlace", async () => {
  const id = await encolar(1);
  const dep = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  await marcarDepositoHecho(db, id, dep);
  await deleteDeposito(db, dep);
  expect(await getItemColaDeposito(db, id)).toMatchObject({ estado: "hecho", depositoId: null });
});

it("borrar la campaña borra su cola", async () => {
  const vacia = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const id = await encolarDeposito(db, vacia, { imagenPath: "imagenes/x.png", nombreArchivo: null, borrador: borradorDepositoVacio() });
  await db.execute("DELETE FROM campanas WHERE id = ?", [vacia]);
  expect(await getItemColaDeposito(db, id)).toBeNull();
});

it("tasas: encola, guarda, marca y descarta", async () => {
  const a = await encolarTasa(db, { imagenPath: "imagenes/t1.png", nombreArchivo: "t1.png", borrador: borradorTasaVacio() });
  const b = await encolarTasa(db, { imagenPath: "imagenes/t2.png", nombreArchivo: null, borrador: borradorTasaVacio() });
  expect((await listColaTasas(db)).map((i) => [i.id, i.orden])).toEqual([
    [a, 1],
    [b, 2],
  ]);
  const borrador = { draft: { fecha: "2026-10-16", valor: "880,12", notas: "" }, auto: { estado: { valor: "ocr" as const }, confianza: { valor: 0.9 } } };
  await guardarBorradorTasa(db, a, borrador, "inv-mariandres");
  expect(await getItemColaTasa(db, a)).toMatchObject({ borrador, formato: "inv-mariandres", tasaId: null });
  const tasa = await createTasa(db, { fecha: "2026-10-16", valor: "880.12", notas: null, imagenPath: null });
  await marcarTasaHecha(db, a, tasa);
  expect(await getItemColaTasa(db, a)).toMatchObject({ estado: "hecho", tasaId: tasa });
  await expect(descartarTasa(db, a)).rejects.toMatchObject({ code: "VALIDACION" });
  expect(await contarPendientesTasas(db)).toBe(1);
  expect(await descartarTasa(db, b)).toBe("imagenes/t2.png");
  expect(await quitarHechosTasas(db)).toBe(1);
  expect(await listColaTasas(db)).toEqual([]);
});

it("al marcar hecho guarda el borrador final", async () => {
  const id = await encolar(1);
  const final = borradorDepositoVacio("a:1");
  final.draft.montoBs = "3.650,00";
  const dep = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  await marcarDepositoHecho(db, id, dep, final);
  expect(await getItemColaDeposito(db, id)).toMatchObject({ estado: "hecho", borrador: final });
});
