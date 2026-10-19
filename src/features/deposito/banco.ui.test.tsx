import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { renderApp } from "@/testing/renderApp";

const bancoGuardado = async (db: Awaited<ReturnType<typeof createTestDb>>) =>
  (await db.select<{ banco: string }>("SELECT banco FROM depositos"))[0]?.banco;

async function llenarResto(user: Awaited<ReturnType<typeof renderApp>>["user"]) {
  await user.type(screen.getByLabelText("Referencia bancaria"), "123");
  await user.type(screen.getByLabelText("Monto en Bs"), "3.650");
  await user.type(screen.getByLabelText("Cuenta destino"), "0102");
  await user.click(screen.getByRole("button", { name: "Guardar" }));
}

it("Banco de origen sugiere bancos sin importar acentos ni mayúsculas y se elige uno", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}/depositos/nuevo`, { db, hoy: "2026-03-02" });
  await screen.findByText(/36,50 Bs\/USD/);
  await user.type(screen.getByLabelText("Banco de origen"), "venezolano de cred");
  await user.click(await screen.findByRole("option", { name: "Venezolano de Crédito" }));
  expect(screen.getByLabelText("Banco de origen")).toHaveValue("Venezolano de Crédito");
  await llenarResto(user);
  await waitFor(async () => expect(await bancoGuardado(db)).toBe("Venezolano de Crédito"));
});

it("Banco de origen acepta un banco que no está en la lista", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}/depositos/nuevo`, { db, hoy: "2026-03-02" });
  await screen.findByText(/36,50 Bs\/USD/);
  await user.type(screen.getByLabelText("Banco de origen"), "Banco Nuevo");
  await user.keyboard("{Escape}");
  await llenarResto(user);
  await waitFor(async () => expect(await bancoGuardado(db)).toBe("Banco Nuevo"));
});
