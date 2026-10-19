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
  expect(tablas.map((t) => t.name)).toEqual(["ajustes", "asignaciones", "campanas", "cola_depositos", "cola_tasas", "depositos", "etiquetas", "feriados", "gerente_etiquetas", "gerentes", "tasas"]);
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

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

it("v3 rellena uuid v4 únicos y actualizado_en en los datos existentes", async () => {
  const db = await createMemoryDriver();
  await migrate(db, 2);
  const t = "2026-01-01T00:00:00.000Z";
  await db.execute("INSERT INTO gerentes (nombre, creado_en) VALUES ('Ana', ?), ('Luis', ?)", [t, t]);
  await db.execute("INSERT INTO campanas (nombre, fecha_inicio, creado_en) VALUES ('Marzo', '2026-03-01', ?)", [t]);
  await db.execute("INSERT INTO asignaciones (campana_id, gerente_id, saldo_usd) VALUES (1, 1, '100')");
  await db.execute("INSERT INTO tasas (fecha, valor) VALUES ('2026-03-02', '36.5')");
  await db.execute(
    `INSERT INTO depositos (asignacion_id, tasa_id, fecha, banco, referencia, cuenta_destino, monto_bs, creado_en, actualizado_en)
     VALUES (1, 1, '2026-03-02', 'Banesco', '1', 'X', '10', ?, ?)`,
    [t, t],
  );
  await migrate(db);
  for (const tabla of ["gerentes", "campanas", "asignaciones", "tasas", "depositos"]) {
    const rows = await db.select<{ uuid: string; actualizado_en: string }>(`SELECT uuid, actualizado_en FROM ${tabla}`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.uuid).toMatch(UUID_V4);
      expect(r.actualizado_en).toBeTruthy();
    }
  }
  const g = await db.select<{ uuid: string; actualizado_en: string }>("SELECT uuid, actualizado_en FROM gerentes");
  expect(new Set(g.map((r) => r.uuid)).size).toBe(2);
  expect(g[0].actualizado_en).toBe(t);
  await expect(db.execute("UPDATE gerentes SET uuid = (SELECT uuid FROM gerentes WHERE id = 1) WHERE id = 2")).rejects.toThrow(/UNIQUE/);
});

it("una migración que quedó a medias (columna ya agregada) se puede volver a correr", async () => {
  const db = await createMemoryDriver();
  await migrate(db, 2);
  await db.execute("ALTER TABLE gerentes ADD COLUMN uuid TEXT");
  await migrate(db);
  const [{ user_version }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  expect(user_version).toBe(SCHEMA_VERSION);
});
