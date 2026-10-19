import { expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { createGerente } from "@/db/repos/gerentes";
import { createAsignacion } from "@/db/repos/asignaciones";
import { createCampana } from "@/db/repos/campanas";
import { renderApp } from "@/testing/renderApp";

it("muestra el total de las campañas activas, cada campaña y quién debe más", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db); // Ana debe 100 en Marzo
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { montoBs: "1460" })); // 40 USD
  const abril = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const luis = await createGerente(db, { nombre: "Luis", telefono: null });
  await createAsignacion(db, { campanaId: abril, gerenteId: luis, saldoUsd: "200" });

  const { user } = await renderApp("/resumen", { db, hoy: "2026-03-05" });
  expect(await screen.findByRole("heading", { name: "Resumen" })).toBeInTheDocument();
  expect(screen.getByText("2 campaña(s) activa(s)")).toBeInTheDocument();

  const deudores = screen.getByRole("heading", { name: "Gerentes con más saldo pendiente" }).parentElement as HTMLElement;
  const filas = within(deudores).getAllByRole("row").slice(1);
  expect(filas.map((f) => within(f).getAllByRole("cell")[0].textContent)).toEqual(["Luis", "Ana"]);

  await user.click(within(filas[1]).getByText("Ana"));
  await screen.findByRole("heading", { name: /Ana/ });
  // El enlace para volver (el de la barra lateral también se llama "Resumen").
  expect(screen.getByTitle("Esc")).toHaveTextContent("Resumen");
  expect(screen.getByTitle("Esc")).toHaveAttribute("href", "/resumen");
});

it("sin campañas activas lo dice", async () => {
  await renderApp("/resumen");
  expect(await screen.findByText("No hay campañas activas.")).toBeInTheDocument();
});
