import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { createCampana } from "@/db/repos/campanas";
import { createGerente } from "@/db/repos/gerentes";
import { createAsignacion } from "@/db/repos/asignaciones";
import { renderApp } from "@/testing/renderApp";

it("el envío en lote marca solo a quien debe y tiene teléfono", async () => {
  const db = await createTestDb();
  const campanaId = await createCampana(db, { nombre: "Octubre", fechaInicio: "2026-10-01", fechaFin: null, notas: null });
  const ana = await createGerente(db, { nombre: "Ana", telefono: "0414-1234567" });
  const beto = await createGerente(db, { nombre: "Beto", telefono: null });
  await createAsignacion(db, { campanaId, gerenteId: ana, saldoUsd: "100" });
  await createAsignacion(db, { campanaId, gerenteId: beto, saldoUsd: "100" });
  const { user } = await renderApp(`/campanas/${campanaId}`, { db, hoy: "2026-10-19" });
  await user.click(await screen.findByRole("button", { name: /Campaña/ }));
  await user.click(await screen.findByRole("menuitem", { name: "Enviar estados de cuenta" }));
  const casillaAna = await screen.findByRole("checkbox", { name: /Ana/ });
  const casillaBeto = screen.getByRole("checkbox", { name: /Beto/ });
  expect(casillaAna).toBeChecked();
  expect(casillaBeto).not.toBeChecked();
  expect(casillaBeto).toBeDisabled();
  expect(screen.getByRole("button", { name: "Empezar (1)" })).toBeEnabled();
});
