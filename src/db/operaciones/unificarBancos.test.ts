import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { seedBasico } from "../testing/fixtures";
import { unificarBancos } from "./unificarBancos";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
const T0 = "2026-01-01T00:00:00.000Z";

beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
});

async function insertar(banco: string, i: number) {
  await db.execute(
    `INSERT INTO depositos (asignacion_id, tasa_id, fecha, banco, referencia, cuenta_destino, monto_bs, creado_en, actualizado_en, uuid)
     VALUES (?, ?, '2026-03-02', ?, ?, 'X', '10', ?, ?, ?)`,
    [s.asignacionId, s.tasaId, banco, String(i), T0, T0, `u${i}`],
  );
}
const borrador = (banco: string) => JSON.stringify({ draft: { fecha: "", banco, referencia: "" }, destino: { sel: "" }, auto: { estado: {}, confianza: {} } });

it("unifica los nombres guardados y los borradores de la cola, y es idempotente", async () => {
  await insertar("BBVA Provincial", 1);
  await insertar("Banco Mercantil", 2);
  await insertar("Banesco", 3);
  await db.execute("INSERT INTO cola_depositos (campana_id, imagen_path, borrador, orden, creado_en, actualizado_en) VALUES (?, 'a.png', ?, 0, ?, ?)", [
    s.campanaId,
    borrador("banco provincial"),
    T0,
    T0,
  ]);

  expect(await unificarBancos(db)).toBe(2);
  const leer = () => db.select<{ banco: string; actualizado_en: string }>("SELECT banco, actualizado_en FROM depositos ORDER BY id");
  const deps = await leer();
  expect(deps.map((d) => d.banco)).toEqual(["Provincial", "Mercantil", "Banesco"]);
  expect(deps[0].actualizado_en).not.toBe(T0);
  expect(deps[1].actualizado_en).not.toBe(T0);
  expect(deps[2].actualizado_en).toBe(T0);
  const cola = await db.select<{ borrador: string }>("SELECT borrador FROM cola_depositos");
  expect(JSON.parse(cola[0].borrador).draft.banco).toBe("Provincial");

  const antes = await leer();
  expect(await unificarBancos(db)).toBe(0);
  expect(await leer()).toEqual(antes);
});
