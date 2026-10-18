import { expect, it } from "vitest";
import { createMemoryDriver } from "./testing/sqljsDriver";
import { migrate, SCHEMA_VERSION } from "./migrations";

it("crea el esquema y fija user_version", async () => {
  const db = await createMemoryDriver();
  await migrate(db);
  const [{ user_version }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  expect(user_version).toBe(SCHEMA_VERSION);
  const tablas = await db.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite%' ORDER BY name",
  );
  expect(tablas.map((t) => t.name)).toEqual(["asignaciones", "campanas", "depositos", "gerentes", "tasas"]);
});

it("es idempotente", async () => {
  const db = await createMemoryDriver();
  await migrate(db);
  await expect(migrate(db)).resolves.toBeUndefined();
});

it("aplica claves foráneas y unicidad", async () => {
  const db = await createMemoryDriver();
  await migrate(db);
  await expect(db.execute("INSERT INTO asignaciones (campana_id, gerente_id, saldo_usd) VALUES (99, 99, '1')")).rejects.toThrow(/FOREIGN KEY/);
  await db.execute("INSERT INTO tasas (fecha, valor) VALUES ('2026-03-01', '36.5')");
  await expect(db.execute("INSERT INTO tasas (fecha, valor) VALUES ('2026-03-01', '40')")).rejects.toThrow(/UNIQUE/);
});

it("execute devuelve lastInsertId y rowsAffected", async () => {
  const db = await createMemoryDriver();
  await migrate(db);
  const r = await db.execute("INSERT INTO gerentes (nombre, creado_en) VALUES (?, ?)", ["Ana", "2026-01-01T00:00:00.000Z"]);
  expect(r).toEqual({ lastInsertId: 1, rowsAffected: 1 });
});
