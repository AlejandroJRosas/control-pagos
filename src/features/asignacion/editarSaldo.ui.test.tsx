import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { getAsignacion } from "@/db/repos/asignaciones";
import { setEstadoCampana } from "@/db/repos/campanas";
import { renderApp } from "@/testing/renderApp";

it("edita el saldo asignado desde la página del gerente", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}`, { db, hoy: "2026-10-19" });

  await user.click(await screen.findByRole("button", { name: "Editar el saldo asignado" }));
  const dialogo = await screen.findByRole("dialog");
  const saldo = within(dialogo).getByLabelText(/Saldo a pagar/);
  await user.clear(saldo);
  await user.type(saldo, "250");
  await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect((await getAsignacion(db, s.asignacionId))!.saldoUsd).toMatch(/^250(\.0+)?$/);
  expect((await screen.findAllByText("$ 250,00")).length).toBeGreaterThan(0);
});

it("con la campaña cerrada no deja editar el saldo", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await renderApp(`/asignaciones/${s.asignacionId}`, { db, hoy: "2026-10-19" });

  expect(await screen.findByRole("button", { name: "Editar el saldo asignado" })).toBeDisabled();
});
