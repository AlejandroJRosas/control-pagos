import { expect, it } from "vitest";
import { createTestDb } from "./testing/sqljsDriver";
import { verificarIntegridad } from "./integridad";

it("una BD sana da ok", async () => {
  expect(await verificarIntegridad(await createTestDb())).toEqual({ ok: true });
});

it("detecta una referencia rota", async () => {
  const db = await createTestDb();
  await db.execute("PRAGMA foreign_keys = OFF");
  await db.execute("INSERT INTO asignaciones (campana_id, gerente_id, saldo_usd) VALUES (99, 99, '1')");
  const r = await verificarIntegridad(db);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.detalle[0]).toMatch(/^asignaciones fila 1 → (campanas|gerentes)$/);
});

it("si quick_check no da ok, lo informa", async () => {
  const db = await createTestDb();
  const falsa = { ...db, select: async <T,>(sql: string) => (sql.startsWith("PRAGMA quick_check") ? ([{ quick_check: "*** in database main ***" }] as T[]) : db.select<T>(sql)) };
  const r = await verificarIntegridad(falsa);
  expect(r).toEqual({ ok: false, detalle: ["*** in database main ***"] });
});
