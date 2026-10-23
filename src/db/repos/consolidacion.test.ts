import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { seedBasico } from "../testing/fixtures";
import { getEquivalencias, getIntercambios, marcarIntercambio, setEquivalencia } from "./consolidacion";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
});

it("equivalencias: set, get y reemplazo", async () => {
  await setEquivalencia(db, "gerentes", "u1", 5);
  await setEquivalencia(db, "gerentes", "u1", 6);
  expect(await getEquivalencias(db, "gerentes")).toEqual(new Map([["u1", 6]]));
  expect((await getEquivalencias(db, "campanas")).size).toBe(0);
  expect((await getEquivalencias(db, "depositos")).size).toBe(0);
});

it("intercambios por asignación", async () => {
  await marcarIntercambio(db, [s.asignacionId], "envio", "2026-10-20T10:00:00.000Z");
  expect((await getIntercambios(db, s.campanaId)).get(s.asignacionId)).toEqual({ envio: "2026-10-20T10:00:00.000Z", recibo: null });
});
