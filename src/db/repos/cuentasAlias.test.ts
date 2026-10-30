import { expect, it } from "vitest";
import { createTestDb } from "../testing/sqljsDriver";
import { aliasCuentas, eliminarAliasCuenta, listAliasCuentas, recordarVariantesCuenta, restaurarAliasCuentas } from "./cuentasAlias";

const MA = "M A Colecciones 2006 CA";

it("recuerda cada variante con cómo se escribió y la resuelve sin mayúsculas, acentos ni espacios", async () => {
  const db = await createTestDb();
  await recordarVariantesCuenta(db, ["MYA Colecciones 2006 ca", " MA Colecciones "], MA);
  expect(await listAliasCuentas(db)).toEqual([
    { alias: "macolecciones", variante: "MA Colecciones", cuenta: MA },
    { alias: "myacolecciones2006ca", variante: "MYA Colecciones 2006 ca", cuenta: MA },
  ]);
  expect((await aliasCuentas(db)).get("myacolecciones2006ca")).toBe(MA);
});

it("no recuerda la cuenta como variante de sí misma", async () => {
  const db = await createTestDb();
  await recordarVariantesCuenta(db, ["m a colecciones 2006 ca"], MA);
  expect(await listAliasCuentas(db)).toEqual([]);
});

it("encadena: las variantes de un nombre que pasa a ser variante apuntan al nombre final", async () => {
  const db = await createTestDb();
  await recordarVariantesCuenta(db, ["MYA Colecciones"], "MA Colecciones");
  await recordarVariantesCuenta(db, ["MA Colecciones"], MA);
  expect(await aliasCuentas(db)).toEqual(new Map([["macolecciones", MA], ["myacolecciones", MA]]));
});

it("el nombre unificado nuevo deja de ser variante (sin ciclos)", async () => {
  const db = await createTestDb();
  await recordarVariantesCuenta(db, ["MYA Colecciones"], MA);
  await recordarVariantesCuenta(db, [MA], "MYA Colecciones");
  expect(await aliasCuentas(db)).toEqual(new Map([["macolecciones2006ca", "MYA Colecciones"]]));
});

it("restaurarAliasCuentas deja todo como estaba antes de recordar", async () => {
  const db = await createTestDb();
  await recordarVariantesCuenta(db, ["MYA Colecciones"], "MA Colecciones");
  const antes = await listAliasCuentas(db);
  const previos = await recordarVariantesCuenta(db, ["MA Colecciones", "Otra"], MA);
  await restaurarAliasCuentas(db, previos);
  expect(await listAliasCuentas(db)).toEqual(antes);
});

it("eliminarAliasCuenta olvida una variante y devuelve cómo estaba para deshacer", async () => {
  const db = await createTestDb();
  await recordarVariantesCuenta(db, ["MYA Colecciones"], MA);
  const previos = await eliminarAliasCuenta(db, "myacolecciones");
  expect(await listAliasCuentas(db)).toEqual([]);
  await restaurarAliasCuentas(db, previos);
  expect(await listAliasCuentas(db)).toEqual([{ alias: "myacolecciones", variante: "MYA Colecciones", cuenta: MA }]);
});
