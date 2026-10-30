import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { createGerente } from "@/db/repos/gerentes";
import { createAsignacion } from "@/db/repos/asignaciones";
import { renderApp } from "@/testing/renderApp";

it("la casilla de ocultar gerentes sin pagos dice cuántos son y se recuerda", async () => {
  localStorage.clear();
  const db = await createTestDb();
  const s = await seedBasico(db);
  const luisId = await createGerente(db, { nombre: "Luis", telefono: null });
  await createAsignacion(db, { campanaId: s.campanaId, gerenteId: luisId, saldoUsd: "50" });
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-10-19" });

  await user.click(await screen.findByRole("button", { name: /Exportar/ }));
  const casilla = await screen.findByRole("menuitemcheckbox", { name: "Ocultar gerentes sin pagos (2)" });
  expect(casilla).toHaveAttribute("aria-checked", "false");
  await user.click(casilla);
  expect(casilla).toHaveAttribute("aria-checked", "true");
  expect(localStorage.getItem("control-pagos:exportar-ocultar-sin-pagos")).toBe("1");
});
