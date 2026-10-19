import { expect, it } from "vitest";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito } from "../repos/depositos";
import { createTasa } from "../repos/tasas";
import { borradorDepositoVacio, borradorTasaVacio, encolarDeposito, encolarTasa } from "../repos/cola";
import { imagenesUsadas } from "./imagenesUsadas";

it("reúne los nombres de archivo de depósitos, tasas y colas, sin repetir", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { imagenPath: "imagenes/dep.png" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "2", imagenPath: "imagenes/dep.png" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "3", imagenPath: null }));
  await createTasa(db, { fecha: "2026-03-03", valor: "37", notas: null, imagenPath: "imagenes/tasa.jpg" });
  await encolarDeposito(db, s.campanaId, { imagenPath: "imagenes/cola-dep.webp", nombreArchivo: null, borrador: borradorDepositoVacio() });
  await encolarTasa(db, { imagenPath: "imagenes/cola-tasa.png", nombreArchivo: null, borrador: borradorTasaVacio() });

  expect((await imagenesUsadas(db)).sort()).toEqual(["cola-dep.webp", "cola-tasa.png", "dep.png", "tasa.jpg"]);
});
