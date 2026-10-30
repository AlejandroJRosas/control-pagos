import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { createTasa } from "@/db/repos/tasas";
import { renderApp } from "@/testing/renderApp";

async function preparar() {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "111", cuentaDestino: "0414-1234567", banco: "Bco de Vzla" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "222", cuentaDestino: "0414-1234567", banco: "Bco de Vzla" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "333", cuentaDestino: "Juan Pérez" }));
  return { db, s };
}
type Db = Awaited<ReturnType<typeof preparar>>["db"];
const deposito = async (db: Db, referencia: string) =>
  (
    await db.select<{ cuentaDestino: string; banco: string; observaciones: string | null }>(
      "SELECT cuenta_destino AS cuentaDestino, banco, observaciones FROM depositos WHERE referencia = ?",
      [referencia],
    )
  )[0];

it("filtra por cuenta destino, marca todos y les cambia la cuenta, el banco y agrega una nota, con Deshacer", async () => {
  const { db, s } = await preparar();
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-03-02" });

  await user.click(await screen.findByLabelText("Cuenta destino"));
  await user.click(await screen.findByRole("option", { name: "0414-1234567" }));
  await waitFor(() => expect(screen.queryByLabelText("Seleccionar depósito 333")).not.toBeInTheDocument());
  await user.click(screen.getByLabelText("Seleccionar todos"));
  await user.click(screen.getByRole("button", { name: "Editar seleccionados…" }));

  const dialogo = await screen.findByRole("dialog");
  expect(within(dialogo).getByText("Editar 2 depósitos")).toBeInTheDocument();
  expect(within(dialogo).getByRole("button", { name: "Guardar en 2" })).toBeDisabled();
  await user.type(within(dialogo).getByLabelText("Cuenta destino"), "Juan Pérez");
  await user.type(within(dialogo).getByLabelText("Banco"), "BDV");
  await user.type(within(dialogo).getByLabelText("Agregar a las observaciones"), "pagado por la hermana");
  await user.click(within(dialogo).getByRole("button", { name: "Guardar en 2" }));

  expect(await screen.findByText("2 depósitos actualizados")).toBeInTheDocument();
  expect(await deposito(db, "111")).toEqual({ cuentaDestino: "Juan Pérez", banco: "Venezuela", observaciones: "pagado por la hermana" });
  expect((await deposito(db, "333")).cuentaDestino).toBe("Juan Pérez");
  expect((await deposito(db, "333")).banco).toBe("Banesco");

  await user.click(screen.getByRole("button", { name: "Deshacer" }));
  await waitFor(async () => expect(await deposito(db, "111")).toEqual({ cuentaDestino: "0414-1234567", banco: "Bco de Vzla", observaciones: null }));
});

it("con una fecha nueva muestra cómo cambia el total en USD y sin tasa no deja guardar", async () => {
  const { db, s } = await preparar();
  await createTasa(db, { fecha: "2026-03-03", valor: "73", notas: null, imagenPath: null });
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}`, { db, hoy: "2026-03-04" });
  await user.click(await screen.findByLabelText("Seleccionar depósito 111"));
  await user.click(screen.getByRole("button", { name: "Editar seleccionados…" }));
  const dialogo = await screen.findByRole("dialog");

  await user.type(within(dialogo).getByLabelText("Fecha"), "03032026");
  expect(await within(dialogo).findByText("Total en USD de los marcados: $ 100,00 → $ 50,00")).toBeInTheDocument();

  await user.clear(within(dialogo).getByLabelText("Fecha"));
  await user.type(within(dialogo).getByLabelText("Fecha"), "04032026");
  expect(await within(dialogo).findByText("No hay tasa para el 04/03/2026: cárgala primero en Tasas.")).toBeInTheDocument();
  expect(within(dialogo).getByRole("button", { name: "Guardar" })).toBeDisabled();
});
