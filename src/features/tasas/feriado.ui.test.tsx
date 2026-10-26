import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { createFeriado, feriadosSet } from "@/db/repos/feriados";
import { renderApp } from "@/testing/renderApp";

it("al registrar una tasa se puede marcar el día como feriado en vez de darle tasa", async () => {
  const db = await createTestDb();
  const { user } = await renderApp("/tasas", { db, hoy: "2026-10-19" });
  await user.click(await screen.findByRole("button", { name: /Nueva tasa/ }));
  const dialogo = await screen.findByRole("dialog");
  const fecha = within(dialogo).getByLabelText("Fecha");
  await user.clear(fecha);
  await user.type(fecha, "20/10/2026");
  await user.click(within(dialogo).getByRole("button", { name: "Es feriado" }));
  const confirmar = await screen.findByRole("alertdialog");
  expect(within(confirmar).getByText(/El 20\/10\/2026 no llevará tasa propia/)).toBeInTheDocument();
  await user.click(within(confirmar).getByRole("button", { name: "Es feriado" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect((await feriadosSet(db)).has("2026-10-20")).toBe(true);
});

it("no ofrece marcar feriado un fin de semana ni un día que ya lo es", async () => {
  const db = await createTestDb();
  await createFeriado(db, { fecha: "2026-10-12", nombre: null });
  const { user } = await renderApp("/tasas", { db, hoy: "2026-10-19" });
  await user.click(await screen.findByRole("button", { name: /Nueva tasa/ }));
  const dialogo = await screen.findByRole("dialog");
  const fecha = within(dialogo).getByLabelText("Fecha");
  await user.clear(fecha);
  await user.type(fecha, "18/10/2026");
  expect(within(dialogo).queryByRole("button", { name: "Es feriado" })).not.toBeInTheDocument();
  await user.clear(fecha);
  await user.type(fecha, "12/10/2026");
  expect(within(dialogo).queryByRole("button", { name: "Es feriado" })).not.toBeInTheDocument();
});
