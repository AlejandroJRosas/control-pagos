import { expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { createCampana } from "@/db/repos/campanas";
import { createGerente } from "@/db/repos/gerentes";
import { createAsignacion } from "@/db/repos/asignaciones";
import { renderApp } from "@/testing/renderApp";

it("el formulario del gerente elige su jefe y no ofrece a su propia rama", async () => {
  const db = await createTestDb();
  const campanaId = await createCampana(db, { nombre: "Octubre", fechaInicio: "2026-10-01", fechaFin: null, notas: null });
  const ana = await createAsignacion(db, { campanaId, gerenteId: await createGerente(db, { nombre: "Ana", telefono: null }), saldoUsd: "100" });
  const luis = await createAsignacion(db, { campanaId, gerenteId: await createGerente(db, { nombre: "Luis", telefono: null }), saldoUsd: "100" });
  const { user } = await renderApp(`/campanas/${campanaId}?tab=gerentes`, { db, hoy: "2026-10-19" });

  const filaLuis = (await screen.findByText("Luis")).closest("tr") as HTMLElement;
  await user.click(within(filaLuis).getByRole("button", { name: "Editar" }));
  let dialogo = await screen.findByRole("dialog");
  expect(within(dialogo).getByText("Editar a Luis en la campaña")).toBeInTheDocument();
  await user.click(within(dialogo).getByLabelText("Jefe"));
  await user.click(await screen.findByRole("option", { name: "Ana" }));
  await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));
  await screen.findByText("Gerente actualizado");
  const [fila] = await db.select<{ jefeId: number | null }>("SELECT jefe_id AS jefeId FROM asignaciones WHERE id = ?", [luis]);
  expect(fila.jefeId).toBe(ana);

  const filaAna = (await screen.findByText("Ana")).closest("tr") as HTMLElement;
  await user.click(within(filaAna).getByRole("button", { name: "Editar" }));
  dialogo = await screen.findByRole("dialog");
  await user.click(within(dialogo).getByLabelText("Jefe"));
  expect(await screen.findByRole("option", { name: "Sin jefe" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Luis" })).not.toBeInTheDocument();
});
