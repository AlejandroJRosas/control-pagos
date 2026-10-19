import { expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { renderApp } from "@/testing/renderApp";

it("registrar un depósito actualiza lo pagado del gerente", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db); // Ana, saldo 100; tasa 2026-03-02 = 36,5
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}/depositos/nuevo`, { db, hoy: "2026-03-02" });
  await screen.findByText(/36,50 Bs\/USD/);
  await user.type(screen.getByLabelText("Banco de origen"), "Banesco");
  await user.type(screen.getByLabelText("Referencia bancaria"), "123");
  await user.type(screen.getByLabelText("Monto en Bs"), "3.650");
  await user.type(screen.getByLabelText("Cuenta destino"), "0102");
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  const pagado = await screen.findByText("Pagado");
  const tarjeta = pagado.closest("[data-slot=card]") as HTMLElement;
  expect(await within(tarjeta).findByText("$ 100,00")).toBeInTheDocument();
});

it("con cambios sin guardar, volver pide confirmación", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}/depositos/nuevo`, { db, hoy: "2026-03-02" });
  await user.type(await screen.findByLabelText("Referencia bancaria"), "9");
  await user.click(screen.getByTitle("Esc"));
  expect(await screen.findByText("Cambios sin guardar")).toBeInTheDocument();
});
