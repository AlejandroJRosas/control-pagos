import { expect, it } from "vitest";
import { esEscritura } from "./tauriDriver";

it("esEscritura reconoce lo que modifica datos", () => {
  expect(esEscritura("  insert into x values (1)")).toBe(true);
  expect(esEscritura("UPDATE x SET a = 1")).toBe(true);
  expect(esEscritura("DELETE FROM x")).toBe(true);
  expect(esEscritura("REPLACE INTO x VALUES (1)")).toBe(true);
  expect(esEscritura("SELECT 1")).toBe(false);
  expect(esEscritura("PRAGMA user_version = 3")).toBe(false);
  expect(esEscritura("VACUUM INTO 'x'")).toBe(false);
});
