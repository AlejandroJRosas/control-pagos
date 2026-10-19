import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { crearDuplicado, depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { renderApp } from "@/testing/renderApp";

it("con duplicados no se exporta hasta quedarse con uno", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "123", observaciones: "primero" }));
  await crearDuplicado(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "0123", observaciones: "segundo" }));
  const { user, router } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-10-19" });

  expect(await screen.findByText(/1 grupo de depósitos duplicados/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Exportar/ })).toBeDisabled();

  await user.click(screen.getByRole("link", { name: /Revisar duplicados/ }));
  expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}/duplicados`);
  const derecha = await screen.findByRole("region", { name: "Opción 2" });
  expect(within(derecha).getByText("segundo")).toBeInTheDocument();
  await user.click(within(derecha).getByRole("button", { name: /Quedarse con este/ }));
  expect(await screen.findByText("No hay depósitos duplicados en esta campaña.")).toBeInTheDocument();
  expect((await db.select<{ observaciones: string }>("SELECT observaciones FROM depositos")).map((r) => r.observaciones)).toEqual(["segundo"]);

  await user.click(screen.getByRole("link", { name: "Volver a la campaña" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Exportar/ })).toBeEnabled());
  expect(screen.queryByText(/depósitos duplicados/)).not.toBeInTheDocument();
});

it("con el teclado: 1 o ← se queda con el de la izquierda y pasa al siguiente grupo", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "1", observaciones: "a1" }));
  await crearDuplicado(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "1", observaciones: "a2" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "2", observaciones: "b1" }));
  await crearDuplicado(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "2", observaciones: "b2" }));
  const { user } = await renderApp(`/campanas/${s.campanaId}/duplicados`, { db, hoy: "2026-10-19" });

  expect(await screen.findByText(/Grupo 1 de 2/)).toBeInTheDocument();
  await user.keyboard("1");
  expect(await screen.findByText(/Grupo 1 de 1/)).toBeInTheDocument();
  await user.keyboard("{ArrowRight}");
  await screen.findByText("No hay depósitos duplicados en esta campaña.");
  const obs = await db.select<{ observaciones: string }>("SELECT observaciones FROM depositos ORDER BY observaciones");
  expect(obs.map((r) => r.observaciones)).toEqual(["a1", "b2"]);
});
