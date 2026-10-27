import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito } from "./depositos";
import { bancosConocidos, guardarAliasBanco } from "./bancosAlias";

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
