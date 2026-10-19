import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { getPlantillas, setPlantillas } from "./plantillas";
import { PLANTILLAS_POR_DEFECTO } from "@/domain/whatsapp";

let db: SqlDriver;
beforeEach(async () => {
  db = await createTestDb();
});

it("sin ajustes devuelve las plantillas por defecto", async () => {
  expect(await getPlantillas(db)).toEqual(PLANTILLAS_POR_DEFECTO);
});

it("guarda y lee las plantillas", async () => {
  await setPlantillas(db, { pendiente: "a {gerente}", completo: "b" });
  expect(await getPlantillas(db)).toEqual({ pendiente: "a {gerente}", completo: "b" });
});
