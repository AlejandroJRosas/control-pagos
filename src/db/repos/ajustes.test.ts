import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { deleteAjuste, getAjuste, setAjuste } from "./ajustes";

let db: SqlDriver;
beforeEach(async () => {
  db = await createTestDb();
});

it("sin ajuste devuelve null", async () => {
  expect(await getAjuste(db, "x")).toBeNull();
});

it("setAjuste guarda y reemplaza", async () => {
  await setAjuste(db, "x", "1");
  await setAjuste(db, "x", "2");
  expect(await getAjuste(db, "x")).toBe("2");
});

it("deleteAjuste lo quita", async () => {
  await setAjuste(db, "x", "1");
  await deleteAjuste(db, "x");
  expect(await getAjuste(db, "x")).toBeNull();
});
