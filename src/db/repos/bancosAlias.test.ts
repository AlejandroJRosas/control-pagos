import { beforeEach, describe, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito } from "./depositos";
import { aprenderAliasBanco, bancosConocidos, guardarAliasBanco } from "./bancosAlias";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
});

it("recuerda un alias y lo reemplaza si se guarda de nuevo", async () => {
  await guardarAliasBanco(db, "BANCO XYZ", "Bancamiga");
  expect((await bancosConocidos(db)).get("bancoxyz")).toBe("Bancamiga");
  await guardarAliasBanco(db, "Banco XYZ", "Banesco");
  expect((await bancosConocidos(db)).get("bancoxyz")).toBe("Banesco");
});

it("incluye los bancos ya usados apuntando a sí mismos", async () => {
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Banco Inventado", referencia: "1" }));
  expect((await bancosConocidos(db)).get("bancoinventado")).toBe("Banco Inventado");
});

it("un alias recordado gana sobre un banco usado con ese nombre", async () => {
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Banco Raro", referencia: "1" }));
  await guardarAliasBanco(db, "Banco Raro", "Bancamiga");
  expect((await bancosConocidos(db)).get("bancoraro")).toBe("Bancamiga");
});

describe("aprenderAliasBanco", () => {
  it("al corregir un nombre que no es de la lista por un banco conocido, lo recuerda", async () => {
    const db = await createTestDb();
    expect(await aprenderAliasBanco(db, "Bco Vzla", "Banco de Venezuela")).toBe(true);
    expect((await bancosConocidos(db)).get("bcovzla")).toBe("Venezuela");
  });

  it("no aprende si el viejo es un banco de la lista, si es el mismo, si está vacío o si el nuevo no se conoce", async () => {
    const db = await createTestDb();
    expect(await aprenderAliasBanco(db, "Banesco", "Venezuela")).toBe(false);
    expect(await aprenderAliasBanco(db, "venezuela ", "Venezuela")).toBe(false);
    expect(await aprenderAliasBanco(db, "", "Venezuela")).toBe(false);
    expect(await aprenderAliasBanco(db, "Bco raro", "Otro inventado")).toBe(false);
    expect(await db.select("SELECT * FROM bancos_alias")).toEqual([]);
  });
});
