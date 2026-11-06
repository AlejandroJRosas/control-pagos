import { expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { createGerente, getGerente } from "@/db/repos/gerentes";
import { createCampana } from "@/db/repos/campanas";
import { createAsignacion, getAsignacion } from "@/db/repos/asignaciones";
import { renderApp } from "@/testing/renderApp";

it("elimina desde la lista un gerente sin campañas; el que está en una no tiene la papelera", async () => {
  const db = await createTestDb();
  const ana = await createGerente(db, { nombre: "Ana", telefono: null });
  const luis = await createGerente(db, { nombre: "Luis", telefono: null });
  const campanaId = await createCampana(db, { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, notas: null });
  await createAsignacion(db, { campanaId, gerenteId: luis, saldoUsd: "100" });
  const { user } = await renderApp("/gerentes", { db });

  const filaLuis = (await screen.findByText("Luis")).closest("tr") as HTMLElement;
  expect(within(filaLuis).queryByRole("button", { name: "Eliminar a Luis" })).not.toBeInTheDocument();
  const filaAna = screen.getByText("Ana").closest("tr") as HTMLElement;
  await user.click(within(filaAna).getByRole("button", { name: "Eliminar a Ana" }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
  await screen.findByText("Ana eliminado");
  expect(await getGerente(db, ana)).toBeNull();
});

it("elimina desde la ficha del gerente y vuelve a la lista", async () => {
  const db = await createTestDb();
  const rosa = await createGerente(db, { nombre: "Rosa", telefono: null });
  const { user } = await renderApp(`/gerentes/${rosa}`, { db });
  await user.click(await screen.findByRole("button", { name: "Eliminar" }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));
  await screen.findByText("Rosa eliminado");
  expect(await getGerente(db, rosa)).toBeNull();
});

it("quita de la campaña a un gerente sin depósitos desde su página", async () => {
  const db = await createTestDb();
  const ana = await createGerente(db, { nombre: "Ana", telefono: null });
  const campanaId = await createCampana(db, { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, notas: null });
  const id = await createAsignacion(db, { campanaId, gerenteId: ana, saldoUsd: "100" });
  const { user } = await renderApp(`/asignaciones/${id}`, { db });
  await user.click(await screen.findByRole("button", { name: "Quitar de la campaña" }));
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Quitar" }));
  await screen.findByText("Ana quitado de la campaña");
  expect(await getAsignacion(db, id)).toBeNull();
});
