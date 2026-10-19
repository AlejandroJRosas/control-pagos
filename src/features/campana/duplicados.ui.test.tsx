import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { renderApp } from "@/testing/renderApp";

it("con duplicados no se exporta hasta quedarse con uno", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "123", observaciones: "primero" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "0123", observaciones: "segundo" }));
  const { user, router } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-10-19" });

  expect(await screen.findByText(/1 grupo de depósitos duplicados/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Exportar/ })).toBeDisabled();

  await user.click(screen.getByRole("link", { name: /Revisar duplicados/ }));
  expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}/duplicados`);
  const fila = (await screen.findByText("segundo")).closest("tr")!;
  await user.click(within(fila).getByRole("button", { name: /Quedarse con este/ }));
  expect(await screen.findByText("No hay depósitos duplicados en esta campaña.")).toBeInTheDocument();
  expect((await db.select<{ observaciones: string }>("SELECT observaciones FROM depositos")).map((r) => r.observaciones)).toEqual(["segundo"]);

  await user.click(screen.getByRole("link", { name: "Volver a la campaña" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Exportar/ })).toBeEnabled());
  expect(screen.queryByText(/depósitos duplicados/)).not.toBeInTheDocument();
});
