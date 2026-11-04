import { expect, it } from "vitest";
import { createTestDb } from "../testing/sqljsDriver";
import { seedBasico } from "../testing/fixtures";
import { setEstadoCampana } from "./campanas";
import { createMeta, deleteMeta, listMetas, metasPorCampana, updateMeta } from "./metas";
import { eliminarCampana } from "../operaciones/eliminarCampana";

it("crea, edita, lista y elimina metas de la campaña", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const b = await createMeta(db, s.campanaId, { montoUsd: "80", fecha: "2026-03-20", nota: null });
  const a = await createMeta(db, s.campanaId, { montoUsd: "50", fecha: "2026-03-10", nota: "primera" });
  expect((await listMetas(db, s.campanaId)).map((m) => m.id)).toEqual([a, b]);

  await updateMeta(db, b, { montoUsd: "90", fecha: "2026-03-25", nota: null });
  expect((await listMetas(db, s.campanaId))[1]).toMatchObject({ montoUsd: "90", fecha: "2026-03-25" });
  expect((await metasPorCampana(db)).get(s.campanaId)?.length).toBe(2);

  await deleteMeta(db, a);
  expect((await listMetas(db, s.campanaId)).map((m) => m.id)).toEqual([b]);
});

it("la campaña cerrada no deja tocar sus metas", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const id = await createMeta(db, s.campanaId, { montoUsd: "50", fecha: "2026-03-10", nota: null });
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await expect(createMeta(db, s.campanaId, { montoUsd: "60", fecha: "2026-03-10", nota: null })).rejects.toThrow(/cerrada/);
  await expect(updateMeta(db, id, { montoUsd: "60", fecha: "2026-03-10", nota: null })).rejects.toThrow(/cerrada/);
  await expect(deleteMeta(db, id)).rejects.toThrow(/cerrada/);
});

it("eliminar la campaña borra sus metas", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createMeta(db, s.campanaId, { montoUsd: "50", fecha: "2026-03-10", nota: null });
  await eliminarCampana(db, s.campanaId);
  expect(await listMetas(db, s.campanaId)).toEqual([]);
});
