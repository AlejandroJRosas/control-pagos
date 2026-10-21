import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { renderApp } from "@/testing/renderApp";

it("el depósito muestra la ruta completa y Esc vuelve al gerente", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const { user, router } = await renderApp(`/asignaciones/${s.asignacionId}/depositos/nuevo`, { db, hoy: "2026-03-02" });
  const ruta = await screen.findByRole("navigation", { name: "Ruta" });
  expect(within(ruta).getAllByRole("link").map((l) => l.textContent)).toEqual(["Campañas", "Marzo", "Ana"]);
  expect(within(ruta).getByRole("link", { name: "Marzo" })).toHaveAttribute("href", `/campanas/${s.campanaId}`);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(router.state.location.pathname).toBe(`/asignaciones/${s.asignacionId}`));
});
