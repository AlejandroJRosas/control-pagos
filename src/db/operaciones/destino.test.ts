import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createCampana, setEstadoCampana } from "../repos/campanas";
import { createGerente, listGerentes } from "../repos/gerentes";
import { getAsignacion } from "../repos/asignaciones";
import { registrarDepositoEnCampana, resolverDestino } from "./destino";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
});

const contar = async (tabla: string) => (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tabla}`))[0].n;

it("usa la asignación existente de la campaña", async () => {
  const r = await resolverDestino(db, s.campanaId, { kind: "asignacion", asignacionId: s.asignacionId });
  expect(r.asignacionId).toBe(s.asignacionId);
  await r.deshacer();
  expect(await getAsignacion(db, s.asignacionId)).not.toBeNull();
});

it("rechaza una asignación de otra campaña", async () => {
  const otra = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  await expect(resolverDestino(db, otra, { kind: "asignacion", asignacionId: s.asignacionId })).rejects.toMatchObject({ code: "VALIDACION" });
});

it("agrega a la campaña un gerente existente y lo deshace", async () => {
  const beto = await createGerente(db, { nombre: "Beto", telefono: null });
  const r = await resolverDestino(db, s.campanaId, { kind: "gerente", gerenteId: beto, saldoUsd: "50" });
  expect(await getAsignacion(db, r.asignacionId)).toMatchObject({ gerenteId: beto, saldoUsd: "50", campanaId: s.campanaId });
  await r.deshacer();
  expect(await getAsignacion(db, r.asignacionId)).toBeNull();
  expect(await contar("gerentes")).toBe(2);
});

it("crea un gerente nuevo con su asignación y lo deshace", async () => {
  const r = await resolverDestino(db, s.campanaId, { kind: "nuevo", nombre: "Rosmary Madero", saldoUsd: "5180" });
  expect(await getAsignacion(db, r.asignacionId)).toMatchObject({ gerenteNombre: "Rosmary Madero", saldoUsd: "5180" });
  await r.deshacer();
  expect((await listGerentes(db)).map((g) => g.nombre)).toEqual(["Ana"]);
});

it("no crea un gerente con el nombre de otro (sin mayúsculas ni acentos)", async () => {
  await expect(resolverDestino(db, s.campanaId, { kind: "nuevo", nombre: " ÁNA ", saldoUsd: "1" })).rejects.toMatchObject({ code: "DUPLICADO" });
});

it("registra el depósito en un gerente nuevo", async () => {
  const asignacionId = await registrarDepositoEnCampana(db, s.campanaId, { kind: "nuevo", nombre: "Beto", saldoUsd: "100" }, depositoBase(s.tasaId));
  expect(await getAsignacion(db, asignacionId)).toMatchObject({ gerenteNombre: "Beto" });
  expect(await contar("depositos")).toBe(1);
});

it("si el depósito falla no deja el gerente ni la asignación a medias", async () => {
  const dep = depositoBase(s.tasaId, { fecha: "2026-03-09" }); // la tasa no es de esa fecha
  await expect(registrarDepositoEnCampana(db, s.campanaId, { kind: "nuevo", nombre: "Beto", saldoUsd: "100" }, dep)).rejects.toMatchObject({
    code: "VALIDACION",
  });
  expect(await contar("gerentes")).toBe(1);
  expect(await contar("asignaciones")).toBe(1);
});

it("respeta la campaña cerrada", async () => {
  await setEstadoCampana(db, s.campanaId, "cerrada");
  const beto = await createGerente(db, { nombre: "Beto", telefono: null });
  await expect(resolverDestino(db, s.campanaId, { kind: "gerente", gerenteId: beto, saldoUsd: "1" })).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  await expect(resolverDestino(db, s.campanaId, { kind: "nuevo", nombre: "Caro", saldoUsd: "1" })).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  expect(await contar("gerentes")).toBe(2);
});

it("rechaza un gerente que ya está en la campaña", async () => {
  await expect(resolverDestino(db, s.campanaId, { kind: "gerente", gerenteId: s.anaId, saldoUsd: "1" })).rejects.toMatchObject({ code: "DUPLICADO" });
});
