import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { setEstadoCampana } from "../repos/campanas";
import { getDeposito } from "../repos/depositos";
import { getAsignacion } from "../repos/asignaciones";
import { getTasa } from "../repos/tasas";
import { borradorDepositoVacio, borradorTasaVacio, encolarDeposito, encolarTasa, getItemColaDeposito, getItemColaTasa } from "../repos/cola";
import { completarDeposito, completarTasa } from "./revision";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
let item: number;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
  item = await encolarDeposito(db, s.campanaId, { imagenPath: "imagenes/c1.png", nombreArchivo: "c1.png", borrador: borradorDepositoVacio() });
});

const contar = async (tabla: string) => (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tabla}`))[0].n;
const { imagenPath: _sinImagen, ...valido } = depositoBase(0);
const deposito = () => ({ ...valido, tasaId: s.tasaId });
const enAna = () => ({ kind: "asignacion" as const, asignacionId: s.asignacionId });

it("guarda el depósito con la imagen de la cola y marca hecho", async () => {
  const r = await completarDeposito(db, item, deposito(), enAna());
  expect(r.asignacionId).toBe(s.asignacionId);
  expect(await getDeposito(db, r.depositoId)).toMatchObject({ imagenPath: "imagenes/c1.png", asignacionId: s.asignacionId, montoBs: "3650" });
  expect(await getItemColaDeposito(db, item)).toMatchObject({ estado: "hecho", depositoId: r.depositoId });
});

it("con gerente nuevo crea gerente y asignación", async () => {
  const r = await completarDeposito(db, item, deposito(), { kind: "nuevo", nombre: "Beto", saldoUsd: "100" });
  expect(await getAsignacion(db, r.asignacionId)).toMatchObject({ gerenteNombre: "Beto", campanaId: s.campanaId });
});

it("un segundo Hecho sobre el mismo elemento se rechaza y no duplica", async () => {
  await completarDeposito(db, item, deposito(), enAna());
  await expect(completarDeposito(db, item, deposito(), enAna())).rejects.toMatchObject({ code: "VALIDACION" });
  expect(await contar("depositos")).toBe(1);
});

it("dos Hecho a la vez sobre el mismo elemento dejan un solo depósito", async () => {
  const r = await Promise.allSettled([completarDeposito(db, item, deposito(), enAna()), completarDeposito(db, item, deposito(), enAna())]);
  expect(r.map((x) => x.status).sort()).toEqual(["fulfilled", "rejected"]);
  expect(await contar("depositos")).toBe(1);
});

it("campaña cerrada: rechaza, el elemento sigue pendiente y no deja gerente nuevo", async () => {
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await expect(completarDeposito(db, item, deposito(), { kind: "nuevo", nombre: "Beto", saldoUsd: "1" })).rejects.toMatchObject({
    code: "CAMPANA_CERRADA",
  });
  expect(await getItemColaDeposito(db, item)).toMatchObject({ estado: "pendiente" });
  expect(await contar("gerentes")).toBe(1);
});

it("tasa de otra fecha: rechaza, sigue pendiente y no deja gerente nuevo", async () => {
  await expect(completarDeposito(db, item, { ...deposito(), fecha: "2026-03-09" }, { kind: "nuevo", nombre: "Beto", saldoUsd: "1" })).rejects.toMatchObject({
    code: "VALIDACION",
  });
  expect(await getItemColaDeposito(db, item)).toMatchObject({ estado: "pendiente" });
  expect(await contar("gerentes")).toBe(1);
  expect(await contar("asignaciones")).toBe(1);
});

/** Delega en `db` pero falla al marcar hecho, para probar la reversión. */
const fallaAlMarcar = (tabla: string): SqlDriver => ({
  select: (sql, p) => db.select(sql, p),
  execute: (sql, p) => (sql.startsWith(`UPDATE ${tabla} SET estado`) ? Promise.reject(new Error("disco lleno")) : db.execute(sql, p)),
});

it("si marcar falla, revierte depósito, asignación y gerente", async () => {
  await expect(completarDeposito(fallaAlMarcar("cola_depositos"), item, deposito(), { kind: "nuevo", nombre: "Beto", saldoUsd: "1" })).rejects.toThrow(
    "disco lleno",
  );
  expect(await contar("depositos")).toBe(0);
  expect(await contar("asignaciones")).toBe(1);
  expect(await contar("gerentes")).toBe(1);
  expect(await getItemColaDeposito(db, item)).toMatchObject({ estado: "pendiente" });
});

const tasaItem = () => encolarTasa(db, { imagenPath: "imagenes/t.png", nombreArchivo: null, borrador: borradorTasaVacio() });

it("tasas: crea la tasa con la imagen y marca hecho", async () => {
  const t = await tasaItem();
  const id = await completarTasa(db, t, { fecha: "2026-10-16", valor: "880.12", notas: null });
  expect(await getTasa(db, id)).toMatchObject({ fecha: "2026-10-16", valor: "880.12", imagenPath: "imagenes/t.png" });
  expect(await getItemColaTasa(db, t)).toMatchObject({ estado: "hecho", tasaId: id });
});

it("tasas: fecha con tasa existente o sábado se rechaza y sigue pendiente", async () => {
  const t = await tasaItem();
  await expect(completarTasa(db, t, { fecha: "2026-03-02", valor: "1", notas: null })).rejects.toMatchObject({ code: "DUPLICADO" });
  await expect(completarTasa(db, t, { fecha: "2026-10-17", valor: "1", notas: null })).rejects.toMatchObject({ code: "VALIDACION" });
  expect(await getItemColaTasa(db, t)).toMatchObject({ estado: "pendiente" });
});

it("tasas: si marcar falla, borra la tasa creada", async () => {
  const t = await tasaItem();
  await expect(completarTasa(fallaAlMarcar("cola_tasas"), t, { fecha: "2026-10-16", valor: "1", notas: null })).rejects.toThrow("disco lleno");
  expect(await contar("tasas")).toBe(1);
});

it("guarda en la cola el borrador con el que se completó", async () => {
  const final = borradorDepositoVacio(`a:${s.asignacionId}`);
  final.draft.montoBs = "3.650,00";
  await completarDeposito(db, item, deposito(), enAna(), final);
  expect((await getItemColaDeposito(db, item))?.borrador).toEqual(final);
  const t = await tasaItem();
  const bt = { draft: { fecha: "2026-10-16", valor: "1", notas: "" }, auto: { estado: {}, confianza: {} } };
  await completarTasa(db, t, { fecha: "2026-10-16", valor: "1", notas: null }, bt);
  expect((await getItemColaTasa(db, t))?.borrador).toEqual(bt);
});
