import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { createGerente, setGerenteActivo } from "../repos/gerentes";
import { setAjuste } from "../repos/ajustes";
import { AJUSTE_ANTELACION_CUMPLE } from "@/domain/cumpleanos";
import { getCumpleanosProximos } from "./cumpleanos";

let db: SqlDriver;
beforeEach(async () => {
  db = await createTestDb();
});

it("avisa los cumpleaños de gerentes activos dentro de la antelación configurada", async () => {
  await createGerente(db, { nombre: "Ana", telefono: null, nacimiento: "1990-10-23" });
  await createGerente(db, { nombre: "Luis", telefono: null, nacimiento: "1990-10-27" });
  const beto = await createGerente(db, { nombre: "Beto", telefono: null, nacimiento: "1990-10-20" });
  await setGerenteActivo(db, beto, false);
  await createGerente(db, { nombre: "Caro", telefono: null });

  expect(await getCumpleanosProximos(db, "2026-10-20")).toEqual({
    antelacion: 3,
    proximos: [expect.objectContaining({ nombre: "Ana", dias: 3, edad: 36 })],
  });
  await setAjuste(db, AJUSTE_ANTELACION_CUMPLE, "7");
  expect((await getCumpleanosProximos(db, "2026-10-20")).proximos.map((c) => c.nombre)).toEqual(["Ana", "Luis"]);
});
