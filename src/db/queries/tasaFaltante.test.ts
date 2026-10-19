import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { borradorDepositoVacio, encolarDeposito, marcarDepositoHecho } from "../repos/cola";
import { createDeposito } from "../repos/depositos";
import { createFeriado } from "../repos/feriados";
import { createTasa } from "../repos/tasas";
import { getTasasFaltantes } from "./tasaFaltante";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db); // tasa 2026-03-02
});

const encolar = async (fecha: string) => {
  const b = borradorDepositoVacio();
  return encolarDeposito(db, s.campanaId, { imagenPath: `imagenes/${fecha}.png`, nombreArchivo: null, borrador: { ...b, draft: { ...b.draft, fecha } } });
};

it("avisa la de hoy y las que necesitan los pendientes de la cola", async () => {
  await encolar("2026-03-04");
  const hecho = await encolar("2026-03-05");
  await marcarDepositoHecho(db, hecho, await createDeposito(db, s.asignacionId, depositoBase(s.tasaId)));
  await encolar("2026-03-02"); // ya tiene tasa
  expect(await getTasasFaltantes(db, "2026-03-09")).toEqual({ hoy: true, anteriores: ["2026-03-04"] });
});

it("respeta tasas y feriados registrados", async () => {
  await createTasa(db, { fecha: "2026-03-09", valor: "40", notas: null, imagenPath: null });
  await createFeriado(db, { fecha: "2026-03-10", nombre: null });
  expect((await getTasasFaltantes(db, "2026-03-09")).hoy).toBe(false);
  expect((await getTasasFaltantes(db, "2026-03-10")).hoy).toBe(false);
});
