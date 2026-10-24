import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { renderApp } from "@/testing/renderApp";

it("registrar un depósito actualiza lo pagado del gerente", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db); // Ana, saldo 100; tasa 2026-03-02 = 36,5
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}/depositos/nuevo`, { db, hoy: "2026-03-02" });
  await screen.findByText(/36,50 Bs\/USD/);
  await user.type(screen.getByLabelText("Banco de origen"), "Banesco");
  await user.type(screen.getByLabelText("Referencia bancaria"), "123");
  await user.type(screen.getByLabelText("Monto en Bs"), "3650");
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

it("un duplicado no se guarda: se actualiza el existente o se descarta con Ctrl+D", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const existente = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "123", observaciones: "original" }));
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}/depositos/nuevo`, { db, hoy: "2026-03-02" });
  await screen.findByText(/36,50 Bs\/USD/);
  const escribir = async () => {
    await user.type(screen.getByLabelText("Banco de origen"), "Banesco");
    await user.type(screen.getByLabelText("Referencia bancaria"), "0123");
    await user.type(screen.getByLabelText("Monto en Bs"), "7300");
    await user.type(screen.getByLabelText("Cuenta destino"), "0102");
  };
  await escribir();
  expect(await screen.findByText("Este depósito ya está registrado")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  // Con el botón deshabilitado se dice por qué y se lleva al bloque del duplicado.
  await user.click(screen.getByRole("button", { name: "Ya está registrado: ver arriba" }));
  expect(screen.getByRole("alert")).toHaveClass("resaltar-error");

  await user.keyboard("{Control>}d{/Control}");
  await waitFor(() => expect(screen.getByLabelText("Referencia bancaria")).toHaveValue(""));
  expect(screen.queryByText("Este depósito ya está registrado")).not.toBeInTheDocument();

  await escribir();
  await user.click(await screen.findByRole("button", { name: /Actualizar este/ }));
  await waitFor(() => expect(screen.getByLabelText("Referencia bancaria")).toHaveValue(""));
  const filas = await db.select<{ id: number; montoBs: string; observaciones: string; referencia: string }>(
    "SELECT id, monto_bs AS montoBs, observaciones, referencia FROM depositos",
  );
  expect(filas).toEqual([{ id: existente, montoBs: "7300", observaciones: "original", referencia: "0123" }]);
});

it("el monto separa los miles mientras se escribe y el punto escrito es el decimal", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}/depositos/nuevo`, { db, hoy: "2026-03-02" });
  const monto = await screen.findByLabelText("Monto en Bs");
  await user.type(monto, "90000.543");
  expect(monto).toHaveValue("90.000,543");
  await user.clear(monto);
  await user.paste("1.234");
  expect(monto).toHaveValue("1.234,00");
});

it("guardar con errores lleva al primer campo con error y lo resalta", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}/depositos/nuevo`, { db, hoy: "2026-03-02" });
  await screen.findByText(/36,50 Bs\/USD/);
  await user.type(screen.getByLabelText("Referencia bancaria"), "123");
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  const banco = screen.getByLabelText("Banco de origen");
  await waitFor(() => expect(banco).toHaveFocus());
  expect(banco.closest("[data-error]")).toHaveClass("resaltar-error");
});

it("un posible repetido del Provincial avisa pero deja guardar", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Provincial", referencia: "12345678", montoBs: "3650" }));
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}/depositos/nuevo`, { db, hoy: "2026-03-02" });
  await screen.findByText(/36,50 Bs\/USD/);
  await user.type(screen.getByLabelText("Banco de origen"), "Provincial");
  await user.type(screen.getByLabelText("Referencia bancaria"), "V-12.345.678");
  await user.type(screen.getByLabelText("Monto en Bs"), "3650");
  await user.type(screen.getByLabelText("Cuenta destino"), "0102");
  expect(await screen.findByText(/Posible repetido: ya hay un pago del Provincial de esta cédula con la misma fecha y monto/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(async () => expect((await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM depositos"))[0].n).toBe(2));
});
