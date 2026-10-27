import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { createGerente } from "@/db/repos/gerentes";
import { createAsignacion } from "@/db/repos/asignaciones";
import { renderApp } from "@/testing/renderApp";

/** Ana (la jefa) con tres depósitos; Beto está en su equipo y Eva no. */
async function preparar() {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const nueva = async (nombre: string, jefeId: number | null) =>
    createAsignacion(db, { campanaId: s.campanaId, gerenteId: await createGerente(db, { nombre, telefono: null }), saldoUsd: "50", jefeId });
  const beto = await nueva("Beto", s.asignacionId);
  const eva = await nueva("Eva", null);
  for (const referencia of ["111", "222", "333"]) await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia }));
  return { db, s, beto, eva };
}
const gerenteDe = async (db: Awaited<ReturnType<typeof preparar>>["db"], referencia: string) =>
  (await db.select<{ asignacionId: number }>("SELECT asignacion_id AS asignacionId FROM depositos WHERE referencia = ?", [referencia]))[0].asignacionId;

it("marca varios depósitos en la tabla del gerente y los pasa a uno de su equipo, con Deshacer", async () => {
  const { db, s, beto } = await preparar();
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}`, { db, hoy: "2026-03-02" });
  await user.click(await screen.findByLabelText("Seleccionar depósito 111"));
  await user.click(screen.getByLabelText("Seleccionar depósito 222"));
  await user.click(screen.getByRole("button", { name: "Mover a otro gerente…" }));
  const dialogo = await screen.findByRole("dialog");
  expect(within(dialogo).getByText("Mover 2 depósitos a otro gerente")).toBeInTheDocument();
  await user.click(within(dialogo).getByLabelText("Gerente"));
  const opciones = await screen.findAllByRole("option");
  // Primero su equipo, sin ella misma.
  expect(opciones.map((o) => o.textContent)).toEqual(["BetoDe su equipo", "Eva"]);
  await user.click(screen.getByRole("option", { name: /Beto/ }));
  await user.click(within(dialogo).getByRole("button", { name: "Mover" }));

  expect(await screen.findByText("2 depósitos movidos a Beto")).toBeInTheDocument();
  expect([await gerenteDe(db, "111"), await gerenteDe(db, "222"), await gerenteDe(db, "333")]).toEqual([beto, beto, s.asignacionId]);
  await waitFor(() => expect(screen.queryByLabelText("Seleccionar depósito 111")).not.toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Deshacer" }));
  await waitFor(async () => expect(await gerenteDe(db, "111")).toBe(s.asignacionId));
  expect(await gerenteDe(db, "222")).toBe(s.asignacionId);
  expect(await screen.findByLabelText("Seleccionar depósito 111")).toBeInTheDocument();
});

it("en el depósito se recorre la lista con ← / → y, con el gerente cambiado, pregunta si guardar antes de pasar", async () => {
  const { db, s, eva } = await preparar();
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}`, { db, hoy: "2026-03-02" });
  // Mismo día: de arriba abajo en orden de registro.
  await user.click(await screen.findByText("111"));
  expect(await screen.findByText("1 de 3")).toBeInTheDocument();
  expect(screen.getByLabelText("Referencia bancaria")).toHaveValue("111");

  // Sin cambios pasa directo.
  await user.keyboard("{ArrowRight}");
  expect(await screen.findByText("2 de 3")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText("Referencia bancaria")).toHaveValue("222"));
  await user.keyboard("{ArrowLeft}");
  expect(await screen.findByText("1 de 3")).toBeInTheDocument();

  // Se pasa a Eva y al ir al siguiente pregunta: "No guardar" no lo mueve.
  await user.click(await screen.findByLabelText("Gerente"));
  await user.click(await screen.findByRole("option", { name: "Eva" }));
  expect(screen.getByText("Al guardar pasa de Ana a Eva")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Depósito siguiente" }));
  let pregunta = await screen.findByRole("alertdialog");
  expect(within(pregunta).getByText("¿Guardar los cambios?")).toBeInTheDocument();
  await user.click(within(pregunta).getByRole("button", { name: "No guardar" }));
  expect(await screen.findByText("2 de 3")).toBeInTheDocument();
  expect(await gerenteDe(db, "111")).toBe(s.asignacionId);

  // "Guardar y seguir" lo mueve y pasa al siguiente; la lista no se corre.
  await waitFor(() => expect(screen.getByLabelText("Referencia bancaria")).toHaveValue("222"));
  await user.click(screen.getByLabelText("Gerente"));
  await user.click(await screen.findByRole("option", { name: "Eva" }));
  await user.click(document.body);
  await user.keyboard("{ArrowRight}");
  pregunta = await screen.findByRole("alertdialog");
  await user.click(within(pregunta).getByRole("button", { name: "Guardar y seguir" }));
  expect(await screen.findByText("Depósito movido a Eva")).toBeInTheDocument();
  expect(await screen.findByText("3 de 3")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText("Referencia bancaria")).toHaveValue("333"));
  expect(await gerenteDe(db, "222")).toBe(eva);
  expect(screen.getByRole("button", { name: "Depósito siguiente" })).toBeDisabled();
});
